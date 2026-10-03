/**
 * Minimal GitHub REST/GraphQL client for Snag delivery: PR diffs, checks,
 * preview deployments, and merges. Plain fetch, no Deno-specific imports.
 * Never log or return tokens or response bodies to clients.
 */

import {
  type ChecksState,
  ForgeError,
  type ForgeClient,
  type ForgeRepo,
  type PullRequestDiff,
  type PullRequestInfo,
  parseForgePullRequestUrl,
  parseForgeRepoUrl,
} from "./forge.ts";
import type { ChangedFile } from "./policy.ts";

const GITHUB_API = "https://api.github.com";
const MAX_PR_FILES = 3000;

export type { ChecksState, PullRequestDiff, PullRequestInfo };
export type GitHubRepo = ForgeRepo;
export type GitHubClient = ForgeClient;

export class GitHubError extends ForgeError {
  constructor(message: string, status: number) {
    super(message, status, "github");
    this.name = "GitHubError";
  }
}

export function parseRepoUrl(url: string): GitHubRepo | null {
  const parsed = parseForgeRepoUrl(url);
  if (!parsed || parsed.host !== "github") return null;
  return { owner: parsed.owner, repo: parsed.repo };
}

export function parsePullRequestUrl(
  url: string,
): (GitHubRepo & { number: number }) | null {
  const parsed = parseForgePullRequestUrl(url);
  if (!parsed || parsed.host !== "github") return null;
  return { owner: parsed.owner, repo: parsed.repo, number: parsed.number };
}

function mapFileStatus(status: string | undefined): ChangedFile["status"] {
  switch (status) {
    case "added":
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

export function githubClient(options: { token: string }): ForgeClient {
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "snag-relay",
  };

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
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
        `github ${init.method ?? "GET"} ${path} failed (${response.status}): ${
          body.slice(0, 300)
        }`,
      );
      throw new GitHubError(`GitHub request failed (${response.status})`, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    async getPullRequest(
      repo: GitHubRepo,
      number: number,
    ): Promise<PullRequestInfo> {
      const pr = await request<{
        number: number;
        node_id: string;
        state: "open" | "closed";
        merged: boolean;
        mergeable: boolean | null;
        mergeable_state?: string;
        draft?: boolean;
        title: string;
        merge_commit_sha?: string | null;
        head: { sha: string; ref: string };
        base: { ref: string };
      }>(`/repos/${repo.owner}/${repo.repo}/pulls/${number}`);
      return {
        number: pr.number,
        nodeId: pr.node_id,
        state: pr.state,
        merged: pr.merged,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state ?? null,
        draft: pr.draft ?? false,
        headSha: pr.head.sha,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        title: pr.title,
        mergeCommitSha: pr.merge_commit_sha ?? null,
      };
    },

    async findOpenPullRequest(
      repo: GitHubRepo,
      headBranch: string,
      baseRef: string,
    ): Promise<number | null> {
      const params = new URLSearchParams({
        head: `${repo.owner}:${headBranch}`,
        base: baseRef,
        state: "open",
      });
      const prs = await request<Array<{ number: number }>>(
        `/repos/${repo.owner}/${repo.repo}/pulls?${params}`,
      );
      return prs[0]?.number ?? null;
    },

    async createPullRequest(
      repo: GitHubRepo,
      input: { head: string; base: string; title: string; body: string },
    ): Promise<{ number: number; url: string }> {
      const pr = await request<{ number: number; html_url: string }>(
        `/repos/${repo.owner}/${repo.repo}/pulls`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return { number: pr.number, url: pr.html_url };
    },

    async getPullRequestDiff(
      repo: GitHubRepo,
      number: number,
    ): Promise<PullRequestDiff> {
      const files: ChangedFile[] = [];
      let linesChanged = 0;
      for (let page = 1; files.length < MAX_PR_FILES; page += 1) {
        const batch = await request<
          Array<{
            filename: string;
            status?: string;
            additions?: number;
            deletions?: number;
            previous_filename?: string;
            patch?: string;
          }>
        >(
          `/repos/${repo.owner}/${repo.repo}/pulls/${number}/files?per_page=100&page=${page}`,
        );
        for (const file of batch) {
          files.push({
            path: file.filename,
            status: mapFileStatus(file.status),
            previousPath: file.previous_filename ?? null,
            patch: file.patch ?? null,
          });
          linesChanged += (file.additions ?? 0) + (file.deletions ?? 0);
        }
        if (batch.length < 100) break;
      }
      return { files, linesChanged };
    },

    /** True when `head` has commits that `base` does not. False when the branch does not exist. */
    async branchIsAhead(
      repo: GitHubRepo,
      base: string,
      head: string,
    ): Promise<boolean> {
      try {
        const compare = await request<{ ahead_by: number }>(
          `/repos/${repo.owner}/${repo.repo}/compare/${encodeURIComponent(base)}...${
            encodeURIComponent(head)
          }`,
        );
        return compare.ahead_by > 0;
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return false;
        throw error;
      }
    },

    async getChecksState(repo: GitHubRepo, sha: string): Promise<ChecksState> {
      const [combined, checkRuns] = await Promise.all([
        request<{ state: string; total_count: number }>(
          `/repos/${repo.owner}/${repo.repo}/commits/${sha}/status`,
        ),
        request<{
          total_count: number;
          check_runs: Array<{ status: string; conclusion: string | null }>;
        }>(`/repos/${repo.owner}/${repo.repo}/commits/${sha}/check-runs?per_page=100`),
      ]);

      const states: ChecksState[] = [];
      if (combined.total_count > 0) {
        states.push(
          combined.state === "success"
            ? "success"
            : combined.state === "pending"
            ? "pending"
            : "failure",
        );
      }
      for (const run of checkRuns.check_runs) {
        if (run.status !== "completed") {
          states.push("pending");
        } else if (
          run.conclusion === "success" ||
          run.conclusion === "neutral" ||
          run.conclusion === "skipped"
        ) {
          states.push("success");
        } else {
          states.push("failure");
        }
      }

      if (states.length === 0) return "none";
      if (states.includes("failure")) return "failure";
      if (states.includes("pending")) return "pending";
      return "success";
    },

    /** URL of the newest successful deployment for this commit (Vercel, Netlify, Render, …). */
    async findPreviewUrl(repo: GitHubRepo, sha: string): Promise<string | null> {
      const deployments = await request<Array<{ id: number }>>(
        `/repos/${repo.owner}/${repo.repo}/deployments?sha=${sha}&per_page=20`,
      );
      for (const deployment of deployments) {
        const statuses = await request<
          Array<{ state: string; environment_url?: string; target_url?: string }>
        >(
          `/repos/${repo.owner}/${repo.repo}/deployments/${deployment.id}/statuses?per_page=10`,
        );
        const success = statuses.find((status) => status.state === "success");
        const url = success?.environment_url || success?.target_url;
        if (url && /^https:\/\//.test(url)) return url;
      }
      return null;
    },

    async markReadyForReview(_repo: ForgeRepo, pr: PullRequestInfo): Promise<void> {
      await request(`/graphql`, {
        method: "POST",
        body: JSON.stringify({
          query:
            "mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id } } }",
          variables: { id: pr.nodeId },
        }),
      });
    },

    async squashMerge(
      repo: GitHubRepo,
      number: number,
      input: { sha: string; title: string },
    ): Promise<{ merged: boolean; sha: string | null }> {
      const result = await request<{ merged: boolean; sha?: string }>(
        `/repos/${repo.owner}/${repo.repo}/pulls/${number}/merge`,
        {
          method: "PUT",
          body: JSON.stringify({
            merge_method: "squash",
            sha: input.sha,
            commit_title: input.title,
          }),
        },
      );
      return { merged: result.merged, sha: result.sha ?? null };
    },
  };
}
