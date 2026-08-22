import { LiveColdState } from "./live-cold-state";
import type { LiveWorkspaceCounts } from "./data";

export function LiveAudienceColdState(props: Readonly<{
  creatorName: string;
  creatorId: string;
  counts: LiveWorkspaceCounts;
}>) {
  return (
    <LiveColdState
      {...props}
      title="No live audience result yet"
      summary="Audience metrics appear only after approved content is published and observed through a connected result source."
      missingTitle="There is nothing measured to report"
      missingReason="Afterplay has no platform analytics receipt or live observation window for this creator. The labelled sample result remains available only in demo mode and is never loaded here."
      nextTitle="Prepare a real package"
      nextAction="Run Ingest, review the resulting clips in Studio, and connect a result source before starting an audience observation window."
      href="/ingest"
      linkLabel="Open Ingest"
    />
  );
}
