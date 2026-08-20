import { AudienceResults } from "@/components/audience-results";
import { LiveAudienceColdState } from "@/components/live/audience-cold-state";
import { loadLiveWorkspaceCounts } from "@/components/live/data";
import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator } from "@/domain/creators";
import { getExperiment } from "@/domain/experiment";
import { workspaceModeState } from "@/domain/mode";

export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const [creator, modeState] = await Promise.all([currentCreator(), workspaceModeState()]);
  if (modeState.mode === "live") {
    return (
      <WorkspaceShell
        active="Audience"
        pageName="Audience"
        modeState={modeState}
        badge="No live result"
        dataNote="No live audience metrics are stored for this creator. Only persisted source counts are shown; the labelled sample is not substituted."
      >
        <LiveAudienceColdState
          creatorName={creator.displayName}
          creatorId={creator.id}
          counts={loadLiveWorkspaceCounts(creator)}
        />
      </WorkspaceShell>
    );
  }

  const experiment = getExperiment("exp_one_more_rule", creator.id);

  return (
    <WorkspaceShell
      active="Audience"
      pageName="Audience"
      modeState={modeState}
      badge="Labelled audience fixture"
      dataNote="This audience result is a labelled synthetic sample. Loading it writes only to the demo experiment store."
    >
      <div className="surface audience-surface">
        <section className="page-hero audience-hero"><div><h1>Return behavior after the test</h1><p>Compare the result with the target set before publishing. Views provide context; returning viewers and repeat commenters decide what to test next.</p><div className="hero-meta"><span className="status-chip status-chip--sample">Synthetic sample</span><span>Experiment 04</span><span>7-day window</span></div></div></section>
        <AudienceResults initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
