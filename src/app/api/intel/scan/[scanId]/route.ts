import { NextResponse } from "next/server";

import { loadScan } from "@/domain/intel/store";

export const dynamic = "force-dynamic";

/** Poll target for the live scanning view.
 *
 * Returns the whole job. It is a few hundred KB at most with a 90-video corpus, and the
 * alternative — a delta protocol — would add a synchronisation bug surface for a saving
 * the UI does not need at this scale. `no-store` matters: a cached poll response would
 * freeze the progress display at whatever the first response said.
 */
export async function GET(_request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  const scan = loadScan(scanId);
  if (!scan) {
    return NextResponse.json(
      { error: { code: "scan_not_found", message: "That scan does not exist." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ scan }, { headers: { "Cache-Control": "no-store" } });
}
