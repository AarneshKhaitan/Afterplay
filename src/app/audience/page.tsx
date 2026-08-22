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
  const experiment = getExperiment("exp_one_more_rule", creator.id);
  const distributed = experiment.status === "distributed" || experiment.status === "learned";

  // A live workspace keeps the cold state until a simulated distribution has actually
  // happened. Before that there is genuinely nothing to report, and the persisted source
  // counts are the honest thing to show; substituting the sample there would invent a
  // result nobody asked for. Once the creator has run the distribution step themselves,
  // the sample is shown -- labelled, below -- so the loop reaches its end on real clips.
  if (modeState.mode === "live" && !distributed) {
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

  return (
    <WorkspaceShell
      active="Audience"
      pageName="Audience"
      modeState={modeState}
      badge={modeState.mode === "live" ? "Synthetic sample · not measured" : "Labelled audience fixture"}
      dataNote={modeState.mode === "live"
        ? "These numbers are a labelled synthetic sample, not measurement. This is a live "
          + "workspace, so they sit beside a real channel: read them as a worked example of "
          + "the measurement step. No platform was contacted and nothing was published."
        : "This audience result is a labelled synthetic sample. Loading it writes only to the demo experiment store."}
    >
      <div className="surface audience-surface">
        <section className="page-hero audience-hero"><div><h1>Return behavior after the test</h1><p>Compare the result with the target set before publishing. Views provide context; returning viewers and repeat commenters decide what to test next.</p><div className="hero-meta"><span className="status-chip status-chip--sample">Synthetic sample</span><span>Experiment 04</span><span>7-day window</span></div></div></section>
        <AudienceResults initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
