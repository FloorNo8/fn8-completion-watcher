/**
 * Resolve fn8-roles bridge root and watcher state directory [CODE]
 */

import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function defaultFn8RolesRoot(): string {
  const env = process.env["FN8_ROLES_ROOT"];
  if (env && env.length > 0) return env;
  return resolve(homedir(), "My Space", "Fn8 - Projects", "fn8-roles");
}

/** Package root (contains state/, dist/) */
export function watcherRoot(): string {
  const env = process.env["FN8_COMPLETION_WATCHER_HOME"];
  if (env && env.length > 0) return env;
  return resolve(__dirname, "..", "..");
}

export function acknowledgedPath(): string {
  return resolve(watcherRoot(), "state", "acknowledged.json");
}

export function mailboxRoot(rolesRoot: string): string {
  return resolve(rolesRoot, "state", "mailbox");
}
