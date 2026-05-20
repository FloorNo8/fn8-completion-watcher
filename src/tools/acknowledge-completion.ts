/**
 * acknowledge_completion tool [CODE]
 */

import { acknowledgeMsg } from "../lib/acknowledged.js";
import { acknowledgedPath } from "../lib/paths.js";

export type AcknowledgeCompletionArgs = {
  msgId: string;
};

export async function acknowledgeCompletion(args: AcknowledgeCompletionArgs): Promise<{ ok: boolean }> {
  try {
    await acknowledgeMsg(acknowledgedPath(), args.msgId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
