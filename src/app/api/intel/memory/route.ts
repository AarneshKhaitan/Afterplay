import { NextResponse } from "next/server";

import { activeBeliefs } from "@/domain/intel/memory";
import { loadMemory } from "@/domain/intel/store";

export const dynamic = "force-dynamic";

/** The standing intelligence memory for a creator.
 *
 * Returns the full belief set alongside the active subset, because the UI wants both:
 * the active ones as "what we know", and the faded ones in the timeline as "what we used
 * to think" — which is the part that makes the memory feel alive rather than appended-to.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId") ?? "creator_mika_rigged";
  const memory = loadMemory(creatorId);
  return NextResponse.json(
    { memory, active: activeBeliefs(memory) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
