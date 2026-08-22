import { NextResponse } from "next/server";

import { currentCreator } from "@/domain/creators";

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
  const activeCreator = await currentCreator();
  const requestedCreatorId = url.searchParams.get("creatorId");
  if (requestedCreatorId && requestedCreatorId !== activeCreator.id) {
    return NextResponse.json({
      error: { code: "creator_mismatch", message: "The memory does not belong to the active creator workspace." },
    }, { status: 409 });
  }
  const creatorId = activeCreator.id;
  const memory = loadMemory(creatorId);
  return NextResponse.json(
    { memory, active: activeBeliefs(memory) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
