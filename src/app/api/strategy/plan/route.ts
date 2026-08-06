import { NextResponse } from "next/server";
import { z } from "zod";

import {
  runDemoStrategy,
  runLiveStrategy,
  StrategyDirectorError,
  strategyInputSchema,
} from "@/ai/strategy";
import { invalidRequest } from "@/app/api/http";

const requestSchema = z.object({
  mode: z.enum(["demo", "live"]),
  input: strategyInputSchema,
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The strategy request is invalid.");
  }

  const { mode, input } = parsed.data;
  try {
    if (mode === "demo") {
      return NextResponse.json({
        meta: { mode, model: null, validated: true, fallbackUsed: false },
        proposal: runDemoStrategy(input),
      });
    }

    const live = await runLiveStrategy(input);
    return NextResponse.json({
      meta: { mode, model: live.model, validated: true, fallbackUsed: false },
      proposal: live.proposal,
    });
  } catch (error) {
    if (error instanceof StrategyDirectorError) {
      return NextResponse.json(
        {
          error: { code: error.code, message: error.message },
          meta: { mode, fallbackUsed: false },
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: { code: "internal_error", message: "An unexpected error occurred." },
        meta: { mode, fallbackUsed: false },
      },
      { status: 500 },
    );
  }
}
