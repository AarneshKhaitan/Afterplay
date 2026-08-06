import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
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
    const { id } = await context.params;
    return NextResponse.json(dispatchExperiment({ id, revision: parsed.data.revision }));
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
