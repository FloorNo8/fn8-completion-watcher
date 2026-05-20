/**
 * Mailbox filesystem scan + parse helpers [CODE]
 * Bound: only files with mtime within scanWindowMs (default 24h), max maxFiles (100).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { mailboxRoot } from "./paths.js";

const execFileP = promisify(execFile);

const MSG_RESULT_RE = /^MSG-(\d+)-result\.md$/;
const MSG_DISPATCH_RE = /^MSG-(\d+)-dispatch\.md$/;

const VENDORS = new Set(["cursor", "pool", "bob", "codex", "gemini", "claude-code"]);

export function msgIdFromFilename(name: string): string | null {
  const m = name.match(/^MSG-(\d+)-(result|dispatch)\.md$/);
  if (!m) return null;
  return `MSG-${m[1]}`;
}

export function compareMsgId(a: string, b: string): number {
  const na = Number(a.replace(/^MSG-/, ""));
  const nb = Number(b.replace(/^MSG-/, ""));
  if (na !== nb && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: raw };
  }
  const fm: Record<string, unknown> = {};
  for (const line of fmMatch[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1]!;
      let val: unknown = kv[2]!.trim();
      if (val === "true") val = true;
      else if (val === "false") val = false;
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: fmMatch[2] ?? "" };
}

export function parseInlineStatus(body: string): "ok" | "failed" | undefined {
  const m = body.match(/\*\*Status:\*\*\s*(ok|failed|error)/i);
  if (!m) return undefined;
  const s = m[1]!.toLowerCase();
  if (s === "ok") return "ok";
  return "failed";
}

export function extractCommitShas(text: string): string[] {
  const out = new Set<string>();
  const commitLine = text.match(/(?:^|\n)\s*(?:commit|Commit)\s*:\s*`?([0-9a-f]{7,40})/im);
  if (commitLine) out.add(commitLine[1]!.slice(0, 7));
  const loose = text.match(/\b([0-9a-f]{7,40})\b/g);
  if (loose) {
    for (const h of loose) {
      if (h.length >= 7) out.add(h.slice(0, 7));
    }
  }
  return [...out].slice(0, 8);
}

export function extractFilesChanged(body: string): number | undefined {
  const m = body.match(/files?\s+changed\s*[:\-]?\s*(\d+)/i);
  if (m) return Number(m[1]);
  const m2 = body.match(/(\d+)\s+files?\s+changed/i);
  if (m2) return Number(m2[1]);
  return undefined;
}

export function extractDurationMs(frontmatter: Record<string, unknown>, body: string): number | undefined {
  const d = frontmatter["duration_ms"];
  if (typeof d === "number") return d;
  if (typeof d === "string" && /^\d+$/.test(d)) return Number(d);
  const m = body.match(/\*\*Duration:\*\*\s*(\d+)\s*ms/i);
  if (m) return Number(m[1]);
  return undefined;
}

export function extractLinearId(frontmatter: Record<string, unknown>, body: string): string | undefined {
  const l = frontmatter["linear_id"] ?? frontmatter["issue"];
  if (typeof l === "string" && l.length > 0) return l;
  const m = body.match(/\*\*Issue:\*\*\s*(FN8-\d+)/i);
  if (m) return m[1];
  const m2 = body.match(/\bFN8-\d+\b/);
  if (m2) return m2[0];
  return undefined;
}

export function parseDispatchToVendor(raw: string): string | undefined {
  const fm = parseFrontmatter(raw);
  const t = fm.frontmatter["to"];
  if (typeof t === "string" && VENDORS.has(t)) return t;
  const m = raw.match(/^\s*to:\s*(\S+)/im);
  if (m && VENDORS.has(m[1]!)) return m[1]!;
  return undefined;
}

export function parseDispatchSubject(raw: string): string {
  const fm = parseFrontmatter(raw);
  const s = fm.frontmatter["subject"];
  if (typeof s === "string" && s.length > 0) return s;
  const m = raw.match(/^\s*#\s+(.+)$/m);
  if (m) return m[1]!.trim();
  return "";
}

type ResultFileEntry = { abs: string; vendor: string; msgId: string; mtime: number };

export async function collectResultFiles(
  rolesRoot: string,
  scanWindowMs: number,
  maxFiles: number,
): Promise<ResultFileEntry[]> {
  const root = mailboxRoot(rolesRoot);
  const cutoff = Date.now() - scanWindowMs;
  const out: ResultFileEntry[] = [];
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }

  for (const d of dirs) {
    if (!d.startsWith("outbox-")) continue;
    const vendor = d.replace(/^outbox-/, "");
    const dirPath = join(root, d);
    let names: string[];
    try {
      names = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!MSG_RESULT_RE.test(name)) continue;
      const msgId = msgIdFromFilename(name);
      if (!msgId) continue;
      const abs = join(dirPath, name);
      let st;
      try {
        st = await stat(abs);
      } catch {
        continue;
      }
      if (st.mtimeMs < cutoff) continue;
      out.push({ abs, vendor, msgId, mtime: st.mtimeMs });
    }
  }

  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, maxFiles);
}

export async function readDispatchForMsg(
  rolesRoot: string,
  msgId: string,
): Promise<{ raw: string; path: string } | null> {
  const p = join(mailboxRoot(rolesRoot), "outbox-claude-code", `${msgId}-dispatch.md`);
  try {
    const raw = await readFile(p, "utf8");
    return { raw, path: p };
  } catch {
    return null;
  }
}

export async function collectDispatchFiles(
  rolesRoot: string,
  scanWindowMs: number,
  maxFiles: number,
): Promise<{ abs: string; msgId: string; mtime: number }[]> {
  const dirPath = join(mailboxRoot(rolesRoot), "outbox-claude-code");
  const cutoff = Date.now() - scanWindowMs;
  const out: { abs: string; msgId: string; mtime: number }[] = [];
  let names: string[];
  try {
    names = await readdir(dirPath);
  } catch {
    return [];
  }
  for (const name of names) {
    if (!MSG_DISPATCH_RE.test(name)) continue;
    const msgId = msgIdFromFilename(name.replace("-dispatch", "-result"));
    if (!msgId) continue;
    const abs = join(dirPath, name);
    let st;
    try {
      st = await stat(abs);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoff) continue;
    out.push({ abs, msgId, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, maxFiles);
}

export async function psAuxSnippet(): Promise<string> {
  try {
    const { stdout } = await execFileP("ps", ["aux"], { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

export function grepMailboxPid(psOut: string, vendor: string, msgId: string): number | undefined {
  const needle = `fn8-mailbox-${vendor}`;
  const re = new RegExp(
    `^\\S+\\s+(\\d+)\\s+.*${escapeRe(needle)}.*${escapeRe(msgId)}`,
    "im",
  );
  const m = psOut.match(re);
  if (m) return Number(m[1]);
  for (const line of psOut.split("\n")) {
    if (line.includes(needle) && line.includes(msgId)) {
      const cells = line.trim().split(/\s+/);
      const pid = Number(cells[1]);
      if (Number.isFinite(pid)) return pid;
    }
  }
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseAcceptance(body: string): "pass" | "fail" | "partial" | undefined {
  const t = body.toLowerCase();
  if (/\bpass\b|✅|exit code:\s*0/i.test(t) && !/\bfail\b/i.test(body.slice(0, 300))) return "pass";
  if (/\bfail\b|exit code:\s*[1-9]|❌/i.test(t)) return "fail";
  if (/partial|warning/i.test(t)) return "partial";
  return undefined;
}

export async function findResultEnvelopeByMsgId(
  rolesRoot: string,
  msgId: string,
): Promise<string | null> {
  const root = mailboxRoot(rolesRoot);
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return null;
  }
  const suffix = `${msgId}-result.md`;
  for (const d of dirs) {
    if (!d.startsWith("outbox-")) continue;
    const abs = join(root, d, suffix);
    try {
      await stat(abs);
      return abs;
    } catch {
      continue;
    }
  }
  return null;
}

export async function tryWorkflowIdFromQueue(
  rolesRoot: string,
  msgId: string,
): Promise<string | undefined> {
  try {
    const q = join(mailboxRoot(rolesRoot), "QUEUE.md");
    const raw = await readFile(q, "utf8");
    const line = raw.split("\n").find((l) => l.includes(msgId));
    if (!line) return undefined;
    const cells = line.split("|").map((c) => c.trim());
    for (const c of cells) {
      if (/^mailboxRoutingWorkflow|^wf-|^[0-9a-f-]{36}$/i.test(c) && c.length > 8) return c;
    }
  } catch {
    /* empty */
  }
  return undefined;
}
