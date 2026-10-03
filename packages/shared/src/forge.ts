/**
 * Which git host a Snag project repository lives on.
 * Keep the URL rules identical to supabase/functions/_shared/forge.ts.
 */

export type ForgeHost = "github" | "origin";

const GITHUB_REPO =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const ORIGIN_REPO =
  /^https:\/\/origin\.cursor\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const CODEBASE_REPO =
  /^https:\/\/cursor\.com\/codebase\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

export function forgeHostFromRepoUrl(url: string): ForgeHost | null {
  const trimmed = url.trim();
  if (GITHUB_REPO.test(trimmed)) return "github";
  if (ORIGIN_REPO.test(trimmed) || CODEBASE_REPO.test(trimmed)) return "origin";
  return null;
}
