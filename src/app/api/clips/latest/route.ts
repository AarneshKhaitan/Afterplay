import { NextResponse } from "next/server";

import { getLatestClipManifest } from "@/domain/clip-manifest";
import { currentCreator } from "@/domain/creators";

export const dynamic = "force-dynamic";

export async function GET() {
  const creator = await currentCreator();
  const manifest = getLatestClipManifest(creator.id);
  return NextResponse.json({ manifest });
}
