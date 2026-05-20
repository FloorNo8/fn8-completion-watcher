/**
 * acknowledged.json — atomic-ish read / merge / write [CODE]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { PathLike } from "node:fs";

export type AckFile = {
  /** msgId → ISO timestamp when acknowledged */
  ack: Record<string, string>;
};

export async function loadAcknowledged(path: PathLike): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path, "utf8");
    const j = JSON.parse(raw) as AckFile;
    return j.ack && typeof j.ack === "object" ? j.ack : {};
  } catch {
    return {};
  }
}

export async function acknowledgeMsg(path: PathLike, msgId: string): Promise<void> {
  const dir = dirname(path as string);
  await mkdir(dir, { recursive: true });
  const cur = await loadAcknowledged(path);
  cur[msgId] = new Date().toISOString();
  const out: AckFile = { ack: cur };
  await writeFile(path, JSON.stringify(out, null, 2) + "\n", "utf8");
}

export function isAcknowledged(map: Record<string, string>, msgId: string): boolean {
  return Boolean(map[msgId]);
}
