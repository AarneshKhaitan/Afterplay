import { LiveColdState } from "./live-cold-state";
import type { LiveWorkspaceCounts } from "./data";

export function LiveHqColdState(props: Readonly<{
  creatorName: string;
  creatorId: string;
  counts: LiveWorkspaceCounts;
}>) {
  return (
    <LiveColdState
      {...props}
      title="No live growth diagnosis yet"
      summary="Afterplay has real source artifacts for this creator, but no published experiment result from which to diagnose audience movement."
      missingTitle="A live diagnosis does not exist"
      missingReason="HQ normally summarizes an experiment and its observed audience outcome. No publishing analytics or completed live experiment is connected, so Afterplay will not substitute the seeded demo diagnosis."
      nextTitle="Build the evidence path first"
      nextAction="Review channel memory and competitive intelligence, then create a measured experiment once a live result source is connected."
      href="/memory"
      linkLabel="Review channel memory"
    />
  );
}
