import { NextResponse } from "next/server";
import { z } from "zod";

import { currentCreator } from "@/domain/creators";
import { invalidRequest } from "@/app/api/http";
import { apifyConfigured, MAX_RESULTS_PER_SCAN } from "@/domain/intel/apify";
import { startScan } from "@/domain/intel/pipeline";
import { cacheStats, latestCompleteScan, listScans } from "@/domain/intel/store";

export const dynamic = "force-dynamic";

const scanSchema = z.object({
  creatorId: z.string().min(1).max(80).optional(),
  ownChannel: z.string().min(1).max(300),
  competitors: z.array(z.string().min(1).max(300)).max(5).default([]),
  videosPerChannel: z.number().int().min(3).max(50).default(12),
  withTranscripts: z.boolean().default(true),
  sortVideosBy: z.enum(["NEWEST", "POPULAR"]).default("NEWEST"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The scan request is invalid.");
  }

  if (!apifyConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "apify_not_configured",
          message:
            "APIFY_API_TOKEN is not set. A competitive scan needs it; no fixture result is substituted.",
        },
      },
      { status: 503 },
    );
  }

  const { creatorId, ownChannel, competitors, videosPerChannel, withTranscripts, sortVideosBy } =
    parsed.data;
  // Fall back to the creator selected in the sidebar, so a scan belongs to the workspace
  // the operator is actually looking at rather than a fixture id.
  const activeCreatorId = creatorId ?? (await currentCreator()).id;
  const total = (competitors.length + 1) * videosPerChannel;
  if (total > MAX_RESULTS_PER_SCAN) {
    return invalidRequest(
      `This scan would request ${total} videos, above the ${MAX_RESULTS_PER_SCAN} ceiling. Reduce channels or videos per channel.`,
    );
  }

  const job = startScan({
    creatorId: activeCreatorId,
    ownChannel,
    competitors,
    videosPerChannel,
    withTranscripts,
    sortVideosBy,
  });
  return NextResponse.json({ scan: job }, { status: 202 });
}

/** Scan history plus the newest complete report, so the UI can render something useful
 * on first paint without a second round trip. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId") ?? (await currentCreator()).id;
  return NextResponse.json(
    {
      latest: latestCompleteScan(creatorId),
      history: listScans(creatorId, 20).map((scan) => ({
        scanId: scan.scanId,
        status: scan.status,
        startedAt: scan.startedAt,
        endedAt: scan.endedAt,
        channels: scan.channels.map((c) => c.name),
        videos: scan.channels.reduce((sum, c) => sum + c.videos.length, 0),
        headline: scan.analysis?.headline ?? null,
      })),
      cache: cacheStats(),
      configured: apifyConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
