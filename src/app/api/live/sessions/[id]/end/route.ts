import { NextResponse } from "next/server";

import { liveSessionErrorResponse } from "@/app/api/http";
import { endLiveSession } from "@/domain/live-session";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(endLiveSession(id));
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
