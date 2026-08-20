import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  WORKSPACE_MODE_COOKIE,
  workspaceModeState,
} from "@/domain/mode";

const modeSchema = z.object({
  mode: z.enum(["demo", "live"]),
});

function responseBody(state: Awaited<ReturnType<typeof workspaceModeState>>) {
  return {
    data: { mode: state.mode },
    meta: {
      mode: state.mode,
      defaultMode: state.defaultMode,
      locked: state.locked,
      source: state.source,
    },
  };
}

export async function GET() {
  const state = await workspaceModeState();
  return NextResponse.json(responseBody(state), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const current = await workspaceModeState();
  if (current.locked) {
    return NextResponse.json(
      {
        error: {
          code: "mode_locked",
          message: `Workspace mode is locked to ${current.mode} by AFTERPLAY_MODE_LOCK.`,
        },
        meta: { mode: current.mode, locked: true },
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

  const parsed = modeSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest("Mode must be either demo or live.");
  }

  const response = NextResponse.json({
    data: { mode: parsed.data.mode },
    meta: {
      mode: parsed.data.mode,
      defaultMode: current.defaultMode,
      locked: false,
      source: "cookie" as const,
    },
  });
  response.cookies.set(WORKSPACE_MODE_COOKIE, parsed.data.mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
