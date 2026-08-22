import { NextResponse } from "next/server";

import { liveSessionErrorResponse } from "@/app/api/http";
import { endLiveSession } from "@/domain/live-session";

function sessionId(params: unknown): string {
  return typeof params === "object" && params !== null && "id" in params
    ? String((params as { id: unknown }).id)
    : "";
}

export async function POST(_request: Request, context: { params: Promise<unknown> }) {
  try {
    return NextResponse.json(endLiveSession(sessionId(await context.params)));
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
