import { describe, it, expect, beforeEach } from "vitest";

import {
  collectDispatchFiles,
  collectResultFiles,
  compareMsgId,
  extractCommitShas,
  extractDurationMs,
  extractFilesChanged,
  extractLinearId,
  findResultEnvelopeByMsgId,
  grepMailboxPid,
  msgIdFromFilename,
  parseAcceptance,
  parseDispatchSubject,
  parseDispatchToVendor,
  parseFrontmatter,
  parseInlineStatus,
  psAuxSnippet,
  readDispatchForMsg,
  tryWorkflowIdFromQueue,
} from "../src/lib/mailbox-utils.js";

import { makeFixture, writeDispatch, writeQueue, writeResult, type Fixture } from "./fixtures.js";

describe("msgIdFromFilename", () => {
  it("parses result files", () => {
    expect(msgIdFromFilename("MSG-596-result.md")).toBe("MSG-596");
  });

  it("parses dispatch files", () => {
    expect(msgIdFromFilename("MSG-7-dispatch.md")).toBe("MSG-7");
  });

  it("rejects non-matching names", () => {
    expect(msgIdFromFilename("foo.md")).toBeNull();
    expect(msgIdFromFilename("MSG-596.md")).toBeNull();
    expect(msgIdFromFilename("MSG-abc-result.md")).toBeNull();
  });
});

describe("compareMsgId", () => {
  it("orders by numeric ordinal", () => {
    expect(compareMsgId("MSG-2", "MSG-10")).toBeLessThan(0);
    expect(compareMsgId("MSG-10", "MSG-2")).toBeGreaterThan(0);
    expect(compareMsgId("MSG-5", "MSG-5")).toBe(0);
  });

  it("falls back to lexicographic for non-numeric ids", () => {
    expect(compareMsgId("FOO", "BAR")).toBeGreaterThan(0);
  });
});

describe("parseFrontmatter", () => {
  it("returns frontmatter map and body", () => {
    const raw = "---\nstatus: ok\nduration_ms: 1234\nflag: true\n---\nbody here\n";
    const out = parseFrontmatter(raw);
    expect(out.frontmatter).toEqual({ status: "ok", duration_ms: "1234", flag: true });
    expect(out.body).toContain("body here");
  });

  it("returns empty frontmatter when delimiters are missing", () => {
    const out = parseFrontmatter("no fm here\njust body");
    expect(out.frontmatter).toEqual({});
    expect(out.body).toBe("no fm here\njust body");
  });

  it("coerces literal 'false' to boolean false", () => {
    const out = parseFrontmatter("---\nflag: false\n---\n");
    expect(out.frontmatter).toEqual({ flag: false });
  });
});

describe("parseInlineStatus", () => {
  it("returns ok for '**Status:** ok'", () => {
    expect(parseInlineStatus("hello\n**Status:** ok\n")).toBe("ok");
  });

  it("returns failed for '**Status:** failed' and for 'error'", () => {
    expect(parseInlineStatus("**Status:** failed")).toBe("failed");
    expect(parseInlineStatus("**Status:** error")).toBe("failed");
  });

  it("returns undefined when missing", () => {
    expect(parseInlineStatus("nothing here")).toBeUndefined();
  });
});

describe("extractCommitShas", () => {
  it("matches 'commit: <sha>' line", () => {
    expect(extractCommitShas("\ncommit: abc1234")).toEqual(["abc1234"]);
  });

  it("matches 'commit <full-sha>' git-log style", () => {
    const sha = "a".repeat(40);
    expect(extractCommitShas(`commit ${sha}\nAuthor: me`)).toEqual([sha]);
  });

  it("matches git porcelain '[branch <sha>] msg'", () => {
    expect(extractCommitShas("[main abc1234] subject")).toEqual(["abc1234"]);
  });

  it("does NOT match bare hex tokens in prose", () => {
    expect(extractCommitShas("see worktree agent-aad02b8a1caf and om-1780085944312"))
      .toEqual([]);
  });

  it("dedupes and caps at 8 entries", () => {
    const lines = Array.from({ length: 12 }, (_, i) =>
      `commit: ${i.toString(16).padStart(7, "0")}`,
    ).join("\n");
    expect(extractCommitShas(lines).length).toBe(8);
  });
});

describe("extractFilesChanged", () => {
  it("matches 'files changed: N'", () => {
    expect(extractFilesChanged("files changed: 7")).toBe(7);
  });

  it("matches 'N files changed'", () => {
    expect(extractFilesChanged("3 files changed, 4 insertions")).toBe(3);
  });

  it("returns undefined when absent", () => {
    expect(extractFilesChanged("nothing relevant")).toBeUndefined();
  });
});

describe("extractDurationMs", () => {
  it("prefers numeric frontmatter", () => {
    expect(extractDurationMs({ duration_ms: 5000 }, "")).toBe(5000);
  });

  it("parses string-numeric frontmatter", () => {
    expect(extractDurationMs({ duration_ms: "5000" }, "")).toBe(5000);
  });

  it("falls back to inline body '**Duration:** N ms'", () => {
    expect(extractDurationMs({}, "**Duration:** 2500 ms")).toBe(2500);
  });

  it("returns undefined when nothing matches", () => {
    expect(extractDurationMs({}, "no duration")).toBeUndefined();
  });
});

describe("extractLinearId", () => {
  it("prefers frontmatter linear_id", () => {
    expect(extractLinearId({ linear_id: "FN8-1" }, "")).toBe("FN8-1");
  });

  it("falls back to frontmatter issue", () => {
    expect(extractLinearId({ issue: "FN8-2" }, "")).toBe("FN8-2");
  });

  it("falls back to body '**Issue:** FN8-N'", () => {
    expect(extractLinearId({}, "**Issue:** FN8-77 here")).toBe("FN8-77");
  });

  it("falls back to bare FN8-N anywhere in body", () => {
    expect(extractLinearId({}, "mentions FN8-99 inline")).toBe("FN8-99");
  });

  it("returns undefined when absent", () => {
    expect(extractLinearId({}, "no id")).toBeUndefined();
  });
});

describe("parseDispatchToVendor", () => {
  it("reads vendor from frontmatter 'to'", () => {
    expect(parseDispatchToVendor("---\nto: claude-code\n---\nbody")).toBe("claude-code");
  });

  it("falls back to a raw 'to:' line", () => {
    expect(parseDispatchToVendor("to: cursor\n# title")).toBe("cursor");
  });

  it("rejects unknown vendors", () => {
    expect(parseDispatchToVendor("---\nto: mystery\n---\n")).toBeUndefined();
  });
});

describe("parseDispatchSubject", () => {
  it("prefers frontmatter subject", () => {
    expect(parseDispatchSubject("---\nsubject: Hello world\n---\n# Other\n")).toBe("Hello world");
  });

  it("falls back to h1 when no frontmatter subject", () => {
    expect(parseDispatchSubject("# A subject\nbody")).toBe("A subject");
  });

  it("returns empty string when absent", () => {
    expect(parseDispatchSubject("plain body")).toBe("");
  });
});

describe("parseAcceptance", () => {
  it("returns pass on 'pass' with no early fail", () => {
    expect(parseAcceptance("All checks pass")).toBe("pass");
  });

  it("returns fail when failure is present", () => {
    expect(parseAcceptance("acceptance: fail")).toBe("fail");
  });

  it("returns partial on 'warning'", () => {
    expect(parseAcceptance("warning: degraded")).toBe("partial");
  });

  it("returns undefined when no signal present", () => {
    expect(parseAcceptance("nothing useful here")).toBeUndefined();
  });
});

describe("grepMailboxPid", () => {
  it("extracts pid from a matching ps line", () => {
    const ps = [
      "USER       PID %CPU %MEM   VSZ   RSS TTY  STAT START   TIME COMMAND",
      "alice    12345  0.1  0.0 12345 67890 ?    S    10:00 0:01 fn8-mailbox-cursor MSG-7",
    ].join("\n");
    expect(grepMailboxPid(ps, "cursor", "MSG-7")).toBe(12345);
  });

  it("returns undefined when no line matches", () => {
    expect(grepMailboxPid("USER PID CMD", "cursor", "MSG-7")).toBeUndefined();
  });

  it("ignores other vendors", () => {
    const ps = "alice 99 fn8-mailbox-pool MSG-7";
    expect(grepMailboxPid(ps, "cursor", "MSG-7")).toBeUndefined();
  });
});

describe("psAuxSnippet", () => {
  it("returns a string (possibly empty) without throwing", async () => {
    const out = await psAuxSnippet();
    expect(typeof out).toBe("string");
  });
});

describe("filesystem helpers", () => {
  let fx: Fixture;
  let now: number;

  beforeEach(async () => {
    fx = await makeFixture("fn8cwt-mu-");
    now = Date.now();
  });

  it("collectResultFiles scans outbox-* and ignores stale files", async () => {
    await writeResult(fx, "cursor", "MSG-1", "fresh", now - 60 * 1000);
    await writeResult(fx, "pool", "MSG-2", "older", now - 60 * 60 * 1000);
    await writeResult(fx, "bob", "MSG-3", "ancient", now - 48 * 60 * 60 * 1000);

    const fresh = await collectResultFiles(fx.rolesRoot, 24 * 60 * 60 * 1000, 100);
    const ids = fresh.map((r) => r.msgId).sort();
    expect(ids).toEqual(["MSG-1", "MSG-2"]);

    const veryFresh = await collectResultFiles(fx.rolesRoot, 5 * 60 * 1000, 100);
    expect(veryFresh.map((r) => r.msgId)).toEqual(["MSG-1"]);
  });

  it("collectResultFiles caps results at maxFiles and sorts mtime desc", async () => {
    for (let i = 0; i < 5; i++) {
      await writeResult(fx, "cursor", `MSG-${100 + i}`, "x", now - i * 60_000);
    }
    const out = await collectResultFiles(fx.rolesRoot, 24 * 60 * 60 * 1000, 3);
    expect(out.length).toBe(3);
    expect(out[0]!.msgId).toBe("MSG-100");
    expect(out[1]!.msgId).toBe("MSG-101");
    expect(out[2]!.msgId).toBe("MSG-102");
  });

  it("collectResultFiles tolerates a missing mailbox root", async () => {
    const missing = await collectResultFiles("/nope/does/not/exist", 60_000, 10);
    expect(missing).toEqual([]);
  });

  it("collectDispatchFiles reads outbox-claude-code only", async () => {
    await writeDispatch(fx, "MSG-1", "to: cursor\n", now - 60_000);
    await writeDispatch(fx, "MSG-2", "to: cursor\n", now - 5 * 60_000);
    const out = await collectDispatchFiles(fx.rolesRoot, 24 * 60 * 60 * 1000, 100);
    expect(out.map((d) => d.msgId).sort()).toEqual(["MSG-1", "MSG-2"]);
  });

  it("readDispatchForMsg returns null for missing dispatch", async () => {
    expect(await readDispatchForMsg(fx.rolesRoot, "MSG-999")).toBeNull();
  });

  it("readDispatchForMsg reads existing dispatch", async () => {
    await writeDispatch(fx, "MSG-5", "to: cursor\nbody");
    const got = await readDispatchForMsg(fx.rolesRoot, "MSG-5");
    expect(got).not.toBeNull();
    expect(got!.raw).toContain("to: cursor");
  });

  it("findResultEnvelopeByMsgId locates result across outbox-*", async () => {
    await writeResult(fx, "pool", "MSG-9", "hi");
    const found = await findResultEnvelopeByMsgId(fx.rolesRoot, "MSG-9");
    expect(found).toContain("outbox-pool/MSG-9-result.md");

    expect(await findResultEnvelopeByMsgId(fx.rolesRoot, "MSG-404")).toBeNull();
  });

  it("tryWorkflowIdFromQueue extracts a workflow-id cell", async () => {
    const queue = [
      "| msg | wf | other |",
      "|-----|----|-------|",
      "| MSG-77 | mailboxRoutingWorkflow-abc-1234 | x |",
    ].join("\n");
    await writeQueue(fx, queue);
    const wf = await tryWorkflowIdFromQueue(fx.rolesRoot, "MSG-77");
    expect(wf).toBe("mailboxRoutingWorkflow-abc-1234");
  });

  it("tryWorkflowIdFromQueue returns undefined when QUEUE.md is missing", async () => {
    expect(await tryWorkflowIdFromQueue(fx.rolesRoot, "MSG-1")).toBeUndefined();
  });
});
