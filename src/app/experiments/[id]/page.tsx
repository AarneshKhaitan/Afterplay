import { ArrowRight, Check, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { getExperiment } from "@/domain/experiment";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "exp_one_more_rule") notFound();
  const experiment = getExperiment(id);

  return (
    <WorkspaceShell active="Experiments" pageName="Experiment detail">
      <div className="surface experiment-surface">
        <div className="page-breadcrumb"><Link href="/experiments">Experiments</Link><span>/</span><span>Experiment 04</span></div>
        <section className="page-hero experiment-hero">
          <div>
            <h1>{experiment.name}</h1>
            <p>{experiment.hypothesis}</p>
            <div className="hero-meta"><span className="status-chip status-chip--review">Needs approval</span><span>Revision {experiment.revision}</span><span>Owner: Strategy</span></div>
          </div>
          <div className="confidence-orbit"><span>Confidence</span><strong>{experiment.confidence}%</strong></div>
        </section>

        <div className="experiment-detail-grid">
          <div className="experiment-main">
            <section className="content-section" aria-labelledby="why-title">
              <div className="content-section-heading"><h2 id="why-title">Evidence for this test</h2><span>{experiment.evidence.length} signals</span></div>
              <div className="evidence-list">
                {experiment.evidence.map((item, index) => (
                  <article className="evidence-card" key={item.id}>
                    <span className="evidence-index">0{index + 1}</span>
                    <div><div className="evidence-card-top"><h3>{item.title}</h3><span className={`strength strength--${item.strength}`}>{item.strength}</span></div><p>{item.detail}</p><small>{item.source}</small></div>
                  </article>
                ))}
              </div>
            </section>

            <section className="content-section" aria-labelledby="plan-title">
              <div className="content-section-heading"><h2 id="plan-title">Experiment plan</h2><span>{experiment.timebox}</span></div>
              <div className="plan-table">
                {experiment.plan.map((step) => (
                  <div className="plan-row" key={step.step}><span className="plan-number">{step.step}</span><span className="plan-role">{step.role}</span><strong>{step.action}</strong><span className={`plan-state plan-state--${step.state}`}>{step.state === "complete" ? <Check weight="bold" /> : null}{step.state}</span></div>
                ))}
              </div>
            </section>

            <section className="content-section signal-contract" aria-labelledby="signal-title">
              <div className="content-section-heading"><h2 id="signal-title">Success criteria</h2></div>
              <dl><div><dt>Behavior</dt><dd>{experiment.targetBehavior}</dd></div><div><dt>Success signal</dt><dd>{experiment.successSignal}</dd></div><div><dt>Timebox</dt><dd>{experiment.timebox}</dd></div></dl>
            </section>
          </div>

          <aside className="experiment-aside" aria-label="Experiment judgment">
            <section className="judgment-card judgment-card--warning">
              <div className="judgment-icon"><WarningCircle /></div><h2 id="wrong-title">Uncertainty</h2><p>{experiment.uncertainty}</p>
              <div className="falsifier"><span>Failure condition</span><strong>{experiment.falsifier}</strong></div>
            </section>
            <section className="judgment-card">
              <h2>Alternatives considered</h2>
              <div className="alternative-list">{experiment.alternatives.map((alternative) => <article key={alternative.title}><h3>{alternative.title}</h3><p>{alternative.reasonNotChosen}</p></article>)}</div>
            </section>
            <section className="review-card">
              <h2>Review 3 outputs</h2><p>The premise cut, community cut, and return prompt are ready. Revision {experiment.revision} stays inside Afterplay until Mika approves it.</p>
              <Link className="primary-action" href="/studio">Review 3 outputs <ArrowRight weight="bold" /></Link>
            </section>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}
