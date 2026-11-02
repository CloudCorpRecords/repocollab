#!/usr/bin/env node
/**
 * repocollab CLI. One subcommand per MCP tool, plus `mcp`:
 *
 *   repocollab search_repositories --search <text>
 *   repocollab create_repository --name <name> [--description <text>] [--visibility <level>]
 *   repocollab fork_repository --project-id <id> [--namespace <ns>]
 *   repocollab create_branch --project-id <id> --branch <name> [--ref <ref>]
 *   repocollab get_file_contents --project-id <id> --file-path <path> [--ref <ref>]
 *   repocollab create_or_update_file --project-id <id> --file-path <path> --content <text> --commit-message <msg> --branch <name> [--previous-path <path>]
 *   repocollab create_issue --project-id <id> --title <title> [--description <text>] [--labels <labels>]
 *   repocollab list_issues --project-id <id> [--state <state>] [--per-page n] [--page n]
 *   repocollab get_issue --project-id <id> --issue-iid n
 *   repocollab create_merge_request --project-id <id> --title <title> --source-branch <b> --target-branch <b> [--description <text>]
 *   repocollab list_merge_requests --project-id <id> [--state <state>] [--per-page n] [--page n]
 *   repocollab get_merge_request --project-id <id> --merge-request-iid n
 *   repocollab mcp
 *
 * Reads GITLAB_PERSONAL_ACCESS_TOKEN (and optionally GITLAB_API_URL).
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  apiBaseFromEnv,
  createBranch,
  createIssue,
  createMergeRequest,
  createOrUpdateFile,
  createRepository,
  formatResult,
  forkRepository,
  getFileContents,
  getIssue,
  getMergeRequest,
  listIssues,
  listMergeRequests,
  searchRepositories,
  tokenFromEnv,
  VERSION,
} from "./gitlab.js";
import type { FetchFn } from "./types.js";

const COMMANDS = [
  "search_repositories",
  "create_repository",
  "fork_repository",
  "create_branch",
  "get_file_contents",
  "create_or_update_file",
  "create_issue",
  "list_issues",
  "get_issue",
  "create_merge_request",
  "list_merge_requests",
  "get_merge_request",
];

const NUMERIC_FIELDS = new Set(["per_page", "page", "issue_iid", "merge_request_iid"]);

function usage(): never {
  console.error(`Usage:
  repocollab search_repositories --search <text>
  repocollab create_repository --name <name> [--description <text>] [--visibility <level>]
  repocollab fork_repository --project-id <id> [--namespace <ns>]
  repocollab create_branch --project-id <id> --branch <name> [--ref <ref>]
  repocollab get_file_contents --project-id <id> --file-path <path> [--ref <ref>]
  repocollab create_or_update_file --project-id <id> --file-path <path> --content <text> --commit-message <msg> --branch <name> [--previous-path <path>]
  repocollab create_issue --project-id <id> --title <title> [--description <text>] [--labels <labels>]
  repocollab list_issues --project-id <id> [--state <state>] [--per-page n] [--page n]
  repocollab get_issue --project-id <id> --issue-iid n
  repocollab create_merge_request --project-id <id> --title <title> --source-branch <b> --target-branch <b> [--description <text>]
  repocollab list_merge_requests --project-id <id> [--state <state>] [--per-page n] [--page n]
  repocollab get_merge_request --project-id <id> --merge-request-iid n
  repocollab mcp
  repocollab --version`);
  process.exit(2);
}

/** Parse `--kebab-name value` pairs into a snake_case argument object. */
function parseFlags(args: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) usage();
    const key = arg.slice(2).replace(/-/g, "_");
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) usage();
    i++;
    out[key] = NUMERIC_FIELDS.has(key) ? Number(value) : value;
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !COMMANDS.includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const token = tokenFromEnv();
  const base = apiBaseFromEnv();
  const a = parseFlags(rest) as never;
  try {
    let out: unknown;
    switch (cmd) {
      case "search_repositories": out = await searchRepositories(fetchFn, token, base, a); break;
      case "create_repository": out = await createRepository(fetchFn, token, base, a); break;
      case "fork_repository": out = await forkRepository(fetchFn, token, base, a); break;
      case "create_branch": out = await createBranch(fetchFn, token, base, a); break;
      case "get_file_contents": out = await getFileContents(fetchFn, token, base, a); break;
      case "create_or_update_file": out = await createOrUpdateFile(fetchFn, token, base, a); break;
      case "create_issue": out = await createIssue(fetchFn, token, base, a); break;
      case "list_issues": out = await listIssues(fetchFn, token, base, a); break;
      case "get_issue": out = await getIssue(fetchFn, token, base, a); break;
      case "create_merge_request": out = await createMergeRequest(fetchFn, token, base, a); break;
      case "list_merge_requests": out = await listMergeRequests(fetchFn, token, base, a); break;
      default: out = await getMergeRequest(fetchFn, token, base, a); break;
    }
    console.log(formatResult(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
