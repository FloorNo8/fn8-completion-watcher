/**
 * read_result_envelope tool [CODE]
 */

import { readFile } from "node:fs/promises";

import { defaultFn8RolesRoot } from "../lib/paths.js";
import {
  extractCommitShas,
  extractFilesChanged,
  findResultEnvelopeByMsgId,
  parseAcceptance,
  parseFrontmatter,
} from "../lib/mailbox-utils.js";
import type { ReadResultEnvelopeResult } from "../types.js";

export type ReadResultEnvelopeArgs = {
  msgId: string;
};

export async function readResultEnvelope(
  args: ReadResultEnvelopeArgs,
): Promise<ReadResultEnvelopeResult | null> {
  const rolesRoot = defaultFn8RolesRoot();
  const path = await findResultEnvelopeByMsgId(rolesRoot, args.msgId);
  if (!path) return null;

  const raw = await readFile(path, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const parsed_commits = extractCommitShas(body);
  const parsed_files_changed = extractFilesChanged(body);
  const parsed_acceptance_status = parseAcceptance(body);

  const summary_first_500_chars = body.length > 500 ? body.slice(0, 500) + "…" : body;

  return {
    msgId: args.msgId,
    frontmatter,
    body_markdown: body,
    parsed_commits,
    parsed_files_changed,
    parsed_acceptance_status,
    summary_first_500_chars,
  };
}
