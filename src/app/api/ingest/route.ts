import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidRequest } from "@/app/api/http";
import {
  assertIngestableUrl, IngestError, newJobId, pythonConfigured, readIngestJob, startIngestJob,
} from "@/domain/ingest/jobs";
import { currentCreator } from "@/domain/creators";
import { findCachedSource, listCachedSources, mediaDirConfigured } from "@/domain/ingest/sources";

export const dynamic = "force-dynamic";

const startSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("url"), url: z.string().min(5).max(500) }),
    z.object({ kind: z.literal("cached"), id: z.string().min(1).max(120) }),
  ]),
  creator: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, "Creator id must be letters, numbers, dashes or underscores."),
  clips: z.number().int().min(1).max(10).default(3),
  platforms: z.enum(["shorts", "reels", "tiktok"]).default("shorts"),
  memory: z.boolean().default(true),
  captions: z.boolean().default(false),
  footageRights: z.enum([
    "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
  ]),
});

/** What can be ingested right now, and honestly under what conditions. */
export async function GET() {
  const python = pythonConfigured();
  const creator = await currentCreator();
  return NextResponse.json({
    sources: listCachedSources().map((source) => ({
      id: source.id,
      title: source.title ?? source.id,
      mode: source.mode,
    })),
    mediaDirConfigured: mediaDirConfigured(),
    python,
    creatorDefault: creator.id,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The ingest request is invalid.");
  }

  const input = parsed.data;
  const creator = await currentCreator();
  if (input.creator !== creator.id) {
    return NextResponse.json({
      error: {
        code: "creator_mismatch",
        message: "The ingest request does not belong to the active creator workspace.",
      },
    }, { status: 409 });
  }

  const python = pythonConfigured();
  if (!python.ok) {
    return NextResponse.json({
      error: {
        code: "python_not_configured",
        message:
          "The clipper's Python environment was not found. From services/video-clipper run "
          + "`python -m venv .venv` then install requirements.txt. No fixture result is substituted.",
      },
    }, { status: 503 });
  }

  try {
    const jobId = newJobId();
    const source = input.source.kind === "url"
      ? { kind: "url" as const, url: assertIngestableUrl(input.source.url) }
      : (() => {
        const found = findCachedSource(input.source.id);
        if (!found) throw new IngestError("That cached source no longer exists on disk.", 404);
        return { kind: "cached" as const, source: found };
      })();

    startIngestJob({
      jobId,
      creator: creator.id,
      clips: input.clips,
      platforms: input.platforms,
      memory: input.memory,
      captions: input.captions,
      footageRights: input.footageRights,
      source,
    });

    return NextResponse.json({
      jobId,
      job: readIngestJob(jobId, creator.id),
      // Say plainly whether this run will touch the network, so nobody demos a
      // YouTube-dependent path believing it is offline.
      network: source.kind === "url"
        ? "This run downloads from YouTube and calls OpenAI."
        : source.source.mode === "local"
          ? "This run reads local media only. It calls OpenAI for memory, and never YouTube."
          : "Captions are cached, but video bytes are still fetched from YouTube.",
    }, { status: 202 });
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json(
        { error: { code: "ingest_rejected", message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "ingest_failed", message: (error as Error).message } },
      { status: 500 },
    );
  }
}
