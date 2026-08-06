import { NextResponse } from "next/server";

import { getDemoWorkspace } from "@/domain/workspace";

export async function GET() {
  return NextResponse.json(getDemoWorkspace(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
