import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
import { dispatchExperiment } from "@/domain/experiment";

const dispatchSchema = z.object({
  revision: z.number().int().positive(),
});

/** Simulated distribution runs in every workspace, live included.
 *
 * It was demo-only, which dead-ended a live workspace one step after approval: Studio
 * offered the button, the server refused, and the panel showed both the reassurance and
 * the refusal at once. Nothing here contacts a platform -- it writes local receipts, and
 * every receipt renders behind a SIMULATED badge -- so the gate cost the loop its ending
 * without protecting anything the labelling does not already cover. */
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
