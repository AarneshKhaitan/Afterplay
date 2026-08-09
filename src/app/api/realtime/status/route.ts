import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      configured: Boolean(process.env.OPENAI_API_KEY),
      capabilities: {
        input: "microphone",
        visualInput: "selected_window_snapshots",
        output: "speech",
        turnDetection: "semantic_vad",
        voice: "marin",
      },
      meta: {
        mode: "live",
        model: "gpt-realtime-2.1",
        fallbackUsed: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
