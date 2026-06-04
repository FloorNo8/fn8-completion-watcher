/**
 * completion_stats tool [CODE]
 *
 * Summary aggregator over the same data exposed by recent_completions,
 * pending_dispatches, and the acknowledged.json store. Reuses existing
 * lib helpers — no new parsing logic.
 */

import { loadAcknowledged } from "../lib/acknowledged.js";
import { acknowledgedPath } from "../lib/paths.js";
import { pendingDispatches } from "./pending-dispatches.js";
import { recentCompletions } from "./recent-completions.js";

export type CompletionStatsArgs = Record<string, never>;

export type CompletionStats = {
  pending_dispatches_count: number;
  completions_last_24h_count: number;
  acknowledged_count: number;
  oldest_pending_age_minutes: number | null;
};

export async function completionStats(
  _args?: CompletionStatsArgs,
): Promise<CompletionStats> {
  const [pending, recent24h, ackMap] = await Promise.all([
    pendingDispatches({}),
    recentCompletions({ hours: 24 }),
    loadAcknowledged(acknowledgedPath()),
  ]);

  let oldest: number | null = null;
  for (const p of pending) {
    if (oldest === null || p.age_minutes > oldest) oldest = p.age_minutes;
  }

  return {
    pending_dispatches_count: pending.length,
    completions_last_24h_count: recent24h.length,
    acknowledged_count: Object.keys(ackMap).length,
    oldest_pending_age_minutes: oldest,
  };
}
