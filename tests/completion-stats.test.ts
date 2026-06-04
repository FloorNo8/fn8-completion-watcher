/**
 * completion_stats — summary aggregator [TEST]
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { completionStats } from "../src/tools/completion-stats.js";
import {
  createFixture,
  writeAcknowledged,
  writeDispatch,
  writeResult,
  type Fixture,
} from "./fixtures.js";

const MIN = 60_000;

describe("completion_stats", () => {
  let fx: Fixture;
  let prevRoles: string | undefined;
  let prevWatcher: string | undefined;

  beforeEach(async () => {
    fx = await createFixture();
    prevRoles = process.env["FN8_ROLES_ROOT"];
    prevWatcher = process.env["FN8_COMPLETION_WATCHER_HOME"];
    process.env["FN8_ROLES_ROOT"] = fx.rolesRoot;
    process.env["FN8_COMPLETION_WATCHER_HOME"] = fx.watcherRoot;
  });

  afterEach(async () => {
    if (prevRoles === undefined) delete process.env["FN8_ROLES_ROOT"];
    else process.env["FN8_ROLES_ROOT"] = prevRoles;
    if (prevWatcher === undefined) delete process.env["FN8_COMPLETION_WATCHER_HOME"];
    else process.env["FN8_COMPLETION_WATCHER_HOME"] = prevWatcher;
    await fx.cleanup();
  });

  it("aggregates pending, recent completions, acks, and oldest pending age", async () => {
    const now = Date.now();

    // MSG-100: dispatched + completed (cursor) → counts as recent completion, NOT pending.
    await writeDispatch(fx.rolesRoot, "MSG-100", "cursor", now - 20 * MIN);
    await writeResult(fx.rolesRoot, "MSG-100", "cursor", now - 15 * MIN);

    // MSG-101: dispatched 30 min ago, no result → pending (newer).
    await writeDispatch(fx.rolesRoot, "MSG-101", "bob", now - 30 * MIN);

    // MSG-102: dispatched 6 hours ago, no result → pending (oldest).
    await writeDispatch(fx.rolesRoot, "MSG-102", "codex", now - 360 * MIN);

    await writeAcknowledged(fx.watcherRoot, {
      "MSG-100": new Date(now).toISOString(),
    });

    const stats = await completionStats();

    expect(stats.pending_dispatches_count).toBe(2);
    expect(stats.completions_last_24h_count).toBe(1);
    expect(stats.acknowledged_count).toBe(1);
    expect(stats.oldest_pending_age_minutes).toBeGreaterThanOrEqual(355);
    expect(stats.oldest_pending_age_minutes).toBeLessThanOrEqual(365);
  });

  it("returns null oldest age when there are no pending dispatches", async () => {
    await writeAcknowledged(fx.watcherRoot, {});
    const stats = await completionStats();
    expect(stats.pending_dispatches_count).toBe(0);
    expect(stats.oldest_pending_age_minutes).toBeNull();
    expect(stats.acknowledged_count).toBe(0);
  });
});
