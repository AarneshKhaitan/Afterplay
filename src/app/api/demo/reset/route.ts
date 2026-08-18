import { NextResponse } from "next/server";

import { currentCreator } from "@/domain/creators";
import { resetExperimentStore } from "@/domain/experiment";
import { resetLiveSessionStore } from "@/domain/live-session";

export async function POST() {
  const creator = await currentCreator();
  resetLiveSessionStore();
  return NextResponse.json({ experiment: resetExperimentStore(creator.id) });
}
