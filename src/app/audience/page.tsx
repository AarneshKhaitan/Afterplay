import { AudienceResults } from "@/components/audience-results";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

export default function AudiencePage() {
  const experiment = getExperiment("exp_one_more_rule");

  return (
    <WorkspaceShell active="Audience" pageName="Audience">
      <div className="surface audience-surface">
        <section className="page-hero audience-hero"><div><h1>Results for One More Rule</h1><p>Compare the seven-day sample with the target set before distribution. Views are context; returning viewers and repeat commenters determine the next test.</p><div className="hero-meta"><span className="status-chip status-chip--sample">Synthetic sample</span><span>Experiment 04</span><span>7-day window</span></div></div></section>
        <AudienceResults initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
