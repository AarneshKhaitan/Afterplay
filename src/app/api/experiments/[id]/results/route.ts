import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
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

/** Sample results may be recorded in a live workspace as well as a demo one.
 *
 * These metrics are invented, and in a live workspace they sit next to a real channel --
 * so the honesty guarantee has to come from the payload rather than the mode. It does:
 * `disclosure` below is a literal `"synthetic_sample_data"`, so a caller cannot record
 * these numbers without declaring what they are, and Audience renders them behind that
 * declaration. Read them as a worked example of the measurement step, never as
 * measurement. */
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
    const [{ id }, creator] = await Promise.all([context.params, currentCreator()]);
    const recorded = recordResults({
      id,
      creatorId: creator.id,
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
    persistPerClipResults(parsed.data.perClip, creator.id);
    return NextResponse.json(recorded);
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
