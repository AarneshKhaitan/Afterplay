import { NextResponse } from "next/server";
import { z } from "zod";

import { turnPacketSchema } from "@/ai/cohost";
import { invalidRequest, liveSessionErrorResponse } from "@/app/api/http";
import { submitLiveTurn } from "@/domain/live-session";

const liveOutputSchema = z.object({
  liveUtterance: z.string().trim().min(1).max(280).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const { id } = await context.params;
    return NextResponse.json(
      submitLiveTurn(id, parsed.data, liveOutput.success ? liveOutput.data.liveUtterance : undefined),
    );
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
