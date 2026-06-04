import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { acknowledgeCompletion } from "../src/tools/acknowledge-completion.js";
import { pendingDispatches } from "../src/tools/pending-dispatches.js";
import { readResultEnvelope } from "../src/tools/read-result-envelope.js";
import { recentCompletions } from "../src/tools/recent-completions.js";

import {
  applyEnv,
  makeFixture,
  writeDispatch,
  writeResult,
  type Fixture,
} from "./fixtures.js";

const SAMPLE_RESULT_OK = `---
status: ok
linear_id: FN8-123
duration_ms: 4500
---
# Some Subject

**Status:** ok
**Duration:** 4500 ms
**Issue:** FN8-123

Did the thing. 7 files changed, 90 insertions.

commit: deadbeef
`;

const SAMPLE_RESULT_FAILED = `---
status: failed
---
# Counter-review

**Status:** failed

Acceptance: fail. exit code: 1.
`;

const SAMPLE_DISPATCH_CLAUDE = `---
to: claude-code
subject: Build a thing
---
# Build a thing
body
`;

let fx: Fixture;
const originalRoles = process.env["FN8_ROLES_ROOT"];
const originalWatcher = process.env["FN8_COMPLETION_WATCHER_HOME"];

beforeEach(async () => {
  fx = await makeFixture("fn8cwt-tools-");
  applyEnv(fx);
});

afterEach(() => {
  if (originalRoles === undefined) delete process.env["FN8_ROLES_ROOT"];
  else process.env["FN8_ROLES_ROOT"] = originalRoles;
  if (originalWatcher === undefined) delete process.env["FN8_COMPLETION_WATCHER_HOME"];
  else process.env["FN8_COMPLETION_WATCHER_HOME"] = originalWatcher;
});

describe("recent_completions", () => {
  it("returns an empty list when no mailbox exists", async () => {
    const rows = await recentCompletions({});
    expect(rows).toEqual([]);
  });

  it("returns an ok envelope with parsed metadata; commit_sha is undefined when git can't verify", async () => {
    await writeResult(fx, "cursor", "MSG-200", SAMPLE_RESULT_OK);
    const rows = await recentCompletions({ hours: 24 });
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.msgId).toBe("MSG-200");
    expect(row.vendor).toBe("cursor");
    expect(row.status).toBe("ok");
    expect(row.duration_ms).toBe(4500);
    expect(row.dispatch_linear_id).toBe("FN8-123");
    expect(row.files_changed).toBe(7);
    expect(row.commit_sha).toBeUndefined();
    expect(row.acknowledged).toBe(false);
    expect(row.result_envelope_path.endsWith("MSG-200-result.md")).toBe(true);
    expect(row.result_envelope_size).toBeGreaterThan(0);
  });

  it("marks failed status when frontmatter indicates failure", async () => {
    await writeResult(fx, "cursor", "MSG-201", SAMPLE_RESULT_FAILED);
    const rows = await recentCompletions({ hours: 24 });
    expect(rows[0]!.status).toBe("failed");
  });

  it("filters by vendor", async () => {
    await writeResult(fx, "cursor", "MSG-1", SAMPLE_RESULT_OK);
    await writeResult(fx, "pool", "MSG-2", SAMPLE_RESULT_OK);
    const rows = await recentCompletions({ hours: 24, vendor: "pool" });
    expect(rows.length).toBe(1);
    expect(rows[0]!.vendor).toBe("pool");
  });

  it("filters out envelopes older than the hours window", async () => {
    const now = Date.now();
    await writeResult(fx, "cursor", "MSG-300", SAMPLE_RESULT_OK, now - 30 * 60_000);
    await writeResult(fx, "cursor", "MSG-301", SAMPLE_RESULT_OK, now - 10 * 60_000);
    const rows = await recentCompletions({ hours: 0.25 });
    expect(rows.map((r) => r.msgId)).toEqual(["MSG-301"]);
  });

  it("respects since_msg_id (only ids strictly after)", async () => {
    await writeResult(fx, "cursor", "MSG-10", SAMPLE_RESULT_OK);
    await writeResult(fx, "cursor", "MSG-11", SAMPLE_RESULT_OK);
    await writeResult(fx, "cursor", "MSG-12", SAMPLE_RESULT_OK);
    const rows = await recentCompletions({ hours: 24, since_msg_id: "MSG-11" });
    expect(rows.map((r) => r.msgId)).toEqual(["MSG-12"]);
  });

  it("reflects acknowledged=true once acknowledged", async () => {
    await writeResult(fx, "cursor", "MSG-50", SAMPLE_RESULT_OK);
    await acknowledgeCompletion({ msgId: "MSG-50" });
    const rows = await recentCompletions({ hours: 24 });
    expect(rows[0]!.acknowledged).toBe(true);
  });

  it("populates dispatch_subject when a paired dispatch exists", async () => {
    await writeDispatch(fx, "MSG-60", SAMPLE_DISPATCH_CLAUDE);
    await writeResult(fx, "claude-code", "MSG-60", SAMPLE_RESULT_OK);
    const rows = await recentCompletions({ hours: 24, vendor: "claude-code" });
    expect(rows[0]!.dispatch_subject).toBe("Build a thing");
  });
});

describe("pending_dispatches", () => {
  it("returns empty when nothing is queued", async () => {
    expect(await pendingDispatches({})).toEqual([]);
  });

  it("returns a dispatch that has no result envelope yet", async () => {
    await writeDispatch(fx, "MSG-1", SAMPLE_DISPATCH_CLAUDE);
    const rows = await pendingDispatches({});
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.msgId).toBe("MSG-1");
    expect(row.vendor).toBe("claude-code");
    expect(row.has_result_envelope).toBe(false);
    expect(typeof row.age_minutes).toBe("number");
    expect(row.subprocess_alive).toBe(false);
  });

  it("excludes dispatches that already have a result envelope", async () => {
    await writeDispatch(fx, "MSG-2", SAMPLE_DISPATCH_CLAUDE);
    await writeResult(fx, "claude-code", "MSG-2", SAMPLE_RESULT_OK);
    const rows = await pendingDispatches({});
    expect(rows).toEqual([]);
  });

  it("filters by vendor", async () => {
    await writeDispatch(fx, "MSG-3", SAMPLE_DISPATCH_CLAUDE);
    await writeDispatch(fx, "MSG-4", "---\nto: cursor\nsubject: x\n---\n");
    const rows = await pendingDispatches({ vendor: "cursor" });
    expect(rows.map((r) => r.msgId)).toEqual(["MSG-4"]);
  });
});

describe("read_result_envelope", () => {
  it("returns null when the msgId has no result file", async () => {
    expect(await readResultEnvelope({ msgId: "MSG-404" })).toBeNull();
  });

  it("parses the envelope and returns frontmatter + body + parsed metadata", async () => {
    await writeResult(fx, "cursor", "MSG-7", SAMPLE_RESULT_OK);
    const got = await readResultEnvelope({ msgId: "MSG-7" });
    expect(got).not.toBeNull();
    expect(got!.msgId).toBe("MSG-7");
    expect(got!.frontmatter["status"]).toBe("ok");
    expect(got!.frontmatter["linear_id"]).toBe("FN8-123");
    expect(got!.parsed_commits).toEqual(["deadbeef"]);
    expect(got!.parsed_files_changed).toBe(7);
    expect(got!.parsed_acceptance_status).toBeUndefined();
    expect(got!.body_markdown).toContain("Did the thing.");
    expect(got!.summary_first_500_chars.length).toBeLessThanOrEqual(501);
  });

  it("truncates body summaries past 500 chars with an ellipsis", async () => {
    const long = `---\nstatus: ok\n---\n` + "x".repeat(800);
    await writeResult(fx, "cursor", "MSG-9", long);
    const got = await readResultEnvelope({ msgId: "MSG-9" });
    expect(got!.summary_first_500_chars.endsWith("…")).toBe(true);
  });
});

describe("acknowledge_completion", () => {
  it("writes an ack entry to state/acknowledged.json under FN8_COMPLETION_WATCHER_HOME", async () => {
    const r = await acknowledgeCompletion({ msgId: "MSG-1" });
    expect(r.ok).toBe(true);
    const raw = await readFile(join(fx.watcherHome, "state", "acknowledged.json"), "utf8");
    const parsed = JSON.parse(raw) as { ack: Record<string, string> };
    expect(parsed.ack["MSG-1"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("is idempotent — acknowledging twice still reports ok", async () => {
    const a = await acknowledgeCompletion({ msgId: "MSG-1" });
    const b = await acknowledgeCompletion({ msgId: "MSG-1" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});
