/**
 * recent_completions tool [CODE]
 */

import { readFile, stat } from "node:fs/promises";

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
    const shas = extractCommitShas(body);
    const linear = extractLinearId(frontmatter, body);

    out.push({
      msgId: e.msgId,
      vendor: e.vendor,
      dispatch_subject,
      dispatch_linear_id: linear,
      completed_at: new Date(e.mtime).toISOString(),
      status,
      duration_ms: extractDurationMs(frontmatter, body),
      commit_sha: shas[0],
      files_changed: extractFilesChanged(body),
      result_envelope_path: e.abs,
      result_envelope_size: stSize,
      acknowledged: Boolean(ackMap[e.msgId]),
    });
  }

  out.sort((a, b) => compareMsgId(b.msgId, a.msgId));
  return out;
}
