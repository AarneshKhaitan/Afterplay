import { NextResponse } from "next/server";
import { z } from "zod";

import { turnPacketSchema } from "@/ai/cohost";
import { invalidRequest, liveSessionErrorResponse } from "@/app/api/http";
import { submitLiveTurn } from "@/domain/live-session";

const liveOutputSchema = z.object({
  liveUtterance: z.string().trim().min(1).max(280).optional(),
});

function sessionId(params: unknown): string {
  return typeof params === "object" && params !== null && "id" in params
    ? String((params as { id: unknown }).id)
    : "";
}

export async function POST(request: Request, context: { params: Promise<unknown> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = turnPacketSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The cohost turn is invalid.");
  }
  const liveOutput = liveOutputSchema.safeParse(body);

  try {
    return NextResponse.json(
      submitLiveTurn(
        sessionId(await context.params),
        parsed.data,
        liveOutput.success ? liveOutput.data.liveUtterance : undefined,
      ),
    );
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
