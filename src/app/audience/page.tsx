import { AudienceResults } from "@/components/audience-results";
import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator } from "@/domain/creators";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const creator = await currentCreator();
  const experiment = getExperiment("exp_one_more_rule", creator.id);

  return (
    <WorkspaceShell active="Audience" pageName="Audience">
      <div className="surface audience-surface">
        <section className="page-hero audience-hero"><div><h1>Return behavior after the test</h1><p>Compare the result with the target set before publishing. Views provide context; returning viewers and repeat commenters decide what to test next.</p><div className="hero-meta"><span className="status-chip status-chip--sample">Synthetic sample</span><span>Experiment 04</span><span>7-day window</span></div></div></section>
        <AudienceResults initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
