# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- MCP server (`repocollab mcp`, stdio) with twelve tools covering the
  GitLab core workflow: `search_repositories`, `create_repository`,
  `fork_repository`, `create_branch`, `get_file_contents`,
  `create_or_update_file`, `create_issue`, `list_issues`, `get_issue`,
  `create_merge_request`, `list_merge_requests`, `get_merge_request`.
- CLI with one subcommand per tool, using the same `--flag` argument
  names as the tool parameters.
- Implementation calls the GitLab REST v4 API (base URL from
  `GITLAB_API_URL`, default `https://gitlab.com/api/v4`) with the
  token from `GITLAB_PERSONAL_ACCESS_TOKEN` sent as a Bearer token.
  A missing token is an error naming the variable.
- `create_or_update_file` probes for the file first and uses POST to
  create or PUT to update, matching GitLab's file API.
- All HTTP goes through an injectable fetch function, so tests run on
  fixtures with no network access.
