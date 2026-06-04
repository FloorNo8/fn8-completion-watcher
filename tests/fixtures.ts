/**
 * Test fixtures — temp filesystem for fn8-roles mailbox + watcher state. [TEST]
 *
 * Mirrors the on-disk layout the lib helpers walk:
 *   <rolesRoot>/state/mailbox/outbox-<vendor>/MSG-<n>-{dispatch,result}.md
 *   <watcherRoot>/state/acknowledged.json
 */

import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Fixture = {
  dir: string;
  rolesRoot: string;
  watcherRoot: string;
  cleanup: () => Promise<void>;
};

export async function createFixture(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), "fn8-watcher-test-"));
  const rolesRoot = join(dir, "fn8-roles");
  const watcherRoot = join(dir, "watcher");
  await mkdir(join(rolesRoot, "state", "mailbox"), { recursive: true });
  await mkdir(join(watcherRoot, "state"), { recursive: true });
  return {
    dir,
    rolesRoot,
    watcherRoot,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function writeDispatch(
  rolesRoot: string,
  msgId: string,
  vendor: string,
  mtimeMs: number,
  body = "",
): Promise<string> {
  const dirPath = join(rolesRoot, "state", "mailbox", "outbox-claude-code");
  await mkdir(dirPath, { recursive: true });
  const abs = join(dirPath, `${msgId}-dispatch.md`);
  const fm = `---\nto: ${vendor}\nsubject: test ${msgId}\n---\n${body}`;
  await writeFile(abs, fm, "utf8");
  const t = new Date(mtimeMs);
  await utimes(abs, t, t);
  return abs;
}

export async function writeResult(
  rolesRoot: string,
  msgId: string,
  vendor: string,
  mtimeMs: number,
  body = "**Status:** ok\n",
): Promise<string> {
  const dirPath = join(rolesRoot, "state", "mailbox", `outbox-${vendor}`);
  await mkdir(dirPath, { recursive: true });
  const abs = join(dirPath, `${msgId}-result.md`);
  await writeFile(abs, `---\nstatus: ok\n---\n${body}`, "utf8");
  const t = new Date(mtimeMs);
  await utimes(abs, t, t);
  return abs;
}

export async function writeAcknowledged(
  watcherRoot: string,
  ack: Record<string, string>,
): Promise<string> {
  const abs = join(watcherRoot, "state", "acknowledged.json");
  await writeFile(abs, JSON.stringify({ ack }, null, 2) + "\n", "utf8");
  return abs;
}
