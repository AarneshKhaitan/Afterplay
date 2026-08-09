import { Check, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { StudioDecisionPanel } from "@/components/studio-decision-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

export default function StudioPage() {
  const experiment = getExperiment("exp_one_more_rule");

  return (
    <WorkspaceShell active="Studio" pageName="Studio">
      <div className="surface studio-surface">
        <section className="page-hero studio-hero"><div><h1>Review 3 drafts</h1><p>These three cuts make up one test: introduce the format, invite chat to shape it, and give viewers a reason to return.</p><div className="hero-meta"><span className="status-chip status-chip--review">Needs approval</span><span>Revision {experiment.revision}</span><span>3 outputs</span></div></div><div className="studio-summary"><span><Check weight="bold" /> Matches Experiment 04</span><span><ShieldCheck weight="fill" /> Synthetic project-owned media</span></div></section>

        <section className="output-grid" aria-label="Experiment outputs">
          {experiment.outputs.map((output, index) => (
            <article className="output-card" key={output.id} aria-label={output.title}>
              <div className={`output-preview output-preview--${index + 1}`}><Image src={output.thumbnailUrl} alt="" fill sizes="(max-width: 900px) 100vw, 33vw" loading="eager" /><span className="output-order">0{index + 1}</span><span className="duration">{output.duration}</span></div>
              <div className="output-body"><h2>{output.title}</h2><div className="output-platform"><span>{output.type.replaceAll("_", " ")}</span><strong>{output.platform}</strong></div><blockquote>“{output.hook}”</blockquote><p>{output.caption}</p><div className="output-rationale"><span>Purpose</span><strong>{output.rationale}</strong></div><div className="provenance"><ShieldCheck /><span>Project-owned synthetic media</span></div></div>
            </article>
          ))}
        </section>

        <StudioDecisionPanel initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
