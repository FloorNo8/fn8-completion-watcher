/**
 * Local audit log — JSONL, metadata only (no message bodies) [CODE]
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { watcherRoot } from "../lib/paths.js";
import type { AuditEntry } from "../types.js";

export async function appendAudit(entry: AuditEntry): Promise<void> {
  const path = `${watcherRoot()}/state/audit.jsonl`;
  await mkdir(dirname(path), { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await appendFile(path, line, "utf8");
}
