import { NextResponse } from "next/server";
import { z } from "zod";

import { currentCreator } from "@/domain/creators";
import { invalidRequest } from "@/app/api/http";
import { AgentError, askAgent } from "@/domain/intel/agent";
import { latestCompleteScan, loadMemory, loadScanForCreator } from "@/domain/intel/store";

export const dynamic = "force-dynamic";

const askSchema = z.object({
  creatorId: z.string().min(1).max(80).optional(),
  question: z.string().min(2).max(1000),
  /** Pin the answer to a specific scan. Omitted means "the latest complete one", which
   * is what the UI wants by default. */
  scanId: z.string().min(1).max(80).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .max(20)
    .default([]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The question is invalid.");
  }

  const { creatorId, question, scanId, history } = parsed.data;
  const activeCreatorId = creatorId ?? (await currentCreator()).id;
  const scan = scanId
    ? loadScanForCreator(scanId, activeCreatorId)
    : latestCompleteScan(activeCreatorId);
  if (scanId && !scan) {
    return NextResponse.json(
      { error: { code: "scan_not_found", message: "That scan does not exist." } },
      { status: 404 },
    );
  }
  const memory = loadMemory(activeCreatorId);

  try {
    const result = await askAgent(question, history, scan, memory);
    return NextResponse.json({
      ...result,
      grounding: {
        scanId: scan?.scanId ?? null,
        videosInContext: scan?.channels.reduce((sum, c) => sum + c.videos.length, 0) ?? 0,
        beliefsInContext: memory.beliefs.length,
      },
    });
  } catch (error) {
    if (error instanceof AgentError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "internal_error", message: "The strategist could not answer." } },
      { status: 500 },
    );
  }
}
