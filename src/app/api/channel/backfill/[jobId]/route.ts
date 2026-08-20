import { NextResponse } from "next/server";

import {
  cancelChannelBackfillJob,
  ChannelBackfillError,
  loadJobForCreator,
} from "@/domain/channel/backfill";
import { JOB_ID_PATTERN } from "@/domain/channel/contracts";
import { currentCreator } from "@/domain/creators";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: Context) {
  const [{ jobId }, creator] = await Promise.all([context.params, currentCreator()]);
  if (!JOB_ID_PATTERN.test(jobId)) return invalidJob();

  const job = loadJobForCreator(jobId, creator.id);
  if (!job) return jobNotFound();
  return NextResponse.json({ job });
}

export async function DELETE(_request: Request, context: Context) {
  const [{ jobId }, creator] = await Promise.all([context.params, currentCreator()]);
  if (!JOB_ID_PATTERN.test(jobId)) return invalidJob();

  try {
    const job = await cancelChannelBackfillJob(jobId, creator.id);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ChannelBackfillError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "cancel_failed", message: "The channel backfill could not be stopped." } },
      { status: 500 },
    );
  }
}

function invalidJob() {
  return NextResponse.json(
    { error: { code: "invalid_job", message: "That job id is not valid." } },
    { status: 400 },
  );
}

function jobNotFound() {
  return NextResponse.json(
    { error: { code: "job_not_found", message: "No such channel backfill job." } },
    { status: 404 },
  );
}

