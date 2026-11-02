# BUILD-REPORT — repocollab (original: gitlab / zereight/gitlab-mcp)

Built 2026-10-26 for the MCP Rebuild 100 program (Tier C core subset).
Local only; nothing pushed or published.

## Identity

- npm: `@reneturcios/repocollab`, bin `repocollab`, version 0.1.0
- Registry name: `io.github.CloudCorpRecords/repocollab`
  (matches package.json `mcpName`, server.json `name`, and the
  Dockerfile `io.modelcontextprotocol.server.name` label)
- server.json description: 84 chars (≤100, counted)
- server.json OCI package entry: no `version` field (version only in
  the tagged identifier `ghcr.io/cloudcorprecords/repocollab:0.1.0`)

## Scope — core subset 12 of 60+

Same surface as the fixture
`harness/fixtures/gitlab-tools-original.json` (`_source`: docs-derived
core-subset of 12 from the zereight/gitlab-mcp public docs, omitted
groups listed there):

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

Omitted groups (recorded in the fixture `_source`): pipelines/CI
tools, wiki, snippets, milestones, labels/epics management,
user/group admin, protected branches, repository tree/archive/compare
detail, MR approvals/discussions/notes beyond get, search beyond
projects.

Registered via the low-level MCP `Server` API with explicit
inputSchema literals; zod validates call arguments. `project_id` is a
string — GitLab accepts a numeric id or a URL-encoded path, and ids
are `encodeURIComponent`-encoded into request paths.

## Implementation

- GitLab REST v4. Base URL from `GITLAB_API_URL`, default
  `https://gitlab.com/api/v4`. Token from
  `GITLAB_PERSONAL_ACCESS_TOKEN`, sent as `Authorization: Bearer`.
- Reads are GETs with query parameters; writes are POST/PUT with JSON
  bodies. `create_or_update_file` probes the file endpoint first and
  uses POST to create or PUT to update.
- Upstream HTTP errors surface with status and GitLab's `message`;
  connection failures are wrapped with the operation context.
- All HTTP goes through an injectable `FetchFn`.

## Verification (all foreground, verified from disk/output)

- tsc: `npm run build` exit 0; `dist/cli.js` present;
  `node dist/cli.js --version` → `0.1.0`; unknown command prints
  Usage and exits 2
- Tests: 18/18 pass (`npm test`, fake fetch only — URL/method/auth
  header/body shaping, project-path and file-path encoding,
  create-or-update POST vs PUT, HTTP error and connection failure,
  missing-token error naming `GITLAB_PERSONAL_ACCESS_TOKEN` with no
  request made)
- Parity: fixture `harness/fixtures/gitlab-tools-original.json` vs
  live stdio rebuild via `harness/parity.py` → `parity_pct == 100.0`,
  identical 12/12, output in `parity-out/parity.json` (verdict PASS)
- Missing-env stdio check: with `GITLAB_PERSONAL_ACCESS_TOKEN` unset,
  initialize succeeds and a `tools/call` for `search_repositories`
  returns `isError` naming `GITLAB_PERSONAL_ACCESS_TOKEN`
  (verified live over stdio)

## Honest gaps

- No live call to gitlab.com (or any GitLab instance) was made or
  claimed; wire behaviour is proven against fake-fetch fixtures only,
  so upstream response-shape drift is unverified until the
  publish-wave live smoke.
- `create_or_update_file`'s existence probe treats any probe failure
  (including transient ones) as "does not exist" and then POSTs; a
  genuinely failing instance would surface GitLab's POST error rather
  than the probe error.
- Lockfile flag: `package-lock.json` is a copy of the libdocs-remote
  lockfile with identity fields edited (name, bin). **Clean lockfile
  regeneration (no node_modules present) is required before
  publish** — fleet lesson 2026-10-25 / Blocker 3.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run (belongs to
  the publish wave, per SCOREBOARD).
