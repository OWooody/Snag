/**
 * Cursor Origin client for Snag delivery. Mints a short-lived installation
 * token from the project's Origin app key, then reads pull requests, diffs,
 * and check runs and squash-merges. Origin has no deployment statuses, so
 * preview URLs are always absent.
 * Never log tokens, private keys, or response bodies to clients.
 */

import {
  ForgeError,
  type ChecksState,
  type ForgeClient,
  type ForgeRepo,
  type PullRequestDiff,
  type PullRequestInfo,
  pullRequestUrl,
} from "./forge.ts";
import type { ChangedFile } from "./policy.ts";

const ORIGIN_API = "https://api.cursor.com/v1/origin";
const MAX_PR_FILES = 3000;
const MAX_PAGES = 30;

/** Scopes execute-mode delivery needs. The installation must already grant them. */
export const ORIGIN_DELIVERY_SCOPES = [
  "repository:contents:read",
  "repository:contents:write",
  "repository:pull_requests:read",
  "repository:pull_requests:write",
  "repository:checks:read",
] as const;

export class OriginError extends ForgeError {
  constructor(message: string, status: number) {
    super(message, status, "origin");
    this.name = "OriginError";
  }
}

interface OriginPull {
  id?: string;
  number?: string | number;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  title?: string;
  mergeCommitSha?: string | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string; sha?: string };
  version?: {
    headSha?: string;
    potentialMergeCommit?: { state?: string };
  };
}

export function signOriginAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "EdDSA", kid: appId, typ: "JWT" });
  const payload = base64urlJson({
    iss: appId,
    aud: "origin-apps",
    iat: now,
    exp: now + 5 * 60,
  });
  const signingInput = `${header}.${payload}`;
  return signPkcs8(privateKeyPem, signingInput).then(
    (signature) => `${signingInput}.${base64url(signature)}`,
  );
}

export async function mintOriginInstallationToken(input: {
  appId: string;
  installationId: string;
  privateKeyPem: string;
}): Promise<string> {
  let jwt: string;
  try {
    jwt = await signOriginAppJwt(input.appId, input.privateKeyPem);
  } catch (error) {
    console.error("snag origin app jwt failed:", error instanceof Error ? error.name : "error");
    throw new OriginError("Origin app key could not be used", 401);
  }

  const response = await fetch(
    `${ORIGIN_API}/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scopes: ORIGIN_DELIVERY_SCOPES }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(
      `origin token mint failed (${response.status}): ${body.slice(0, 300)}`,
    );
    throw new OriginError(`Origin token mint failed (${response.status})`, response.status);
  }
  const minted = (await response.json()) as { token?: string };
  if (!minted.token) {
    throw new OriginError("Origin token mint returned no token", 502);
  }
  return minted.token;
}

export function originClient(options: { token: string }): ForgeClient {
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/json",
  };

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${ORIGIN_API}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `origin ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.slice(0, 300)}`,
      );
      throw new OriginError(`Origin request failed (${response.status})`, response.status);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    async getPullRequest(repo: ForgeRepo, number: number): Promise<PullRequestInfo> {
      const pr = await request<OriginPull>(pullPath(repo, number));
      return mapPullRequest(pr, number);
    },

    async findOpenPullRequest(
      repo: ForgeRepo,
      headBranch: string,
      baseRef: string,
    ): Promise<number | null> {
      let pageToken = "";
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({
          state: "open",
          head: branchName(headBranch),
          base: branchName(baseRef),
          pageSize: "50",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const body = await request<ListBody<OriginPull>>(
          `/repos/${repo.owner}/${repo.repo}/pulls?${params}`,
        );
        const pulls = listItems(body, ["pullRequests", "pulls", "items"]);
        for (const pr of pulls) {
          if (
            branchName(pr.head?.ref ?? "") === branchName(headBranch) &&
            branchName(pr.base?.ref ?? "") === branchName(baseRef)
          ) {
            const number = Number(pr.number);
            if (Number.isFinite(number)) return number;
          }
        }
        pageToken = body.nextPageToken ?? "";
        if (!pageToken || pulls.length === 0) return null;
      }
      return null;
    },

    async createPullRequest(
      repo: ForgeRepo,
      input: { head: string; base: string; title: string; body: string },
    ): Promise<{ number: number; url: string }> {
      const pr = await request<OriginPull>(`/repos/${repo.owner}/${repo.repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({ ...input, draft: false }),
      });
      const number = Number(pr.number);
      if (!Number.isFinite(number)) {
        throw new OriginError("Origin create pull request returned no number", 502);
      }
      return { number, url: pullRequestUrl("origin", repo, number) };
    },

    async getPullRequestDiff(repo: ForgeRepo, number: number): Promise<PullRequestDiff> {
      const files: ChangedFile[] = [];
      let linesChanged = 0;
      let pageToken = "";
      for (let page = 0; page < MAX_PAGES && files.length < MAX_PR_FILES; page += 1) {
        const params = new URLSearchParams({ pageSize: "100" });
        if (pageToken) params.set("pageToken", pageToken);
        const body = await request<
          ListBody<{
            filename?: string;
            status?: string;
            additions?: number;
            deletions?: number;
            previousFilename?: string;
            patch?: string;
          }>
        >(`${pullPath(repo, number)}/files?${params}`);
        const batch = listItems(body, ["files", "items"]);
        for (const file of batch) {
          if (!file.filename) continue;
          files.push({
            path: file.filename,
            status: mapFileStatus(file.status),
            previousPath: file.previousFilename ?? null,
            patch: file.patch ?? null,
          });
          linesChanged += (file.additions ?? 0) + (file.deletions ?? 0);
        }
        pageToken = body.nextPageToken ?? "";
        if (!pageToken || batch.length === 0) break;
      }
      return { files, linesChanged };
    },

    async branchIsAhead(repo: ForgeRepo, base: string, head: string): Promise<boolean> {
      const basehead = `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
      try {
        const compare = await request<{ aheadBy?: number }>(
          `/repos/${repo.owner}/${repo.repo}/compare/${basehead}`,
        );
        return (compare.aheadBy ?? 0) > 0;
      } catch (error) {
        if (error instanceof OriginError && error.status === 404) return false;
        throw error;
      }
    },

    async getChecksState(repo: ForgeRepo, sha: string): Promise<ChecksState> {
      const runs: Array<{ status?: string; conclusion?: string | null }> = [];
      let pageToken = "";
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({ pageSize: "100" });
        if (pageToken) params.set("pageToken", pageToken);
        const body = await request<
          ListBody<{ status?: string; conclusion?: string | null }>
        >(
          `/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(sha)}/check-runs?${params}`,
        );
        const batch = listItems(body, ["checkRuns", "items"]);
        runs.push(...batch);
        pageToken = body.nextPageToken ?? "";
        if (!pageToken || batch.length === 0) break;
      }
      return checksState(runs);
    },

    async findPreviewUrl(): Promise<string | null> {
      return null;
    },

    async markReadyForReview(repo: ForgeRepo, pr: PullRequestInfo): Promise<void> {
      await request(pullPath(repo, pr.number), {
        method: "PATCH",
        body: JSON.stringify({ draft: false }),
      });
    },

    async squashMerge(
      repo: ForgeRepo,
      number: number,
      input: { sha: string; title: string },
    ): Promise<{ merged: boolean; sha: string | null }> {
      const result = await request<{ mergeCommitSha?: string; sha?: string }>(
        `${pullPath(repo, number)}/merge`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedHeadSha: input.sha,
            mergeMethod: "squash",
          }),
        },
      );
      return {
        merged: true,
        sha: result?.mergeCommitSha ?? result?.sha ?? null,
      };
    },
  };
}

function pullPath(repo: ForgeRepo, number: number): string {
  return `/repos/${repo.owner}/${repo.repo}/pulls/${number}`;
}

function mapPullRequest(pr: OriginPull, fallbackNumber: number): PullRequestInfo {
  const number = Number(pr.number ?? fallbackNumber);
  const mergeState = pr.version?.potentialMergeCommit?.state ?? null;
  return {
    number,
    nodeId: pr.id ?? String(number),
    state: pr.state === "open" ? "open" : "closed",
    merged: Boolean(pr.merged),
    mergeable: mergeState === "prepared" ? true : mergeState === "merge_conflict" ? false : null,
    mergeableState: mergeState,
    draft: Boolean(pr.draft),
    headSha: pr.version?.headSha ?? pr.head?.sha ?? "",
    headRef: branchName(pr.head?.ref ?? ""),
    baseRef: branchName(pr.base?.ref ?? ""),
    title: pr.title ?? "",
    mergeCommitSha: pr.mergeCommitSha ?? null,
  };
}

function checksState(
  runs: Array<{ status?: string; conclusion?: string | null }>,
): ChecksState {
  if (runs.length === 0) return "none";
  const states: ChecksState[] = [];
  for (const run of runs) {
    if (run.status !== "completed") {
      states.push("pending");
      continue;
    }
    if (
      run.conclusion === "success" ||
      run.conclusion === "neutral" ||
      run.conclusion === "skipped"
    ) {
      states.push("success");
    } else {
      states.push("failure");
    }
  }
  if (states.includes("failure")) return "failure";
  if (states.includes("pending")) return "pending";
  return "success";
}

function mapFileStatus(status: string | undefined): ChangedFile["status"] {
  switch (status) {
    case "added":
    case "copied":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    case "modified":
    case "changed":
      return "modified";
    default:
      return "unknown";
  }
}

function branchName(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

interface ListBody<T> {
  nextPageToken?: string;
  pullRequests?: T[];
  pulls?: T[];
  files?: T[];
  checkRuns?: T[];
  items?: T[];
}

function listItems<T>(body: ListBody<T>, keys: Array<keyof ListBody<T>>): T[] {
  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signPkcs8(pem: string, signingInput: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(pem),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return new Uint8Array(signature);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}
