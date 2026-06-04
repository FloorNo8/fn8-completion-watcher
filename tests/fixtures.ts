import { mkdir, mkdtemp, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Fixture = {
  rolesRoot: string;
  watcherHome: string;
  mailbox: string;
};

export async function makeFixture(prefix = "fn8cwt-"): Promise<Fixture> {
  const base = await mkdtemp(join(tmpdir(), prefix));
  const rolesRoot = join(base, "fn8-roles");
  const watcherHome = join(base, "watcher");
  const mailbox = join(rolesRoot, "state", "mailbox");
  await mkdir(mailbox, { recursive: true });
  await mkdir(join(watcherHome, "state"), { recursive: true });
  return { rolesRoot, watcherHome, mailbox };
}

export async function writeResult(
  fx: Fixture,
  vendor: string,
  msgId: string,
  body: string,
  mtimeMs?: number,
): Promise<string> {
  const dir = join(fx.mailbox, `outbox-${vendor}`);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${msgId}-result.md`);
  await writeFile(path, body, "utf8");
  if (typeof mtimeMs === "number") {
    const sec = mtimeMs / 1000;
    await utimes(path, sec, sec);
  }
  return path;
}

export async function writeDispatch(
  fx: Fixture,
  msgId: string,
  body: string,
  mtimeMs?: number,
): Promise<string> {
  const dir = join(fx.mailbox, "outbox-claude-code");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${msgId}-dispatch.md`);
  await writeFile(path, body, "utf8");
  if (typeof mtimeMs === "number") {
    const sec = mtimeMs / 1000;
    await utimes(path, sec, sec);
  }
  return path;
}

export async function writeQueue(fx: Fixture, contents: string): Promise<string> {
  const path = join(fx.mailbox, "QUEUE.md");
  await writeFile(path, contents, "utf8");
  return path;
}

export function applyEnv(fx: Fixture): void {
  process.env["FN8_ROLES_ROOT"] = fx.rolesRoot;
  process.env["FN8_COMPLETION_WATCHER_HOME"] = fx.watcherHome;
}
