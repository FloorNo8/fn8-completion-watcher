import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acknowledgeMsg,
  isAcknowledged,
  loadAcknowledged,
} from "../src/lib/acknowledged.js";

let dir: string;
let ackPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fn8cwt-ack-"));
  ackPath = join(dir, "state", "acknowledged.json");
});

describe("loadAcknowledged", () => {
  it("returns {} when file does not exist", async () => {
    expect(await loadAcknowledged(ackPath)).toEqual({});
  });

  it("returns {} on invalid JSON", async () => {
    await mkdir(join(dir, "state"), { recursive: true });
    await writeFile(ackPath, "{ not json", "utf8");
    expect(await loadAcknowledged(ackPath)).toEqual({});
  });

  it("returns {} when ack key is missing", async () => {
    await mkdir(join(dir, "state"), { recursive: true });
    await writeFile(ackPath, JSON.stringify({ other: 1 }), "utf8");
    expect(await loadAcknowledged(ackPath)).toEqual({});
  });

  it("returns the ack map when present", async () => {
    await mkdir(join(dir, "state"), { recursive: true });
    await writeFile(
      ackPath,
      JSON.stringify({ ack: { "MSG-1": "2026-01-01T00:00:00Z" } }),
      "utf8",
    );
    expect(await loadAcknowledged(ackPath)).toEqual({
      "MSG-1": "2026-01-01T00:00:00Z",
    });
  });
});

describe("acknowledgeMsg", () => {
  it("creates the parent directory and writes a fresh file", async () => {
    await acknowledgeMsg(ackPath, "MSG-42");
    const raw = await readFile(ackPath, "utf8");
    const parsed = JSON.parse(raw) as { ack: Record<string, string> };
    expect(parsed.ack["MSG-42"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("merges with existing ack entries", async () => {
    await acknowledgeMsg(ackPath, "MSG-1");
    await acknowledgeMsg(ackPath, "MSG-2");
    const map = await loadAcknowledged(ackPath);
    expect(Object.keys(map).sort()).toEqual(["MSG-1", "MSG-2"]);
  });

  it("overwrites a prior ack timestamp for the same msgId", async () => {
    await acknowledgeMsg(ackPath, "MSG-1");
    const first = (await loadAcknowledged(ackPath))["MSG-1"];
    await new Promise((r) => setTimeout(r, 5));
    await acknowledgeMsg(ackPath, "MSG-1");
    const second = (await loadAcknowledged(ackPath))["MSG-1"];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });
});

describe("isAcknowledged", () => {
  it("is true when msgId is present", () => {
    expect(isAcknowledged({ "MSG-1": "ts" }, "MSG-1")).toBe(true);
  });

  it("is false when msgId is absent", () => {
    expect(isAcknowledged({ "MSG-1": "ts" }, "MSG-2")).toBe(false);
  });

  it("is false on an empty map", () => {
    expect(isAcknowledged({}, "MSG-1")).toBe(false);
  });
});
