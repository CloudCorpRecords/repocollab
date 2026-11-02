/**
 * repocollab MCP server. Tools (12, the documented GitLab core subset):
 * search_repositories, create_repository, fork_repository,
 * create_branch, get_file_contents, create_or_update_file,
 * create_issue, list_issues, get_issue, create_merge_request,
 * list_merge_requests, get_merge_request.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * The personal access token is read from GITLAB_PERSONAL_ACCESS_TOKEN
 * at call time; a missing token returns an honest isError result
 * naming the variable instead of failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const SearchRepositoriesArgs = z.object({ search: z.string() });
const CreateRepositoryArgs = z.object({
  name: z.string(),
  description: z.string().optional(),
  visibility: z.string().optional(),
});
const ForkRepositoryArgs = z.object({
  project_id: z.string(),
  namespace: z.string().optional(),
});
const CreateBranchArgs = z.object({
  project_id: z.string(),
  branch: z.string(),
  ref: z.string().optional(),
});
const GetFileContentsArgs = z.object({
  project_id: z.string(),
  file_path: z.string(),
  ref: z.string().optional(),
});
const CreateOrUpdateFileArgs = z.object({
  project_id: z.string(),
  file_path: z.string(),
  content: z.string(),
  commit_message: z.string(),
  branch: z.string(),
  previous_path: z.string().optional(),
});
const CreateIssueArgs = z.object({
  project_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  labels: z.string().optional(),
});
const ListIssuesArgs = z.object({
  project_id: z.string(),
  state: z.string().optional(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});
const GetIssueArgs = z.object({ project_id: z.string(), issue_iid: z.number() });
const CreateMergeRequestArgs = z.object({
  project_id: z.string(),
  title: z.string(),
  source_branch: z.string(),
  target_branch: z.string(),
  description: z.string().optional(),
});
const ListMergeRequestsArgs = z.object({
  project_id: z.string(),
  state: z.string().optional(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});
const GetMergeRequestArgs = z.object({
  project_id: z.string(),
  merge_request_iid: z.number(),
});

const TOOLS = [
  {
    name: "search_repositories",
    description: "Search for GitLab projects by name, path, or description.",
    inputSchema: {
      type: "object" as const,
      properties: { search: { type: "string", description: "The search query string matched against project name, path, and description." } },
      required: ["search"],
    },
  },
  {
    name: "create_repository",
    description: "Create a new GitLab project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The name of the new GitLab project." },
        description: { type: "string", description: "Optional description of the new project." },
        visibility: { type: "string", description: "Optional project visibility level, such as private, internal, or public." },
      },
      required: ["name"],
    },
  },
  {
    name: "fork_repository",
    description: "Fork a GitLab project, optionally into a namespace.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        namespace: { type: "string", description: "Optional target namespace (user or group path) to fork the project into." },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_branch",
    description: "Create a new branch in a GitLab project from a reference.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        branch: { type: "string", description: "The name of the new branch to create." },
        ref: { type: "string", description: "Optional source reference (branch, tag, or commit) to create the branch from." },
      },
      required: ["project_id", "branch"],
    },
  },
  {
    name: "get_file_contents",
    description: "Get the contents of a file in a GitLab project at a reference.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        file_path: { type: "string", description: "The path of the file within the repository." },
        ref: { type: "string", description: "Optional reference (branch, tag, or commit) to read the file at." },
      },
      required: ["project_id", "file_path"],
    },
  },
  {
    name: "create_or_update_file",
    description: "Create a file in a GitLab project, or update it if it already exists.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        file_path: { type: "string", description: "The path of the file within the repository to create or update." },
        content: { type: "string", description: "The full text content to write to the file." },
        commit_message: { type: "string", description: "The commit message for the file creation or update." },
        branch: { type: "string", description: "The branch to commit the file change to." },
        previous_path: { type: "string", description: "Optional previous path of the file when renaming or moving it." },
      },
      required: ["project_id", "file_path", "content", "commit_message", "branch"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new issue in a GitLab project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        title: { type: "string", description: "The title of the new issue." },
        description: { type: "string", description: "Optional body text describing the issue." },
        labels: { type: "string", description: "Optional comma-separated list of label names to apply to the issue." },
      },
      required: ["project_id", "title"],
    },
  },
  {
    name: "list_issues",
    description: "List issues in a GitLab project, optionally filtered by state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        state: { type: "string", description: "Optional issue state filter, such as opened or closed." },
        per_page: { type: "number", description: "Optional number of results to return per page." },
        page: { type: "number", description: "Optional page number of results to return." },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_issue",
    description: "Get a single issue in a GitLab project by its IID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        issue_iid: { type: "number", description: "The project-scoped internal ID (IID) of the issue to retrieve." },
      },
      required: ["project_id", "issue_iid"],
    },
  },
  {
    name: "create_merge_request",
    description: "Create a new merge request in a GitLab project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        title: { type: "string", description: "The title of the new merge request." },
        source_branch: { type: "string", description: "The branch containing the changes to merge." },
        target_branch: { type: "string", description: "The branch to merge the changes into." },
        description: { type: "string", description: "Optional body text describing the merge request." },
      },
      required: ["project_id", "title", "source_branch", "target_branch"],
    },
  },
  {
    name: "list_merge_requests",
    description: "List merge requests in a GitLab project, optionally filtered by state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        state: { type: "string", description: "Optional merge request state filter, such as opened, closed, or merged." },
        per_page: { type: "number", description: "Optional number of results to return per page." },
        page: { type: "number", description: "Optional page number of results to return." },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_merge_request",
    description: "Get a single merge request in a GitLab project by its IID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The GitLab project identifier: a numeric ID or URL-encoded project path." },
        merge_request_iid: { type: "number", description: "The project-scoped internal ID (IID) of the merge request to retrieve." },
      },
      required: ["project_id", "merge_request_iid"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : formatResult(value),
      },
    ],
  };
}
function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "repocollab", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const token = tokenFromEnv();
  const base = apiBaseFromEnv();
  try {
    switch (name) {
      case "search_repositories":
        return textResult(await searchRepositories(fetchFn, token, base, SearchRepositoriesArgs.parse(args ?? {})));
      case "create_repository":
        return textResult(await createRepository(fetchFn, token, base, CreateRepositoryArgs.parse(args ?? {})));
      case "fork_repository":
        return textResult(await forkRepository(fetchFn, token, base, ForkRepositoryArgs.parse(args ?? {})));
      case "create_branch":
        return textResult(await createBranch(fetchFn, token, base, CreateBranchArgs.parse(args ?? {})));
      case "get_file_contents":
        return textResult(await getFileContents(fetchFn, token, base, GetFileContentsArgs.parse(args ?? {})));
      case "create_or_update_file":
        return textResult(await createOrUpdateFile(fetchFn, token, base, CreateOrUpdateFileArgs.parse(args ?? {})));
      case "create_issue":
        return textResult(await createIssue(fetchFn, token, base, CreateIssueArgs.parse(args ?? {})));
      case "list_issues":
        return textResult(await listIssues(fetchFn, token, base, ListIssuesArgs.parse(args ?? {})));
      case "get_issue":
        return textResult(await getIssue(fetchFn, token, base, GetIssueArgs.parse(args ?? {})));
      case "create_merge_request":
        return textResult(await createMergeRequest(fetchFn, token, base, CreateMergeRequestArgs.parse(args ?? {})));
      case "list_merge_requests":
        return textResult(await listMergeRequests(fetchFn, token, base, ListMergeRequestsArgs.parse(args ?? {})));
      case "get_merge_request":
        return textResult(await getMergeRequest(fetchFn, token, base, GetMergeRequestArgs.parse(args ?? {})));
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
