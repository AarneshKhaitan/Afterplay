import { NextResponse } from "next/server";

import { invalidRequest, liveSessionErrorResponse } from "@/app/api/http";
import { cohostPresenceSchema, updateCohostPresence } from "@/domain/live-session";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const { id } = await context.params;
    return NextResponse.json({ session: updateCohostPresence(id, parsed.data) });
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
