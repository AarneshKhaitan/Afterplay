import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  ChannelBackfillError,
  latestFinishedBackfillJobId,
  startChannelBackfillJob,
} from "@/domain/channel/backfill";
import {
  CREATOR_ID_PATTERN,
  footageRightsSchema,
  VIDEO_ID_PATTERN,
} from "@/domain/channel/contracts";
import { currentCreator } from "@/domain/creators";
import { demoReplayEnabled } from "@/domain/demo-replay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startRequestSchema = z.object({
  channel: z.string().trim().min(2).max(300),
  creatorId: z.string().regex(CREATOR_ID_PATTERN),
  videoIds: z.array(z.string().regex(VIDEO_ID_PATTERN)).min(1).max(5),
  footageRights: footageRightsSchema,
  workers: z.number().int().min(1).max(16).default(8),
}).strict().superRefine((value, context) => {
  if (new Set(value.videoIds).size !== value.videoIds.length) {
    context.addIssue({ code: "custom", message: "Video ids must be unique.", path: ["videoIds"] });
  }
});

/** What the channel console needs to decide between a real run and the stage replay. */
export async function GET() {
  const creator = await currentCreator();
  return NextResponse.json({
    demoReplay: await demoReplayEnabled(),
    // Scoped to the selected creator, so a workspace with no cached run does the real
    // thing even with replay on. Building memory for a brand-new channel cannot be
    // satisfied by replaying somebody else's run.
    replayJobId: latestFinishedBackfillJobId(creator.id),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = startRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The channel backfill request is invalid.");
  }

  const creator = await currentCreator();
  if (parsed.data.creatorId !== creator.id) {
    return NextResponse.json({
      error: {
        code: "creator_mismatch",
        message: "The channel backfill does not belong to the active creator workspace.",
      },
    }, { status: 409 });
  }

  try {
    const job = startChannelBackfillJob({
      channel: parsed.data.channel,
      creatorId: parsed.data.creatorId,
      videoIds: parsed.data.videoIds,
      footageRights: parsed.data.footageRights,
      workers: parsed.data.workers,
    });
    return NextResponse.json({ jobId: job.jobId, job }, { status: 202 });
  } catch (error) {
    return channelErrorResponse(error);
  }
}

function channelErrorResponse(error: unknown) {
  if (error instanceof ChannelBackfillError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: "channel_backfill_failed", message: "The channel backfill could not start." } },
    { status: 500 },
  );
}

