import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkspaceMode, resolveWorkspaceMode } from "../../src/domain/mode.ts";

test("workspace mode defaults to live when no environment or cookie is set", () => {
  assert.deepEqual(resolveWorkspaceMode({}), {
    mode: "live",
    defaultMode: "live",
    locked: false,
    source: "default",
  });
});

test("workspace mode overrides the configured default", () => {
  assert.equal(parseWorkspaceMode("demo"), "demo");
  assert.equal(parseWorkspaceMode("live"), "live");
  assert.equal(parseWorkspaceMode("preview"), null);
  assert.equal(resolveWorkspaceMode({ workspaceMode: "demo", configuredDefault: "live" }).mode, "demo");
  assert.deepEqual(resolveWorkspaceMode({ workspaceMode: "preview", configuredDefault: "demo" }), {
    mode: "demo",
    defaultMode: "demo",
    locked: false,
    source: "environment",
  });
});

test("mode lock ignores browser overrides and pins the configured mode", () => {
  assert.deepEqual(resolveWorkspaceMode({
    workspaceMode: "demo",
    configuredDefault: "live",
    lock: "true",
  }), {
    mode: "live",
    defaultMode: "live",
    locked: true,
    source: "lock",
  });
});

test("an invalid configured mode fails closed to live", () => {
  assert.deepEqual(resolveWorkspaceMode({ configuredDefault: "sample" }), {
    mode: "live",
    defaultMode: "live",
    locked: false,
    source: "default",
  });
});
