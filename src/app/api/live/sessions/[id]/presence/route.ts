import { NextResponse } from "next/server";

import { invalidRequest, liveSessionErrorResponse } from "@/app/api/http";
import { cohostPresenceSchema, updateCohostPresence } from "@/domain/live-session";

function sessionId(params: unknown): string {
  return typeof params === "object" && params !== null && "id" in params
    ? String((params as { id: unknown }).id)
    : "";
}

export async function PUT(request: Request, context: { params: Promise<unknown> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = cohostPresenceSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The cohost presence is invalid.");
  }

  try {
    return NextResponse.json({ session: updateCohostPresence(sessionId(await context.params), parsed.data) });
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
