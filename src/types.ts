/**
 * repocollab types.
 *
 * Each operation mirrors one tool in the core subset of the documented
 * GitLab MCP surface: project search and creation, forking, branches,
 * file reads and writes, issues, and merge requests. Every operation
 * takes the small set of fields documented for it and returns the raw
 * GitLab API object (or list) parsed from JSON.
 *
 * HTTP access is described by a minimal response surface so tests can
 * inject a fake fetch and never touch the network.
 */

export interface SearchRepositoriesOptions {
  search: string;
}

export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  visibility?: string;
}

export interface ForkRepositoryOptions {
  project_id: string;
  namespace?: string;
}

export interface CreateBranchOptions {
  project_id: string;
  branch: string;
  ref?: string;
}

export interface GetFileContentsOptions {
  project_id: string;
  file_path: string;
  ref?: string;
}

export interface CreateOrUpdateFileOptions {
  project_id: string;
  file_path: string;
  content: string;
  commit_message: string;
  branch: string;
  previous_path?: string;
}

export interface CreateIssueOptions {
  project_id: string;
  title: string;
  description?: string;
  labels?: string;
}

export interface ListIssuesOptions {
  project_id: string;
  state?: string;
  per_page?: number;
  page?: number;
}

export interface GetIssueOptions {
  project_id: string;
  issue_iid: number;
}

export interface CreateMergeRequestOptions {
  project_id: string;
  title: string;
  source_branch: string;
  target_branch: string;
  description?: string;
}

export interface ListMergeRequestsOptions {
  project_id: string;
  state?: string;
  per_page?: number;
  page?: number;
}

export interface GetMergeRequestOptions {
  project_id: string;
  merge_request_iid: number;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
