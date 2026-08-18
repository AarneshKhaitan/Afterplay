import { NextResponse } from "next/server";

import { experimentErrorResponse } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
import { getExperiment } from "@/domain/experiment";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, creator] = await Promise.all([context.params, currentCreator()]);
    return NextResponse.json({ experiment: getExperiment(id, creator.id) });
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
