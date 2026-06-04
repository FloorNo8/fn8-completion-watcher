/**
 * Test fixtures — temp filesystem for fn8-roles mailbox + watcher state. [TEST]
 *
 * Mirrors the on-disk layout the lib helpers walk:
 *   <rolesRoot>/state/mailbox/outbox-<vendor>/MSG-<n>-{dispatch,result}.md
 *   <watcherRoot>/state/acknowledged.json
 *
 * Exposes a superset of helpers used across the suite. Two calling conventions
 * are supported for writeDispatch/writeResult:
 *   - Fixture-first (PR#1): writeDispatch(fx, msgId, body, mtimeMs?)
 *   - rolesRoot-first (PR#2): writeDispatch(rolesRoot, msgId, vendor, mtimeMs, body?)
 */

import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Fixture = {
  dir: string;
  rolesRoot: string;
  watcherHome: string;
  watcherRoot: string;
  mailbox: string;
  cleanup: () => Promise<void>;
};

async function build(prefix: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const rolesRoot = join(dir, "fn8-roles");
  const watcherHome = join(dir, "watcher");
  const mailbox = join(rolesRoot, "state", "mailbox");
  await mkdir(mailbox, { recursive: true });
  await mkdir(join(watcherHome, "state"), { recursive: true });
  return {
    dir,
    rolesRoot,
    watcherHome,
    watcherRoot: watcherHome,
    mailbox,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function makeFixture(prefix = "fn8cwt-"): Promise<Fixture> {
  return build(prefix);
}

export async function createFixture(): Promise<Fixture> {
  return build("fn8-watcher-test-");
}

export function applyEnv(fx: Fixture): void {
  process.env["FN8_ROLES_ROOT"] = fx.rolesRoot;
  process.env["FN8_COMPLETION_WATCHER_HOME"] = fx.watcherHome;
}

export async function writeQueue(fx: Fixture, contents: string): Promise<string> {
  const path = join(fx.mailbox, "QUEUE.md");
  await writeFile(path, contents, "utf8");
  return path;
}

export async function writeAcknowledged(
  watcherRoot: string,
  ack: Record<string, string>,
): Promise<string> {
  const abs = join(watcherRoot, "state", "acknowledged.json");
  await writeFile(abs, JSON.stringify({ ack }, null, 2) + "\n", "utf8");
  return abs;
}

export async function writeDispatch(
  fx: Fixture,
  msgId: string,
  body: string,
  mtimeMs?: number,
): Promise<string>;
export async function writeDispatch(
  rolesRoot: string,
  msgId: string,
  vendor: string,
  mtimeMs: number,
  body?: string,
): Promise<string>;
export async function writeDispatch(
  arg1: Fixture | string,
  msgId: string,
  bodyOrVendor: string,
  mtimeMs?: number,
  bodyForPr2?: string,
): Promise<string> {
  if (typeof arg1 === "string") {
    const rolesRoot = arg1;
    const vendor = bodyOrVendor;
    const dirPath = join(rolesRoot, "state", "mailbox", "outbox-claude-code");
    await mkdir(dirPath, { recursive: true });
    const abs = join(dirPath, `${msgId}-dispatch.md`);
    const body = bodyForPr2 ?? "";
    const fm = `---\nto: ${vendor}\nsubject: test ${msgId}\n---\n${body}`;
    await writeFile(abs, fm, "utf8");
    if (typeof mtimeMs === "number") {
      const t = new Date(mtimeMs);
      await utimes(abs, t, t);
    }
    return abs;
  }
  const fx = arg1;
  const body = bodyOrVendor;
  const dir = join(fx.mailbox, "outbox-claude-code");
  await mkdir(dir, { recursive: true });
  const abs = join(dir, `${msgId}-dispatch.md`);
  await writeFile(abs, body, "utf8");
  if (typeof mtimeMs === "number") {
    const sec = mtimeMs / 1000;
    await utimes(abs, sec, sec);
  }
  return abs;
}

export async function writeResult(
  fx: Fixture,
  vendor: string,
  msgId: string,
  body: string,
  mtimeMs?: number,
): Promise<string>;
export async function writeResult(
  rolesRoot: string,
  msgId: string,
  vendor: string,
  mtimeMs: number,
  body?: string,
): Promise<string>;
export async function writeResult(
  arg1: Fixture | string,
  arg2: string,
  arg3: string,
  arg4: string | number,
  arg5?: string | number,
): Promise<string> {
  if (typeof arg1 === "string") {
    const rolesRoot = arg1;
    const msgId = arg2;
    const vendor = arg3;
    const mtimeMs = arg4 as number;
    const body = (arg5 as string | undefined) ?? "**Status:** ok\n";
    const dirPath = join(rolesRoot, "state", "mailbox", `outbox-${vendor}`);
    await mkdir(dirPath, { recursive: true });
    const abs = join(dirPath, `${msgId}-result.md`);
    await writeFile(abs, `---\nstatus: ok\n---\n${body}`, "utf8");
    const t = new Date(mtimeMs);
    await utimes(abs, t, t);
    return abs;
  }
  const fx = arg1;
  const vendor = arg2;
  const msgId = arg3;
  const body = arg4 as string;
  const mtimeMs = arg5 as number | undefined;
  const dir = join(fx.mailbox, `outbox-${vendor}`);
  await mkdir(dir, { recursive: true });
  const abs = join(dir, `${msgId}-result.md`);
  await writeFile(abs, body, "utf8");
  if (typeof mtimeMs === "number") {
    const sec = mtimeMs / 1000;
    await utimes(abs, sec, sec);
  }
  return abs;
}
