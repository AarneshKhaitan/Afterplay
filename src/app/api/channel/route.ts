import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import { ChannelBackfillError, previewChannel } from "@/domain/channel/backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const previewRequestSchema = z.object({
  channel: z.string().trim().min(2).max(300),
  limit: z.number().int().min(1).max(25).default(5),
}).strict();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The channel preview request is invalid.");
  }

  try {
    const preview = await previewChannel(parsed.data.channel, parsed.data.limit);
    return NextResponse.json({ preview });
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
    { error: { code: "channel_preview_failed", message: "The channel preview failed unexpectedly." } },
    { status: 500 },
  );
}

