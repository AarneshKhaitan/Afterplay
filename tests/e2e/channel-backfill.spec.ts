import { expect, test } from "@playwright/test";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

import {
  cancelChannelBackfillJob,
  ChannelBackfillError,
  loadJob,
  previewChannel,
  startChannelBackfillJob,
} from "../../src/domain/channel/backfill";
import {
  registerRunningJob,
  unregisterRunningJob,
  workdir,
  type SpawnPythonJobOptions,
} from "../../src/domain/ingest/process";

type FakeChild = ChildProcess & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    exitCode: null,
    pid: Math.floor(Math.random() * 10_000) + 1_000,
  }) as unknown as FakeChild;
}

async function expectChannelError(
  promise: Promise<unknown>,
  code: string,
  status: number,
) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ChannelBackfillError);
  expect(caught).toMatchObject({ code, status });
}

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5_000;
  let value = read();
  while (!predicate(value)) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for channel test state.");
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = read();
  }
  return value;
}

function withWorkdir<T>(fn: () => Promise<T> | T): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "afterplay-channel-backfill-"));
  const previousWorkdir = process.env.AFTERPLAY_WORKDIR;
  const previousClipperWorkdir = process.env.AFTERPLAY_CLIPPER_WORKDIR;
  process.env.AFTERPLAY_WORKDIR = root;
  process.env.AFTERPLAY_CLIPPER_WORKDIR = root;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previousWorkdir === undefined) delete process.env.AFTERPLAY_WORKDIR;
      else process.env.AFTERPLAY_WORKDIR = previousWorkdir;
      if (previousClipperWorkdir === undefined) delete process.env.AFTERPLAY_CLIPPER_WORKDIR;
      else process.env.AFTERPLAY_CLIPPER_WORKDIR = previousClipperWorkdir;
      rmSync(root, { recursive: true, force: true });
    });
}

function writeChildReport(
  childJobId: string,
  creatorId: string,
  videoId: string,
  state: "complete" | "failed" = "complete",
) {
  const dir = join(workdir(), childJobId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.json"), JSON.stringify({
    schema: "afterplay.channel-backfill-report",
    version: 1,
    mode: "run",
    job_id: childJobId,
    creator_id: creatorId,
    channel: "https://youtube.com/@channel",
    footage_rights: "not_cleared",
    captions_only: true,
    asr_used: false,
    workers: 1,
    state,
    progress: { done: 1, total: 1 },
    videos_succeeded: state === "complete" ? 1 : 0,
    videos_failed: state === "failed" ? 1 : 0,
    videos: [{
      video_id: videoId,
      url: `https://youtube.com/watch?v=${videoId}`,
      state,
      sections_read: 3,
      sections_total: 3,
      sections_failed: 0,
      threads_suggested: 2,
      threads_added: state === "complete" ? 2 : 0,
      error: state === "failed" ? "Captions unavailable." : null,
      transcript_language: "en",
      transcript_source: "youtube_captions",
      subtitle_track: "en",
    }],
    memory_path: join(workdir(), "memory.json"),
    provenance_path: null,
    started: 1,
    finished: 2,
  }));
}

test("channel preview maps Python errors and the 25 second timeout contract", async () => {
  for (const [pythonCode, expectedCode, expectedStatus] of [
    ["channel_blocked", "channel_blocked", 503],
    ["channel_timeout", "channel_timeout", 504],
    ["invalid_channel", "invalid_channel", 400],
  ] as const) {
    const child = fakeChild();
    const promise = previewChannel("@creator", 5, {
      spawn: () => child,
      timeoutMs: 10_000,
    });
    child.stderr.emit("data", JSON.stringify({ error: pythonCode, message: `${pythonCode} message` }));
    child.emit("exit", 1, null);
    await expectChannelError(promise, expectedCode, expectedStatus);
  }

  const child = fakeChild();
  const promise = previewChannel("@slow", 5, {
    spawn: () => child,
    timeoutMs: 1,
    terminate: async () => undefined,
  });
  await expectChannelError(promise, "channel_timeout", 504);
});

test("channel backfill runs one Python child per video sequentially and records partial success", async () => {
  await withWorkdir(async () => {
    const spawned: Array<{ options: SpawnPythonJobOptions; child: FakeChild }> = [];
    const job = startChannelBackfillJob({
      channel: "https://youtube.com/@channel",
      creatorId: "creator_channel_seq",
      videoIds: ["video_one", "video_two"],
      footageRights: "not_cleared",
      workers: 1,
    }, {
      pollMs: 5,
      spawn: (options) => {
        const child = fakeChild();
        spawned.push({ options, child });
        return child;
      },
    });

    await waitFor(() => spawned.length, (count) => count === 1);
    expect(spawned[0].options.args).toEqual(expect.arrayContaining(["--videos", "video_one"]));
    expect(spawned).toHaveLength(1);

    writeChildReport(spawned[0].options.jobId, "creator_channel_seq", "video_one", "complete");
    spawned[0].child.emit("exit", 0, null);

    await waitFor(() => spawned.length, (count) => count === 2);
    expect(spawned[1].options.args).toEqual(expect.arrayContaining(["--videos", "video_two"]));

    writeChildReport(spawned[1].options.jobId, "creator_channel_seq", "video_two", "failed");
    spawned[1].child.emit("exit", 0, null);

    const finished = await waitFor(
      () => loadJob(job.jobId),
      (current) => current?.state === "partial",
    );
    expect(finished).toMatchObject({
      creatorId: "creator_channel_seq",
      state: "partial",
      progress: { done: 2, total: 2 },
      videos: [
        { videoId: "video_one", state: "complete", threadsAdded: 2 },
        { videoId: "video_two", state: "failed", error: "Captions unavailable." },
      ],
    });
  });
});

test("channel cancellation stops the active child and marks queued videos cancelled", async () => {
  await withWorkdir(async () => {
    let activeChild: FakeChild | null = null;
    const job = startChannelBackfillJob({
      channel: "https://youtube.com/@channel",
      creatorId: "creator_channel_cancel",
      videoIds: ["video_one", "video_two"],
      footageRights: "not_cleared",
      workers: 1,
    }, {
      pollMs: 5,
      spawn: (options) => {
        activeChild = fakeChild();
        registerRunningJob({
          jobId: options.jobId,
          creatorId: options.creatorId,
          kind: options.kind,
          child: activeChild,
        });
        return activeChild;
      },
    });

    await waitFor(() => loadJob(job.jobId), (current) => current?.activeChildId !== null);
    const cancelled = await cancelChannelBackfillJob(job.jobId, "creator_channel_cancel", {
      terminate: async (child) => {
        expect(child).toBe(activeChild);
      },
    });

    expect(cancelled).toMatchObject({
      state: "cancelled",
      activeChildId: null,
      progress: { done: 2, total: 2 },
      videos: [
        { videoId: "video_one", state: "cancelled", error: "Cancelled before this video completed." },
        { videoId: "video_two", state: "cancelled", error: "Cancelled before this video started." },
      ],
    });
    if (activeChild) unregisterRunningJob(cancelled.videos[0].childJobId, activeChild);
  });
});
