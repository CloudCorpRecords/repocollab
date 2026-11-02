import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  apiBaseFromEnv,
  createBranch,
  createIssue,
  createMergeRequest,
  createOrUpdateFile,
  createRepository,
  forkRepository,
  getFileContents,
  getIssue,
  getMergeRequest,
  listIssues,
  listMergeRequests,
  requireToken,
  searchRepositories,
  tokenFromEnv,
} from "../src/gitlab.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Call {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

const BASE = "https://gitlab.com/api/v4";
const TOKEN = "glpat-test-token";

function resp(body: unknown, opts: Partial<HttpResponse> = {}): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: async () => text,
    json: async () => JSON.parse(text),
    ...opts,
  };
}

function fake(calls: Call[], body: unknown = { ok: true }): FetchFn {
  return async (url, init) => {
    calls.push({ url, init });
    return resp(body);
  };
}

function fakeSequence(calls: Call[], responses: HttpResponse[]): FetchFn {
  let i = 0;
  return async (url, init) => {
    calls.push({ url, init });
    return responses[Math.min(i++, responses.length - 1)];
  };
}

describe("env helpers", () => {
  it("tokenFromEnv trims and apiBaseFromEnv defaults and strips trailing slashes", () => {
    assert.equal(tokenFromEnv({ GITLAB_PERSONAL_ACCESS_TOKEN: " t " }), "t");
    assert.equal(tokenFromEnv({}), undefined);
    assert.equal(apiBaseFromEnv({}), BASE);
    assert.equal(apiBaseFromEnv({ GITLAB_API_URL: "https://gl.example.com/api/v4/" }), "https://gl.example.com/api/v4");
  });
  it("requireToken names GITLAB_PERSONAL_ACCESS_TOKEN when missing", () => {
    assert.throws(() => requireToken(undefined), /GITLAB_PERSONAL_ACCESS_TOKEN/);
    assert.throws(() => requireToken("  "), /GITLAB_PERSONAL_ACCESS_TOKEN/);
    assert.equal(requireToken(" x "), "x");
  });
  it("a missing token fails before any request is made", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () => searchRepositories(fake(calls), undefined, BASE, { search: "x" }),
      /GITLAB_PERSONAL_ACCESS_TOKEN/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("read operations", () => {
  it("search_repositories GETs /projects?search= with the Bearer header", async () => {
    const calls: Call[] = [];
    const out = await searchRepositories(fake(calls, [{ id: 1, name: "demo" }]), TOKEN, BASE, { search: "my proj" });
    assert.deepEqual(out, [{ id: 1, name: "demo" }]);
    assert.equal(calls[0].url, `${BASE}/projects?search=my%20proj`);
    assert.equal(calls[0].init?.method, "GET");
    assert.equal(calls[0].init?.headers?.Authorization, `Bearer ${TOKEN}`);
    assert.equal(calls[0].init?.body, undefined);
  });
  it("get_file_contents URL-encodes the project path and file path and passes ref", async () => {
    const calls: Call[] = [];
    await getFileContents(fake(calls, { file_name: "a.md" }), TOKEN, BASE, {
      project_id: "group/proj",
      file_path: "docs/a b.md",
      ref: "main",
    });
    assert.equal(
      calls[0].url,
      `${BASE}/projects/group%2Fproj/repository/files/docs%2Fa%20b.md?ref=main`,
    );
  });
  it("list_issues passes state and pagination as query params, skipping unset ones", async () => {
    const calls: Call[] = [];
    await listIssues(fake(calls, []), TOKEN, BASE, { project_id: "42", state: "opened", per_page: 5 });
    assert.equal(calls[0].url, `${BASE}/projects/42/issues?state=opened&per_page=5`);
  });
  it("get_issue and get_merge_request put the IID in the path", async () => {
    const calls: Call[] = [];
    await getIssue(fake(calls, { iid: 7 }), TOKEN, BASE, { project_id: "42", issue_iid: 7 });
    assert.equal(calls[0].url, `${BASE}/projects/42/issues/7`);
    const calls2: Call[] = [];
    await getMergeRequest(fake(calls2, { iid: 3 }), TOKEN, BASE, { project_id: "42", merge_request_iid: 3 });
    assert.equal(calls2[0].url, `${BASE}/projects/42/merge_requests/3`);
  });
  it("list_merge_requests mirrors list_issues shaping", async () => {
    const calls: Call[] = [];
    await listMergeRequests(fake(calls, []), TOKEN, BASE, { project_id: "42", state: "merged", page: 2 });
    assert.equal(calls[0].url, `${BASE}/projects/42/merge_requests?state=merged&page=2`);
  });
});

describe("write operations", () => {
  it("create_repository POSTs JSON with only the set fields", async () => {
    const calls: Call[] = [];
    await createRepository(fake(calls, { id: 9 }), TOKEN, BASE, { name: "demo", visibility: "private" });
    assert.equal(calls[0].url, `${BASE}/projects`);
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.headers?.["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0].init?.body ?? "{}"), { name: "demo", visibility: "private" });
  });
  it("fork_repository POSTs to /fork with the namespace", async () => {
    const calls: Call[] = [];
    await forkRepository(fake(calls, { id: 10 }), TOKEN, BASE, { project_id: "42", namespace: "mygroup" });
    assert.equal(calls[0].url, `${BASE}/projects/42/fork`);
    assert.deepEqual(JSON.parse(calls[0].init?.body ?? "{}"), { namespace: "mygroup" });
  });
  it("create_branch POSTs branch and ref", async () => {
    const calls: Call[] = [];
    await createBranch(fake(calls, { name: "feat" }), TOKEN, BASE, { project_id: "42", branch: "feat", ref: "main" });
    assert.equal(calls[0].url, `${BASE}/projects/42/repository/branches`);
    assert.deepEqual(JSON.parse(calls[0].init?.body ?? "{}"), { branch: "feat", ref: "main" });
  });
  it("create_or_update_file POSTs when the file does not exist", async () => {
    const calls: Call[] = [];
    const missing = resp("not found", { ok: false, status: 404, statusText: "Not Found" });
    const created = resp({ file_path: "a.txt" }, { status: 201, statusText: "Created" });
    await createOrUpdateFile(fakeSequence(calls, [missing, created]), TOKEN, BASE, {
      project_id: "42",
      file_path: "a.txt",
      content: "hello",
      commit_message: "add a",
      branch: "main",
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init?.method, "POST");
    assert.deepEqual(JSON.parse(calls[1].init?.body ?? "{}"), {
      branch: "main",
      content: "hello",
      commit_message: "add a",
    });
  });
  it("create_or_update_file PUTs when the file already exists", async () => {
    const calls: Call[] = [];
    const existing = resp({ file_name: "a.txt" });
    const updated = resp({ file_path: "a.txt" });
    await createOrUpdateFile(fakeSequence(calls, [existing, updated]), TOKEN, BASE, {
      project_id: "42",
      file_path: "a.txt",
      content: "v2",
      commit_message: "update a",
      branch: "main",
    });
    assert.equal(calls[1].init?.method, "PUT");
  });
  it("create_issue POSTs title, description and labels", async () => {
    const calls: Call[] = [];
    await createIssue(fake(calls, { iid: 1 }), TOKEN, BASE, {
      project_id: "42",
      title: "Bug",
      description: "it broke",
      labels: "bug,urgent",
    });
    assert.equal(calls[0].url, `${BASE}/projects/42/issues`);
    assert.deepEqual(JSON.parse(calls[0].init?.body ?? "{}"), {
      title: "Bug",
      description: "it broke",
      labels: "bug,urgent",
    });
  });
  it("create_merge_request POSTs title and both branches", async () => {
    const calls: Call[] = [];
    await createMergeRequest(fake(calls, { iid: 5 }), TOKEN, BASE, {
      project_id: "42",
      title: "Ship it",
      source_branch: "feat",
      target_branch: "main",
    });
    assert.equal(calls[0].url, `${BASE}/projects/42/merge_requests`);
    assert.deepEqual(JSON.parse(calls[0].init?.body ?? "{}"), {
      title: "Ship it",
      source_branch: "feat",
      target_branch: "main",
    });
  });
});

describe("upstream failures", () => {
  it("surfaces HTTP errors with status and the GitLab message", async () => {
    const failing: FetchFn = async () =>
      resp({ message: "404 Project Not Found" }, { ok: false, status: 404, statusText: "Not Found" });
    await assert.rejects(
      () => getIssue(failing, TOKEN, BASE, { project_id: "42", issue_iid: 1 }),
      /HTTP 404.*404 Project Not Found/,
    );
  });
  it("surfaces connection failures", async () => {
    const failing: FetchFn = async () => { throw new Error("fetch failed"); };
    await assert.rejects(
      () => searchRepositories(failing, TOKEN, BASE, { search: "x" }),
      /GitLab API request failed: fetch failed/,
    );
  });
  it("honours a custom GITLAB_API_URL base", async () => {
    const calls: Call[] = [];
    await searchRepositories(fake(calls, []), TOKEN, "https://gl.example.com/api/v4", { search: "x" });
    assert.ok(calls[0].url?.startsWith("https://gl.example.com/api/v4/projects"));
  });
});
