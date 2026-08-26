import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  configuredDemoReplay,
  DEMO_REPLAY_COOKIE,
  demoReplayEnabled,
} from "@/domain/demo-replay";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    enabled: await demoReplayEnabled(),
    configuredDefault: configuredDemoReplay(),
  });
}

const schema = z.object({ enabled: z.boolean() });

/** Flip replay on or off for this browser. Takes effect on the next action -- no
 * rebuild, no restart, which is the entire point of it being a cookie. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidRequest("`enabled` must be true or false.");

  const response = NextResponse.json({ enabled: parsed.data.enabled });
  response.cookies.set(DEMO_REPLAY_COOKIE, parsed.data.enabled ? "on" : "off", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
