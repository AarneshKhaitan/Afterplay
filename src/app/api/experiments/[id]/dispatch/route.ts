import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { currentCreator } from "@/domain/creators";
import { dispatchExperiment } from "@/domain/experiment";
import { workspaceModeState } from "@/domain/mode";

const dispatchSchema = z.object({
  revision: z.number().int().positive(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const modeState = await workspaceModeState();
  if (modeState.mode === "live") {
    return NextResponse.json(
      {
        error: {
          code: "demo_only",
          message: "Simulated distribution can only run in demo mode.",
        },
        meta: { mode: modeState.mode, locked: modeState.locked },
      },
      { status: 409 },
    );
  }

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
