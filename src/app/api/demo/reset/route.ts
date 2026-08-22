import { NextResponse } from "next/server";

import { currentCreator } from "@/domain/creators";
import { resetExperimentStore } from "@/domain/experiment";
import { resetLiveSessionStore } from "@/domain/live-session";
import { workspaceModeState } from "@/domain/mode";

export async function POST() {
  const modeState = await workspaceModeState();
  if (modeState.mode === "live") {
    return NextResponse.json(
      {
        error: {
          code: "demo_only",
          message: "The synthetic demo store can only be reset in demo mode.",
        },
        meta: { mode: modeState.mode, locked: modeState.locked },
      },
      { status: 409 },
    );
  }

  const creator = await currentCreator();
  resetLiveSessionStore();
  return NextResponse.json({ experiment: resetExperimentStore(creator.id) });
}
