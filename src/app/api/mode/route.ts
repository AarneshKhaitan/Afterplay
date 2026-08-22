import { NextResponse } from "next/server";

import { workspaceModeState } from "@/domain/mode";

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

export async function POST() {
  const current = await workspaceModeState();
  return NextResponse.json(
    {
      error: {
        code: "workspace_scoped",
        message: `Mode is derived from the selected workspace (${current.mode}). Use the workspace switcher or /setup instead.`,
      },
      meta: {
        mode: current.mode,
        locked: current.locked,
        source: current.source,
      },
    },
    { status: 409 },
  );
}
