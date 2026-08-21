import { ArrowRight, ChartLineUp, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { LiveWorkspaceCounts } from "./data";
import { resultMovement, type GrowthExperiment } from "@/domain/experiment";

const STATUS_LABEL: Record<GrowthExperiment["status"], string> = {
  awaiting_approval: "Awaiting your approval",
  changes_requested: "Changes requested by you",
  rejected: "Rejected by you",
  approved: "Approved, not yet distributed",
  distributed: "Simulated distribution complete",
  learned: "Learning recorded",
};

function resolveNextAction(
  experiment: GrowthExperiment,
  counts: LiveWorkspaceCounts,
): { label: string; href: string } {
  if (counts.usableClips === 0) {
    return { label: "Clip a stream to produce usable outputs", href: "/ingest" };
  }
  if (experiment.status === "awaiting_approval" || experiment.status === "changes_requested") {
    return { label: "Review and approve the package in Studio", href: "/studio" };
  }
  if (experiment.status === "approved") {
    return { label: "Run the simulated distribution in Studio", href: "/studio" };
  }
  if (experiment.status === "distributed") {
    return { label: "Load sample results in Audience", href: "/audience" };
  }
  if (experiment.status === "rejected") {
    return { label: "Review channel memory before the next attempt", href: "/memory" };
  }
  // learned
  return { label: "Review the recorded learning and next experiment", href: "/audience" };
}

/** The one genuinely useful thing the cold state did -- point at the next real step --
 * carried forward here, now derived from actual experiment and pipeline state instead
 * of always pointing at memory. */
export function HqLiveSummary({
  creatorName,
  creatorId,
  counts,
  experiment,
}: Readonly<{
  creatorName: string;
  creatorId: string;
  counts: LiveWorkspaceCounts;
  experiment: GrowthExperiment;
}>) {
  const movement = experiment.result ? resultMovement(experiment.result) : null;
  const action = resolveNextAction(experiment, counts);

  return (
    <div className="surface">
      <section className="page-hero">
        <div>
          <h1>What Afterplay has for {creatorName}</h1>
          <p>
            This is a summary of persisted channel memory, clip production, and the
            simulated experiment pipeline for this creator. No audience measurement is
            connected, and demo fixtures are not substituted.
          </p>
          <div className="hero-meta">
            <span className="status-chip status-chip--safe">Live workspace</span>
            <span>{creatorName}</span>
            <span>{creatorId}</span>
          </div>
        </div>
      </section>

      <section className="channel-memory" aria-labelledby="live-summary-counts-title">
        <div className="memory-section-heading">
          <h2 id="live-summary-counts-title">Persisted on disk</h2>
          <span>Selected creator only</span>
        </div>
        <div className="plan-table">
          <div className="live-plan-row">
            <span className="plan-role">Memory</span>
            <strong>Channel threads</strong>
            <span>{counts.threads} threads from {counts.streams} streams</span>
          </div>
          <div className="live-plan-row">
            <span className="plan-role">Intel</span>
            <strong>Completed scans</strong>
            <span>{counts.completeScans}</span>
          </div>
          <div className="live-plan-row">
            <span className="plan-role">Clips</span>
            <strong>Usable clips in latest run</strong>
            <span>{counts.usableClips}</span>
          </div>
        </div>
      </section>

      <section className="channel-memory" aria-labelledby="live-summary-experiment-title">
        <div className="memory-section-heading">
          <h2 id="live-summary-experiment-title">Experiment state</h2>
          <span>Revision {experiment.revision}</span>
        </div>
        <div className="plan-table">
          <div className="live-plan-row">
            <span className="plan-role">Experiment</span>
            <strong>{experiment.name}</strong>
            <span>{STATUS_LABEL[experiment.status]}</span>
          </div>
          <div className="live-plan-row">
            <span className="plan-role">Stage</span>
            <strong>{experiment.stage}</strong>
            <span>Revision {experiment.revision}</span>
          </div>
        </div>
      </section>

      {experiment.receipts.length > 0 ? (
        <section className="channel-memory" aria-labelledby="live-summary-receipts-title">
          <div className="memory-section-heading">
            <h2 id="live-summary-receipts-title"><PaperPlaneTilt aria-hidden="true" /> Simulated distribution receipts</h2>
            <span>{experiment.receipts.length} issued</span>
          </div>
          <div className="receipt-list">
            {experiment.receipts.map((receipt) => (
              <div key={receipt.id}>
                <span className="sim-label">SIMULATED</span>
                <strong>{receipt.platform}</strong>
                <small>{receipt.id}</small>
                <span>{receipt.state === "accepted" ? "Accepted" : receipt.state}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {movement ? (
        <section className="section-block" aria-labelledby="live-summary-movement-title">
          <div className="section-heading">
            <h2 id="live-summary-movement-title">Sample result movement</h2>
            <span className="sample-note">Synthetic sample · not measurement</span>
          </div>
          <div className="metric-grid">
            {movement.map((metric) => (
              <article className="metric" key={metric.label}>
                <span>{metric.label}</span>
                <div><strong>{metric.value}</strong><em><ChartLineUp /> {metric.delta}</em></div>
                <small>{metric.delta === "baseline" ? "28-day baseline" : "vs 28-day baseline"}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="results-empty" aria-labelledby="live-summary-next-title">
        <h2 id="live-summary-next-title">Next action</h2>
        <p>{action.label}</p>
        <div className="live-cold-links">
          <Link className="primary-small" href={action.href}>{action.label} <ArrowRight weight="bold" /></Link>
        </div>
      </section>
    </div>
  );
}
