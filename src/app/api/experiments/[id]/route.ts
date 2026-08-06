import { NextResponse } from "next/server";

import { experimentErrorResponse } from "@/app/api/http";
import { getExperiment } from "@/domain/experiment";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ experiment: getExperiment(id) });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
