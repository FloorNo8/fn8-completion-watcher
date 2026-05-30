/**
 * recent_completions tool [CODE]
 */

import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { acknowledgedPath, defaultFn8RolesRoot } from "../lib/paths.js";
import {
  collectResultFiles,
  compareMsgId,
  extractCommitShas,
  extractDurationMs,
  extractFilesChanged,
  extractLinearId,
  parseDispatchSubject,
  parseFrontmatter,
  parseInlineStatus,
  readDispatchForMsg,
} from "../lib/mailbox-utils.js";
import { loadAcknowledged } from "../lib/acknowledged.js";
import type { RecentCompletion } from "../types.js";

const SCAN_WINDOW_MS = 24 * 3600 * 1000;
const MAX_FILES = 100;

// A commit produced by a dispatch carries a committer timestamp close to when
// the result file is written. Accept a wide window preceding completion (covers
// long-running dispatches + clock skew) plus a small grace after. A SHA whose
// committer timestamp falls outside this window = cited-in-prose, not produced
// by this dispatch.
const COMMIT_WINDOW_BEFORE_MS = 24 * 3600 * 1000;
const COMMIT_WINDOW_AFTER_MS = 3600 * 1000;

const execFileAsync = promisify(execFile);

// Verify a candidate SHA actually exists as a commit AND could plausibly have
// been produced by this dispatch (committer timestamp near `completionMs`).
// Rejects two false-attribution classes the loose extractor used to emit:
//   - phantom SHAs (`git cat-file` fails) — e.g. epoch/worktree fragments
//   - misattributed real commits cited in prose — e.g. a month-old commit whose
//     committer date predates the dispatch, so it cannot have been created by it
// Linked worktrees share the main repo's object store, so commits made inside a
// dispatch worktree resolve from `root`. Fail-closed: any git error → reject.
async function verifyDispatchCommit(
  root: string,
  sha: string,
  completionMs: number,
): Promise<boolean> {
  try {
    const { stdout: type } = await execFileAsync("git", ["-C", root, "cat-file", "-t", sha], {
      timeout: 5000,
    });
    if (type.trim() !== "commit") return false;
    const { stdout: ct } = await execFileAsync(
      "git",
      ["-C", root, "show", "-s", "--format=%ct", sha],
      { timeout: 5000 },
    );
    const commitMs = Number(ct.trim()) * 1000;
    if (!Number.isFinite(commitMs)) return false;
    return (
      commitMs >= completionMs - COMMIT_WINDOW_BEFORE_MS &&
      commitMs <= completionMs + COMMIT_WINDOW_AFTER_MS
    );
  } catch {
    return false;
  }
}

function parseMsgOrdinal(msgId: string): number {
  const m = msgId.match(/^MSG-(\d+)$/);
  return m ? Number(m[1]) : -1;
}

export type RecentCompletionsArgs = {
  hours?: number;
  vendor?: string;
  since_msg_id?: string;
};

export async function recentCompletions(args: RecentCompletionsArgs): Promise<RecentCompletion[]> {
  const hours = typeof args.hours === "number" && args.hours > 0 ? args.hours : 1;
  const lookbackMs = hours * 3600 * 1000;
  const sinceOrd =
    args.since_msg_id && args.since_msg_id.length > 0 ? parseMsgOrdinal(args.since_msg_id) : -1;

  const rolesRoot = defaultFn8RolesRoot();
  const ackMap = await loadAcknowledged(acknowledgedPath());
  const entries = await collectResultFiles(rolesRoot, SCAN_WINDOW_MS, MAX_FILES);
  const now = Date.now();
  const cutoff = now - lookbackMs;

  const out: RecentCompletion[] = [];

  for (const e of entries) {
    if (e.mtime < cutoff) continue;
    if (args.vendor && args.vendor.length > 0 && e.vendor !== args.vendor) continue;
    if (sinceOrd >= 0) {
      const ord = parseMsgOrdinal(e.msgId);
      if (ord <= sinceOrd) continue;
    }

    let raw: string;
    try {
      raw = await readFile(e.abs, "utf8");
    } catch {
      continue;
    }
    let stSize = 0;
    try {
      stSize = (await stat(e.abs)).size;
    } catch {
      /* empty */
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    const inline = parseInlineStatus(body);
    const fmStatus = frontmatter["status"];
    let status: "ok" | "failed" = "ok";
    if (typeof fmStatus === "string" && /fail|error/i.test(fmStatus)) status = "failed";
    else if (inline === "failed") status = "failed";
    else if (inline === "ok") status = "ok";

    const dispatch = await readDispatchForMsg(rolesRoot, e.msgId);
    const dispatch_subject = dispatch ? parseDispatchSubject(dispatch.raw) : "";
    // Take the first candidate that git confirms is a real commit produced
    // within this dispatch's window. Unverified candidates are dropped so a
    // counter-review (which commits nothing) reports no commit_sha.
    const shaCandidates = extractCommitShas(body);
    let commit_sha: string | undefined;
    for (const cand of shaCandidates) {
      if (await verifyDispatchCommit(rolesRoot, cand, e.mtime)) {
        commit_sha = cand;
        break;
      }
    }
    const linear = extractLinearId(frontmatter, body);

    out.push({
      msgId: e.msgId,
      vendor: e.vendor,
      dispatch_subject,
      dispatch_linear_id: linear,
      completed_at: new Date(e.mtime).toISOString(),
      status,
      duration_ms: extractDurationMs(frontmatter, body),
      commit_sha,
      files_changed: extractFilesChanged(body),
      result_envelope_path: e.abs,
      result_envelope_size: stSize,
      acknowledged: Boolean(ackMap[e.msgId]),
    });
  }

  out.sort((a, b) => compareMsgId(b.msgId, a.msgId));
  return out;
}
