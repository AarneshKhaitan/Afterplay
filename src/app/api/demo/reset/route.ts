import { NextResponse } from "next/server";

import { resetExperimentStore } from "@/domain/experiment";

export async function POST() {
  return NextResponse.json({ experiment: resetExperimentStore() });
}
