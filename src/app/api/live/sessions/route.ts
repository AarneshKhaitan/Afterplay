import { NextResponse } from "next/server";

import { invalidRequest } from "@/app/api/http";
import { startLiveSession, startLiveSessionSchema } from "@/domain/live-session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = startLiveSessionSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The live session request is invalid.");
  }

  return NextResponse.json(startLiveSession(parsed.data), { status: 201 });
}
