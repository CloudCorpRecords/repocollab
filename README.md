# repocollab

repocollab puts the everyday GitLab project workflow behind an MCP
server: find a project, create or fork one, cut a branch, read and
write files, and open and track issues and merge requests. It is a
core subset of the documented GitLab MCP surface — the twelve tools
an agent reaches for most — talking to the GitLab REST v4 API.

Authentication is a personal access token in
`GITLAB_PERSONAL_ACCESS_TOKEN`, sent as a Bearer token. By default the
server talks to `https://gitlab.com/api/v4`; point `GITLAB_API_URL`
at a self-managed instance to use that instead. A `project_id` is a
string throughout: either the numeric project id or the
URL-encoded project path both work.

## Install

```bash
npx @reneturcios/repocollab search_repositories --search my-project
docker run -i -e GITLAB_PERSONAL_ACCESS_TOKEN ghcr.io/cloudcorprecords/repocollab
```

## CLI

```bash
repocollab search_repositories --search my-project
repocollab create_repository --name demo --visibility private
repocollab get_file_contents --project-id group/demo --file-path README.md --ref main
repocollab create_issue --project-id 42 --title "Bug report" --labels bug
repocollab list_merge_requests --project-id 42 --state opened
repocollab --version
```

Exit codes: `0` success, `1` API error, `2` usage error.

## MCP server

```bash
npx -y @reneturcios/repocollab mcp
```

```json
{
  "mcpServers": {
    "repocollab": {
      "command": "npx",
      "args": ["-y", "@reneturcios/repocollab", "mcp"],
      "env": { "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-..." }
    }
  }
}
```

### Tools

| Tool | Required | Optional |
| --- | --- | --- |
| `search_repositories` | `search` | — |
| `create_repository` | `name` | `description`, `visibility` |
| `fork_repository` | `project_id` | `namespace` |
| `create_branch` | `project_id`, `branch` | `ref` |
| `get_file_contents` | `project_id`, `file_path` | `ref` |
| `create_or_update_file` | `project_id`, `file_path`, `content`, `commit_message`, `branch` | `previous_path` |
| `create_issue` | `project_id`, `title` | `description`, `labels` |
| `list_issues` | `project_id` | `state`, `per_page`, `page` |
| `get_issue` | `project_id`, `issue_iid` | — |
| `create_merge_request` | `project_id`, `title`, `source_branch`, `target_branch` | `description` |
| `list_merge_requests` | `project_id` | `state`, `per_page`, `page` |
| `get_merge_request` | `project_id`, `merge_request_iid` | — |

`create_or_update_file` checks whether the file already exists on the
target branch and creates it (POST) or updates it (PUT) accordingly.
A missing token is reported as a tool error naming
`GITLAB_PERSONAL_ACCESS_TOKEN`; upstream HTTP errors surface with
their status and GitLab's message.

Out of scope in this subset: pipelines and CI, wiki, snippets,
milestones, label/epic management, user and group administration,
protected branches, repository tree/archive/compare detail, merge
request approvals, discussions and notes beyond `get_merge_request`,
and search beyond projects.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Tests run entirely on fake-fetch fixtures; no network is used.

## License

MIT — see `LICENSE`.
