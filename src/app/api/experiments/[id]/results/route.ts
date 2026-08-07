import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { recordResults } from "@/domain/experiment";

const resultsSchema = z.object({
  disclosure: z.literal("synthetic_sample_data"),
  metrics: z.object({
    views: z.number().int().nonnegative(),
    returningViewerRate: z.number().min(0).max(100),
    repeatCommenters: z.number().int().nonnegative(),
    trackedLiveVisits: z.number().int().nonnegative(),
    nextStreamAverageConcurrency: z.number().nonnegative(),
  }),
  perClip: z.array(z.object({
    clip_id: z.string().min(1),
    post_id: z.string().min(1).optional(),
    platform: z.enum(["YouTube Shorts", "TikTok", "Instagram Reels"]).optional(),
    metrics: z.object({
      views: z.number().int().nonnegative(),
      likes: z.number().int().nonnegative().optional(),
      comments: z.number().int().nonnegative().optional(),
      shares: z.number().int().nonnegative().optional(),
      saves: z.number().int().nonnegative().optional(),
      avg_watch_pct: z.number().min(0).max(100).optional(),
    }),
  })).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = resultsSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The sample result is invalid.");
  }

  try {
    const { id } = await context.params;
    return NextResponse.json(recordResults({
      id,
      result: {
        disclosure: parsed.data.disclosure,
        causalClaim: false,
        metrics: parsed.data.metrics,
        perClip: parsed.data.perClip,
      },
      perClip: parsed.data.perClip,
    }));
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
