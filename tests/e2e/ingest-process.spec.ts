import { expect, test } from "@playwright/test";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  CreatorProcessConflictError,
  durableActiveJob,
  pythonBin,
  pythonConfigured,
  registerRunningJob,
  runningJob,
  runningJobForCreator,
  unregisterRunningJob,
  workdir,
} from "../../src/domain/ingest/process";

function fakeChild(exitCode: number | null = null): ChildProcess {
  return { exitCode } as ChildProcess;
}

test("the process registry locks a creator across clip and backfill job kinds", () => {
  const clip = fakeChild();
  const backfill = fakeChild();
  const otherCreator = fakeChild();

  try {
    registerRunningJob({
      jobId: "clip_registry_test",
      creatorId: "creator_shared_registry",
      kind: "ingest",
      child: clip,
    });

    expect(runningJobForCreator("creator_shared_registry")).toMatchObject({
      jobId: "clip_registry_test",
      creatorId: "creator_shared_registry",
      kind: "ingest",
    });
    expect(() => registerRunningJob({
      jobId: "backfill_registry_test",
      creatorId: "creator_shared_registry",
      kind: "channel-backfill",
      child: backfill,
    })).toThrow(CreatorProcessConflictError);

    registerRunningJob({
      jobId: "backfill_other_creator_test",
      creatorId: "creator_other_registry",
      kind: "channel-backfill",
      child: otherCreator,
    });
    expect(runningJob(
      "backfill_other_creator_test",
      "creator_other_registry",
      "channel-backfill",
    )?.child).toBe(otherCreator);
    expect(runningJob(
      "backfill_other_creator_test",
      "creator_shared_registry",
      "channel-backfill",
    )).toBeNull();
  } finally {
    unregisterRunningJob("clip_registry_test", clip);
    unregisterRunningJob("backfill_registry_test", backfill);
    unregisterRunningJob("backfill_other_creator_test", otherCreator);
  }
});

test("exited handles are pruned before the next creator claim", () => {
  const exited = fakeChild(0);
  const replacement = fakeChild();

  try {
    registerRunningJob({
      jobId: "exited_registry_test",
      creatorId: "creator_reusable_registry",
      kind: "ingest",
      child: exited,
    });
    expect(runningJobForCreator("creator_reusable_registry")).toBeNull();

    registerRunningJob({
      jobId: "replacement_registry_test",
      creatorId: "creator_reusable_registry",
      kind: "channel-backfill",
      child: replacement,
    });
    expect(runningJobForCreator("creator_reusable_registry")?.jobId).toBe(
      "replacement_registry_test",
    );
  } finally {
    unregisterRunningJob("exited_registry_test", exited);
    unregisterRunningJob("replacement_registry_test", replacement);
  }
});

test("durable duplicate detection is creator scoped and accepts terminal artifact proof", () => {
  const root = mkdtempSync(join(tmpdir(), "afterplay-process-status-"));
  const previousWorkdir = process.env.AFTERPLAY_WORKDIR;
  process.env.AFTERPLAY_WORKDIR = root;

  const writeStatus = (jobId: string, creatorId: string, state: string) => {
    const dir = join(root, jobId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "status.json"), JSON.stringify({
      creator_id: creatorId,
      state,
    }));
  };

  try {
    writeStatus("active_shared_creator", "creator_durable", "running");
    writeStatus("foreign_creator", "creator_foreign", "cancelling");
    writeStatus("terminal_same_creator", "creator_durable", "complete");

    expect(durableActiveJob("creator_durable")).toBe("active_shared_creator");
    expect(durableActiveJob("creator_foreign")).toBe("foreign_creator");
    expect(durableActiveJob("creator_missing")).toBeNull();
    expect(durableActiveJob(
      "creator_durable",
      (jobId, creatorId) => jobId === "active_shared_creator"
        && creatorId === "creator_durable",
    )).toBeNull();
  } finally {
    if (previousWorkdir === undefined) delete process.env.AFTERPLAY_WORKDIR;
    else process.env.AFTERPLAY_WORKDIR = previousWorkdir;
    rmSync(root, { recursive: true, force: true });
  }
});

test("shared path and interpreter resolution preserve the ingest environment contract", () => {
  const root = mkdtempSync(join(tmpdir(), "afterplay-process-config-"));
  const interpreter = join(root, "python-test.exe");
  writeFileSync(interpreter, "");

  const previousPython = process.env.AFTERPLAY_PYTHON;
  const previousWorkdir = process.env.AFTERPLAY_WORKDIR;
  try {
    process.env.AFTERPLAY_PYTHON = interpreter;
    process.env.AFTERPLAY_WORKDIR = join("relative", "workflow-workdir");

    expect(pythonBin()).toBe(interpreter);
    expect(pythonConfigured()).toEqual({ ok: true, interpreter });
    expect(workdir()).toBe(resolve("relative", "workflow-workdir"));
  } finally {
    if (previousPython === undefined) delete process.env.AFTERPLAY_PYTHON;
    else process.env.AFTERPLAY_PYTHON = previousPython;
    if (previousWorkdir === undefined) delete process.env.AFTERPLAY_WORKDIR;
    else process.env.AFTERPLAY_WORKDIR = previousWorkdir;
    rmSync(root, { recursive: true, force: true });
  }
});
