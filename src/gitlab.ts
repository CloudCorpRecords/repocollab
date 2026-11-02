/**
 * repocollab core: GitLab operations against the GitLab REST v4 API.
 *
 * The base URL comes from GITLAB_API_URL (default
 * https://gitlab.com/api/v4) and the personal access token from
 * GITLAB_PERSONAL_ACCESS_TOKEN, sent as `Authorization: Bearer <token>`.
 * A project_id is a string: GitLab accepts either a numeric id or a
 * URL-encoded path, so ids are always encodeURIComponent-encoded into
 * the request path.
 *
 * A missing token is an error before any request is made, and the
 * error names GITLAB_PERSONAL_ACCESS_TOKEN so a misconfigured client
 * is easy to fix. All HTTP goes through an injected FetchFn so request
 * building and response handling are fully testable offline.
 */
import type {
  CreateBranchOptions,
  CreateIssueOptions,
  CreateMergeRequestOptions,
  CreateOrUpdateFileOptions,
  CreateRepositoryOptions,
  FetchFn,
  ForkRepositoryOptions,
  GetFileContentsOptions,
  GetIssueOptions,
  GetMergeRequestOptions,
  ListIssuesOptions,
  ListMergeRequestsOptions,
  SearchRepositoriesOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_API_BASE = "https://gitlab.com/api/v4";

export const TOKEN_ENV = "GITLAB_PERSONAL_ACCESS_TOKEN";
export const API_URL_ENV = "GITLAB_API_URL";

/** The honest missing-token error. Names the variable, never a value. */
export function requireToken(token: string | undefined): string {
  const key = typeof token === "string" ? token.trim() : "";
  if (!key) {
    throw new Error(
      "GITLAB_PERSONAL_ACCESS_TOKEN environment variable is required: set GITLAB_PERSONAL_ACCESS_TOKEN to a GitLab personal access token and retry",
    );
  }
  return key;
}

export function tokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env[TOKEN_ENV];
  const key = typeof raw === "string" ? raw.trim() : "";
  return key ? key : undefined;
}

export function apiBaseFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = typeof env[API_URL_ENV] === "string" ? env[API_URL_ENV].trim() : "";
  const base = raw ? raw : DEFAULT_API_BASE;
  return base.replace(/\/+$/, "");
}

function requireString(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function projectPath(projectId: string): string {
  return encodeURIComponent(requireString(projectId, "project_id"));
}

type QueryValue = string | number | boolean | undefined;

function buildUrl(base: string, path: string, query?: Record<string, QueryValue>): string {
  const pairs: string[] = [];
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return `${base}${path}${pairs.length ? `?${pairs.join("&")}` : ""}`;
}

async function parseBody(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callGitLab(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  const key = requireToken(token);
  const url = buildUrl(base, path, opts.query);
  const isWrite = method !== "GET";
  let response;
  try {
    response = await fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(isWrite ? { "Content-Type": "application/json" } : {}),
      },
      ...(isWrite ? { body: JSON.stringify(opts.body ?? {}) } : {}),
    });
  } catch (err) {
    throw new Error(
      `GitLab API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = await parseBody(await response.text());
  if (!response.ok) {
    let detail = "";
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message?: unknown }).message;
      if (typeof m === "string") detail = `: ${m}`;
      else if (m !== undefined) detail = `: ${JSON.stringify(m)}`;
    } else if (typeof parsed === "string" && parsed.trim()) {
      detail = `: ${parsed.trim().slice(0, 200)}`;
    }
    throw new Error(
      `GitLab API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  return parsed;
}

export async function searchRepositories(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: SearchRepositoriesOptions,
): Promise<unknown> {
  return callGitLab(fetchFn, token, base, "GET", "/projects", {
    query: { search: requireString(options.search, "search") },
  });
}

export async function createRepository(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: CreateRepositoryOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = { name: requireString(options.name, "name") };
  if (options.description !== undefined) body.description = options.description;
  if (options.visibility !== undefined) body.visibility = options.visibility;
  return callGitLab(fetchFn, token, base, "POST", "/projects", { body });
}

export async function forkRepository(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: ForkRepositoryOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (options.namespace !== undefined) body.namespace = options.namespace;
  return callGitLab(fetchFn, token, base, "POST", `/projects/${projectPath(options.project_id)}/fork`, { body });
}

export async function createBranch(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: CreateBranchOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = { branch: requireString(options.branch, "branch") };
  if (options.ref !== undefined) body.ref = options.ref;
  return callGitLab(fetchFn, token, base, "POST", `/projects/${projectPath(options.project_id)}/repository/branches`, { body });
}

export async function getFileContents(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: GetFileContentsOptions,
): Promise<unknown> {
  const filePath = encodeURIComponent(requireString(options.file_path, "file_path"));
  return callGitLab(fetchFn, token, base, "GET", `/projects/${projectPath(options.project_id)}/repository/files/${filePath}`, {
    query: { ref: options.ref },
  });
}

export async function createOrUpdateFile(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: CreateOrUpdateFileOptions,
): Promise<unknown> {
  const project = projectPath(options.project_id);
  const filePath = encodeURIComponent(requireString(options.file_path, "file_path"));
  const branch = requireString(options.branch, "branch");
  const body: Record<string, unknown> = {
    branch,
    content: options.content,
    commit_message: requireString(options.commit_message, "commit_message"),
  };
  if (options.previous_path !== undefined) body.previous_path = options.previous_path;
  // GitLab creates with POST and updates with PUT; probe existence first.
  let exists = false;
  try {
    await callGitLab(fetchFn, token, base, "GET", `/projects/${project}/repository/files/${filePath}`, {
      query: { ref: branch },
    });
    exists = true;
  } catch {
    exists = false;
  }
  return callGitLab(fetchFn, token, base, exists ? "PUT" : "POST", `/projects/${project}/repository/files/${filePath}`, { body });
}

export async function createIssue(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: CreateIssueOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = { title: requireString(options.title, "title") };
  if (options.description !== undefined) body.description = options.description;
  if (options.labels !== undefined) body.labels = options.labels;
  return callGitLab(fetchFn, token, base, "POST", `/projects/${projectPath(options.project_id)}/issues`, { body });
}

export async function listIssues(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: ListIssuesOptions,
): Promise<unknown> {
  return callGitLab(fetchFn, token, base, "GET", `/projects/${projectPath(options.project_id)}/issues`, {
    query: { state: options.state, per_page: options.per_page, page: options.page },
  });
}

export async function getIssue(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: GetIssueOptions,
): Promise<unknown> {
  return callGitLab(fetchFn, token, base, "GET", `/projects/${projectPath(options.project_id)}/issues/${options.issue_iid}`);
}

export async function createMergeRequest(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: CreateMergeRequestOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    title: requireString(options.title, "title"),
    source_branch: requireString(options.source_branch, "source_branch"),
    target_branch: requireString(options.target_branch, "target_branch"),
  };
  if (options.description !== undefined) body.description = options.description;
  return callGitLab(fetchFn, token, base, "POST", `/projects/${projectPath(options.project_id)}/merge_requests`, { body });
}

export async function listMergeRequests(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: ListMergeRequestsOptions,
): Promise<unknown> {
  return callGitLab(fetchFn, token, base, "GET", `/projects/${projectPath(options.project_id)}/merge_requests`, {
    query: { state: options.state, per_page: options.per_page, page: options.page },
  });
}

export async function getMergeRequest(
  fetchFn: FetchFn,
  token: string | undefined,
  base: string,
  options: GetMergeRequestOptions,
): Promise<unknown> {
  return callGitLab(fetchFn, token, base, "GET", `/projects/${projectPath(options.project_id)}/merge_requests/${options.merge_request_iid}`);
}

/** Render an API result as the JSON text block MCP clients display. */
export function formatResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
