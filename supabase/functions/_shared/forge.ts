/**
 * Git host shared by delivery: GitHub or Cursor Origin.
 * URL rules match packages/shared/src/forge.ts.
 */

import type { ChangedFile } from "./policy.ts";

export type ForgeHost = "github" | "origin";

export interface ForgeRepo {
  owner: string;
  repo: string;
}

export interface PullRequestInfo {
  number: number;
  nodeId: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  draft: boolean;
  headSha: string;
  headRef: string;
  baseRef: string;
  title: string;
  mergeCommitSha: string | null;
}

export type ChecksState = "success" | "pending" | "failure" | "none";

export interface PullRequestDiff {
  files: ChangedFile[];
  linesChanged: number;
}

export interface ForgeClient {
  getPullRequest(repo: ForgeRepo, number: number): Promise<PullRequestInfo>;
  findOpenPullRequest(
    repo: ForgeRepo,
    headBranch: string,
    baseRef: string,
  ): Promise<number | null>;
  createPullRequest(
    repo: ForgeRepo,
    input: { head: string; base: string; title: string; body: string },
  ): Promise<{ number: number; url: string }>;
  getPullRequestDiff(repo: ForgeRepo, number: number): Promise<PullRequestDiff>;
  branchIsAhead(repo: ForgeRepo, base: string, head: string): Promise<boolean>;
  getChecksState(repo: ForgeRepo, sha: string): Promise<ChecksState>;
  findPreviewUrl(repo: ForgeRepo, sha: string): Promise<string | null>;
  markReadyForReview(repo: ForgeRepo, pr: PullRequestInfo): Promise<void>;
  squashMerge(
    repo: ForgeRepo,
    number: number,
    input: { sha: string; title: string },
  ): Promise<{ merged: boolean; sha: string | null }>;
}

export class ForgeError extends Error {
  readonly status: number;
  readonly host: ForgeHost;

  constructor(message: string, status: number, host: ForgeHost) {
    super(message);
    this.name = "ForgeError";
    this.status = status;
    this.host = host;
  }
}

const GITHUB_REPO =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const ORIGIN_REPO =
  /^https:\/\/origin\.cursor\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const CODEBASE_REPO =
  /^https:\/\/cursor\.com\/codebase\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

const GITHUB_PR =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/pull\/(\d+)/i;
const ORIGIN_PR =
  /^https:\/\/origin\.cursor\.com\/([^/\s]+)\/([^/\s]+?)\/pulls?\/(\d+)/i;
const CODEBASE_PR =
  /^https:\/\/cursor\.com\/codebase\/([^/\s]+)\/([^/\s]+?)\/pulls?\/(\d+)/i;

export interface ParsedForgeRepo extends ForgeRepo {
  host: ForgeHost;
}

export interface ParsedPullRequest extends ParsedForgeRepo {
  number: number;
}

export function forgeHostFromRepoUrl(url: string): ForgeHost | null {
  return parseForgeRepoUrl(url)?.host ?? null;
}

export function parseForgeRepoUrl(url: string): ParsedForgeRepo | null {
  const trimmed = url.trim();
  const github = trimmed.match(GITHUB_REPO);
  if (github) return { host: "github", owner: github[1], repo: github[2] };
  const origin = trimmed.match(ORIGIN_REPO) ?? trimmed.match(CODEBASE_REPO);
  if (origin) return { host: "origin", owner: origin[1], repo: origin[2] };
  return null;
}

export function parseForgePullRequestUrl(url: string): ParsedPullRequest | null {
  const trimmed = url.trim();
  const github = trimmed.match(GITHUB_PR);
  if (github) {
    return {
      host: "github",
      owner: github[1],
      repo: github[2],
      number: Number(github[3]),
    };
  }
  const origin = trimmed.match(ORIGIN_PR) ?? trimmed.match(CODEBASE_PR);
  if (origin) {
    return {
      host: "origin",
      owner: origin[1],
      repo: origin[2],
      number: Number(origin[3]),
    };
  }
  return null;
}

export function pullRequestUrl(host: ForgeHost, repo: ForgeRepo, number: number): string {
  if (host === "origin") {
    return `https://origin.cursor.com/${repo.owner}/${repo.repo}/pull/${number}`;
  }
  return `https://github.com/${repo.owner}/${repo.repo}/pull/${number}`;
}

export function hostLabel(host: ForgeHost): "GitHub" | "Origin" {
  return host === "origin" ? "Origin" : "GitHub";
}

export function sameRepo(
  parsed: ParsedForgeRepo,
  host: ForgeHost,
  repo: ForgeRepo,
): boolean {
  return parsed.host === host &&
    parsed.owner.toLowerCase() === repo.owner.toLowerCase() &&
    parsed.repo.toLowerCase() === repo.repo.toLowerCase();
}
