import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  creatorCookieName, currentCreator, GUEST, isSelectableCreator, listCreators,
} from "@/domain/creators";
import {
  CreatorWorkspaceError,
  renameWorkspace,
  upsertWorkspace,
} from "@/domain/creator-workspaces";

export const dynamic = "force-dynamic";

export async function GET() {
  const [active, all] = await Promise.all([currentCreator(), Promise.resolve(listCreators())]);
  return NextResponse.json({ active, creators: [...all, GUEST] });
}

const selectSchema = z.object({ id: z.string().min(1).max(80) });

const createSchema = z.object({
  id: z.string().min(1).max(60),
  channelId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(120),
  handle: z.string().trim().max(120).optional().default(""),
  mode: z.enum(["demo", "live"]).optional().default("live"),
});

const renameSchema = z.object({
  id: z.string().min(1).max(60),
  displayName: z.string().trim().min(1).max(120),
});

async function parseJson(request: Request): Promise<
  { ok: true; body: unknown } | { ok: false }
> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function selectedResponse(id: string, body: Record<string, unknown> = { id }) {
  const response = NextResponse.json(body);
  response.cookies.set(creatorCookieName(), id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

function workspaceErrorResponse(error: unknown) {
  if (!(error instanceof CreatorWorkspaceError)) throw error;
  const status = error.code === "creator_id_collision"
    ? 409
    : error.code === "workspace_not_found"
      ? 404
      : 400;
  return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
}

export async function POST(request: Request) {
  const decoded = await parseJson(request);
  if (!decoded.ok) {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = selectSchema.safeParse(decoded.body);
  if (!parsed.success) return invalidRequest("A creator id is required.");

  if (!isSelectableCreator(parsed.data.id)) {
    return NextResponse.json({
      error: {
        code: "unknown_creator",
        message: "That creator has no channel memory on this machine.",
      },
    }, { status: 404 });
  }

  return selectedResponse(parsed.data.id);
}

export async function PUT(request: Request) {
  const decoded = await parseJson(request);
  if (!decoded.ok) return invalidRequest("The request body must be valid JSON.");

  const parsed = createSchema.safeParse(decoded.body);
  if (!parsed.success) {
    return invalidRequest("A valid creator id, channel id, and display name are required.");
  }

  try {
    const workspace = upsertWorkspace(parsed.data);
    return selectedResponse(workspace.id, { id: workspace.id, workspace });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const decoded = await parseJson(request);
  if (!decoded.ok) return invalidRequest("The request body must be valid JSON.");

  const parsed = renameSchema.safeParse(decoded.body);
  if (!parsed.success) return invalidRequest("A valid creator id and display name are required.");

  try {
    return NextResponse.json({ workspace: renameWorkspace(parsed.data.id, parsed.data.displayName) });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
