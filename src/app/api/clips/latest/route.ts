import { NextResponse } from "next/server";

import { getLatestClipManifest } from "@/domain/clip-manifest";

export const dynamic = "force-dynamic";

export function GET() {
  const manifest = getLatestClipManifest();
  return NextResponse.json({ manifest });
}
