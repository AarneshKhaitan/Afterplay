import { NextResponse } from "next/server";

import { ExperimentError } from "@/domain/experiment";

export function experimentErrorResponse(error: unknown) {
  if (error instanceof ExperimentError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export function invalidRequest(message: string) {
  return NextResponse.json(
    { error: { code: "invalid_request", message } },
    { status: 400 },
  );
}
