import { NextResponse } from "next/server";

import { invalidRequest } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
import {
  createLiveExperimentFromRecommendation,
  getLiveExperiment,
  LiveExperimentError,
  parseRecommendationExperimentInput,
} from "@/domain/live-experiments";
import { loadScanForCreator } from "@/domain/intel/store";

function liveExperimentErrorResponse(error: unknown) {
  if (error instanceof LiveExperimentError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const creator = await currentCreator();
    return NextResponse.json({ experiment: getLiveExperiment(creator.id) });
  } catch (error) {
    return liveExperimentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || !("recommendation" in body)) {
    return invalidRequest("A recommendation is required.");
  }

  try {
    const creator = await currentCreator();
    const recommendation = parseRecommendationExperimentInput(
      (body as { recommendation: unknown }).recommendation,
    );
    const scan = loadScanForCreator(recommendation.scanId, creator.id);
    if (!scan) {
      return NextResponse.json(
        {
          error: {
            code: "scan_creator_mismatch",
            message: "The recommendation does not belong to the active creator workspace.",
          },
        },
        { status: 403 },
      );
    }
    return NextResponse.json({
      experiment: createLiveExperimentFromRecommendation(
        creator.id,
        recommendation,
      ),
    }, { status: 201 });
  } catch (error) {
    return liveExperimentErrorResponse(error);
  }
}
