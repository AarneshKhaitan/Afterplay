import { IntelConsole } from "@/components/intel/intel-console";
import { WorkspaceShell } from "@/components/workspace-shell";
import { apifyConfigured } from "@/domain/intel/apify";
import { activeBeliefs } from "@/domain/intel/memory";
import { latestCompleteScan, listScans, loadMemory } from "@/domain/intel/store";

export const dynamic = "force-dynamic";

const CREATOR_ID = "creator_mika_rigged";

/** Server shell for the intelligence console.
 *
 * Everything the first paint needs is read here so the console renders a real report
 * immediately instead of flashing an empty state and then filling in — which is what a
 * client-side fetch on mount would do, and it reads as broken on a demo machine.
 */
export default function IntelPage() {
  const memory = loadMemory(CREATOR_ID);
  const latest = latestCompleteScan(CREATOR_ID);

  return (
    <WorkspaceShell
      active="Intel"
      pageName="Competitive intelligence"
      badge={latest ? "Live scraped data" : "No scan yet"}
      dataNote={
        latest
          ? "Every number on this page was scraped live from YouTube and computed from it. The analysis and the strategist are real model calls over that corpus. Nothing here is sample data."
          : "No scan has been run yet. Competitive intelligence needs a live scrape; no sample report is substituted."
      }
    >
      <IntelConsole
        creatorId={CREATOR_ID}
        initialScan={latest}
        initialMemory={memory}
        initialActiveBeliefs={activeBeliefs(memory)}
        history={listScans(CREATOR_ID, 12).map((scan) => ({
          scanId: scan.scanId,
          status: scan.status,
          startedAt: scan.startedAt,
          headline: scan.analysis?.headline ?? null,
          videos: scan.channels.reduce((sum, channel) => sum + channel.videos.length, 0),
        }))}
        scraperConfigured={apifyConfigured()}
      />
    </WorkspaceShell>
  );
}
