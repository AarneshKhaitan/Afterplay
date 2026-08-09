import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { recordResults } from "@/domain/experiment";
// Imported here, not from domain/experiment, because the bridge touches node:fs and
// `experiment` is pulled into client bundles. Route handlers are server-only.
import { persistPerClipResults } from "@/domain/results-bridge";

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
    const recorded = recordResults({
      id,
      result: {
        disclosure: parsed.data.disclosure,
        causalClaim: false,
        metrics: parsed.data.metrics,
        perClip: parsed.data.perClip,
      },
      perClip: parsed.data.perClip,
    });
    // Feed outcomes back into the clipper's ranking priors. Never allowed to fail the
    // request — the bridge swallows and logs its own errors.
    persistPerClipResults(parsed.data.perClip);
    return NextResponse.json(recorded);
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
