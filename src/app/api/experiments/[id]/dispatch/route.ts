import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
import { dispatchExperiment } from "@/domain/experiment";

const dispatchSchema = z.object({
  revision: z.number().int().positive(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The dispatch request is invalid.");
  }

  try {
    const [{ id }, creator] = await Promise.all([context.params, currentCreator()]);
    return NextResponse.json(dispatchExperiment({
      id,
      revision: parsed.data.revision,
      creatorId: creator.id,
    }));
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
