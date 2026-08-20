import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  CreatorWorkspaceError,
  listWorkspaces,
  renameWorkspace,
  upsertWorkspace,
} from "../../src/domain/creator-workspaces";
import { isSelectableCreator, listCreators } from "../../src/domain/creators";

let root: string;
let previousMemory: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "afterplay-workspaces-"));
  previousMemory = process.env.AFTERPLAY_MEMORY;
  process.env.AFTERPLAY_MEMORY = root;
});

afterEach(() => {
  if (previousMemory === undefined) delete process.env.AFTERPLAY_MEMORY;
  else process.env.AFTERPLAY_MEMORY = previousMemory;
  rmSync(root, { recursive: true, force: true });
});

describe("creator workspace registry", () => {
  test("writes an atomic versioned registry and round-trips workspace metadata", () => {
    const workspace = upsertWorkspace({
      id: "hindi_streamer",
      channelId: "UC-hindi",
      displayName: "Hindi Streamer",
      handle: "@hindistreamer",
    });

    assert.deepEqual(listWorkspaces(), [workspace]);
    assert.deepEqual(JSON.parse(readFileSync(join(root, "workspaces.json"), "utf-8")), {
      _afterplay: {
        format: "afterplay.versioned-json",
        schema: "creator.workspaces",
        version: 1,
      },
      value: { workspaces: [workspace] },
    });
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".tmp")), []);
  });

  test("updates the same channel but rejects rebinding an id to another channel", () => {
    upsertWorkspace({
      id: "creator_one",
      channelId: "UC-one",
      displayName: "Original",
      handle: "@one",
    });
    upsertWorkspace({
      id: "creator_one",
      channelId: "UC-one",
      displayName: "Updated",
      handle: "@updated",
    });

    assert.equal(listWorkspaces()[0].displayName, "Updated");
    assert.throws(
      () => upsertWorkspace({
        id: "creator_one",
        channelId: "UC-two",
        displayName: "Collision",
        handle: "@two",
      }),
      (error: unknown) =>
        error instanceof CreatorWorkspaceError && error.code === "creator_id_collision",
    );
    assert.equal(listWorkspaces()[0].channelId, "UC-one");
  });

  test("validates Python-provided ids and reserves the guest workspace", () => {
    for (const id of ["MixedCase", "has-dash", "../escape", "", "x".repeat(61)]) {
      assert.throws(
        () => upsertWorkspace({ id, channelId: "UC-one", displayName: "Invalid", handle: "" }),
        (error: unknown) =>
          error instanceof CreatorWorkspaceError && error.code === "invalid_creator_id",
      );
    }
    assert.throws(
      () => upsertWorkspace({ id: "guest", channelId: "UC-one", displayName: "Guest", handle: "" }),
      (error: unknown) =>
        error instanceof CreatorWorkspaceError && error.code === "reserved_creator_id",
    );
  });

  test("renames an existing workspace without changing its channel binding", () => {
    upsertWorkspace({
      id: "creator_one",
      channelId: "UC-one",
      displayName: "Original",
      handle: "@one",
    });

    assert.deepEqual(renameWorkspace("creator_one", "  New Name  "), {
      id: "creator_one",
      channelId: "UC-one",
      displayName: "New Name",
      handle: "@one",
    });
    assert.throws(
      () => renameWorkspace("missing", "Name"),
      (error: unknown) =>
        error instanceof CreatorWorkspaceError && error.code === "workspace_not_found",
    );
  });
});

describe("creator discovery", () => {
  test("unions registry and disk, preferring registry names and disk-derived counts", () => {
    upsertWorkspace({
      id: "probe_ksi",
      channelId: "UC-sidemen",
      displayName: "Renamed Sidemen",
      handle: "@moresidemen",
    });
    upsertWorkspace({
      id: "cold_creator",
      channelId: "UC-cold",
      displayName: "Cold Creator",
      handle: "@cold",
    });

    const memoryDir = join(root, "probe_ksi");
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(join(memoryDir, "threads.json"), JSON.stringify([{
      id: "verified-thread",
      first_seen: {
        stream_id: "historical-stream",
        t: 12,
        quote: "Verified quote",
        verified: true,
      },
      mentions: [],
    }]), "utf-8");

    const creators = listCreators();
    const stored = creators.find((creator) => creator.id === "probe_ksi");
    const cold = creators.find((creator) => creator.id === "cold_creator");

    assert.deepEqual(stored, {
      id: "probe_ksi",
      displayName: "Renamed Sidemen",
      handle: "@moresidemen",
      initials: "RS",
      threads: 1,
      streams: 1,
      known: true,
      hasMemory: true,
    });
    assert.deepEqual(cold, {
      id: "cold_creator",
      displayName: "Cold Creator",
      handle: "@cold",
      initials: "CC",
      threads: 0,
      streams: 0,
      known: true,
      hasMemory: false,
    });
    assert.equal(isSelectableCreator("cold_creator"), true);
  });
});
