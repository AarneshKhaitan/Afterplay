import { NextResponse } from "next/server";

import { readIngestJob } from "@/domain/ingest/jobs";
import { currentCreator } from "@/domain/creators";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const [{ jobId }, creator] = await Promise.all([context.params, currentCreator()]);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
    return NextResponse.json(
      { error: { code: "invalid_job", message: "That job id is not valid." } },
      { status: 400 },
    );
  }

  const job = readIngestJob(jobId, creator.id);
  if (!job) {
    return NextResponse.json(
      { error: { code: "job_not_found", message: "No such job." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ job });
}
