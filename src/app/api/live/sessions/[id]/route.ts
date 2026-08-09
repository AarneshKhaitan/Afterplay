import { NextResponse } from "next/server";

import { liveSessionErrorResponse } from "@/app/api/http";
import { getLiveSession } from "@/domain/live-session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ session: getLiveSession(id) });
  } catch (error) {
    return liveSessionErrorResponse(error);
  }
}
