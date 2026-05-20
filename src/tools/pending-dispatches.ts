/**
 * pending_dispatches tool [CODE]
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { defaultFn8RolesRoot, mailboxRoot } from "../lib/paths.js";
import {
  collectDispatchFiles,
  grepMailboxPid,
  parseDispatchToVendor,
  psAuxSnippet,
  tryWorkflowIdFromQueue,
} from "../lib/mailbox-utils.js";
import type { PendingDispatch } from "../types.js";

const SCAN_WINDOW_MS = 24 * 3600 * 1000;
const MAX_DISPATCH_FILES = 100;

export type PendingDispatchesArgs = {
  vendor?: string;
};

export async function pendingDispatches(args: PendingDispatchesArgs): Promise<PendingDispatch[]> {
  const rolesRoot = defaultFn8RolesRoot();
  const dispatchFiles = await collectDispatchFiles(rolesRoot, SCAN_WINDOW_MS, MAX_DISPATCH_FILES);
  const psOut = await psAuxSnippet();
  const out: PendingDispatch[] = [];
  const now = Date.now();

  for (const d of dispatchFiles) {
    let raw: string;
    try {
      raw = await readFile(d.abs, "utf8");
    } catch {
      continue;
    }
    const vendor = parseDispatchToVendor(raw);
    if (!vendor) continue;
    if (args.vendor && args.vendor.length > 0 && vendor !== args.vendor) continue;

    const resultPath = join(mailboxRoot(rolesRoot), `outbox-${vendor}`, `${d.msgId}-result.md`);
    let hasResult = false;
    try {
      await readFile(resultPath);
      hasResult = true;
    } catch {
      hasResult = false;
    }

    if (hasResult) continue;

    const pid = grepMailboxPid(psOut, vendor, d.msgId);
    const wf = await tryWorkflowIdFromQueue(rolesRoot, d.msgId);

    out.push({
      msgId: d.msgId,
      vendor,
      dispatched_at: new Date(d.mtime).toISOString(),
      age_minutes: Math.round((now - d.mtime) / 60000),
      workflow_id: wf,
      subprocess_pid: pid,
      subprocess_alive: typeof pid === "number" && pid > 0,
      has_result_envelope: false,
    });
  }

  return out;
}
