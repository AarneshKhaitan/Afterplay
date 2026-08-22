import { LiveColdState } from "./live-cold-state";
import type { LiveWorkspaceCounts } from "./data";

export function LiveExperimentsColdState(props: Readonly<{
  creatorName: string;
  creatorId: string;
  counts: LiveWorkspaceCounts;
}>) {
  return (
    <LiveColdState
      {...props}
      title="No live experiment has been created"
      summary="The current experiment package is a labelled demo fixture. Live mode keeps it out of this creator's decision path."
      missingTitle="The experiment contract is absent"
      missingReason="There is no persisted live hypothesis, success signal, approval revision, or observation window for this creator. Afterplay cannot turn the demo package into a live experiment by relabelling it."
      nextTitle="Ground the first live test"
      nextAction="Use the creator's memory and a completed intelligence scan to define a hypothesis and measurable success signal before preparing outputs."
      href="/intel"
      linkLabel="Open competitive intelligence"
    />
  );
}
