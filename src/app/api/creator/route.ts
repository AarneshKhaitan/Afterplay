import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  creatorCookieName, currentCreator, GUEST, isSelectableCreator, listCreators,
} from "@/domain/creators";

export const dynamic = "force-dynamic";

export async function GET() {
  const [active, all] = await Promise.all([currentCreator(), Promise.resolve(listCreators())]);
  return NextResponse.json({ active, creators: [...all, GUEST] });
}

const selectSchema = z.object({ id: z.string().min(1).max(80) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) return invalidRequest("A creator id is required.");

  if (!isSelectableCreator(parsed.data.id)) {
    return NextResponse.json({
      error: {
        code: "unknown_creator",
        message: "That creator has no channel memory on this machine.",
      },
    }, { status: 404 });
  }

  const response = NextResponse.json({ id: parsed.data.id });
  response.cookies.set(creatorCookieName(), parsed.data.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
