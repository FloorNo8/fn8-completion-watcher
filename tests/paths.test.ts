import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";

import {
  acknowledgedPath,
  defaultFn8RolesRoot,
  mailboxRoot,
  watcherRoot,
} from "../src/lib/paths.js";

describe("paths", () => {
  const originalRoles = process.env["FN8_ROLES_ROOT"];
  const originalWatcher = process.env["FN8_COMPLETION_WATCHER_HOME"];

  beforeEach(() => {
    delete process.env["FN8_ROLES_ROOT"];
    delete process.env["FN8_COMPLETION_WATCHER_HOME"];
  });

  afterEach(() => {
    if (originalRoles === undefined) delete process.env["FN8_ROLES_ROOT"];
    else process.env["FN8_ROLES_ROOT"] = originalRoles;
    if (originalWatcher === undefined) delete process.env["FN8_COMPLETION_WATCHER_HOME"];
    else process.env["FN8_COMPLETION_WATCHER_HOME"] = originalWatcher;
  });

  describe("defaultFn8RolesRoot", () => {
    it("honours FN8_ROLES_ROOT env when set", () => {
      process.env["FN8_ROLES_ROOT"] = "/tmp/some/roles";
      expect(defaultFn8RolesRoot()).toBe("/tmp/some/roles");
    });

    it("falls back to default path under homedir when env unset", () => {
      const v = defaultFn8RolesRoot();
      expect(v.endsWith("fn8-roles")).toBe(true);
      expect(v).toContain("Fn8 - Projects");
    });

    it("ignores empty env value and falls back", () => {
      process.env["FN8_ROLES_ROOT"] = "";
      const v = defaultFn8RolesRoot();
      expect(v.endsWith("fn8-roles")).toBe(true);
    });
  });

  describe("watcherRoot", () => {
    it("honours FN8_COMPLETION_WATCHER_HOME env when set", () => {
      process.env["FN8_COMPLETION_WATCHER_HOME"] = "/tmp/wat";
      expect(watcherRoot()).toBe("/tmp/wat");
    });

    it("returns a non-empty string when env unset", () => {
      const v = watcherRoot();
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    });
  });

  describe("acknowledgedPath", () => {
    it("composes watcherRoot + state/acknowledged.json", () => {
      process.env["FN8_COMPLETION_WATCHER_HOME"] = "/tmp/wat";
      expect(acknowledgedPath()).toBe(resolve("/tmp/wat", "state", "acknowledged.json"));
    });
  });

  describe("mailboxRoot", () => {
    it("composes rolesRoot + state/mailbox", () => {
      expect(mailboxRoot("/tmp/roles")).toBe(resolve("/tmp/roles", "state", "mailbox"));
    });
  });
});
