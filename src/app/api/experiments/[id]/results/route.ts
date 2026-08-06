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
      },
    }));
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
