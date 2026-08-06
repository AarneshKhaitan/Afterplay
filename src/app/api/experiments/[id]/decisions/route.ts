import { NextResponse } from "next/server";
import { z } from "zod";

import { experimentErrorResponse, invalidRequest } from "@/app/api/http";
import { recordDecision } from "@/domain/experiment";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "request_change"]),
  revision: z.number().int().positive(),
  feedback: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.action !== "approve" && !value.feedback) {
    context.addIssue({ code: "custom", message: "Feedback is required for rejection or change requests." });
  }
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest("The request body must be valid JSON.");
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(parsed.error.issues[0]?.message ?? "The decision is invalid.");
  }

  try {
    const { id } = await context.params;
    return NextResponse.json(recordDecision({ id, ...parsed.data }));
  } catch (error) {
    return experimentErrorResponse(error);
  }
}
