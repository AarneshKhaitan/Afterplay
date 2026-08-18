import { NextResponse } from "next/server";

import { resetExperimentStore } from "@/domain/experiment";
import { resetLiveSessionStore } from "@/domain/live-session";

export async function POST() {
  resetLiveSessionStore();
  return NextResponse.json({ experiment: resetExperimentStore() });
}
