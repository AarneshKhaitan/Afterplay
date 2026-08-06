"use client";

import { ArrowRight, ChartLineUp, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { resultMovement, type GrowthExperiment } from "@/domain/experiment";

const sampleMetrics = {
  views: 1284,
  returningViewerRate: 13.6,
  repeatCommenters: 7,
  trackedLiveVisits: 9,
  nextStreamAverageConcurrency: 4.6,
};

export function AudienceResults({ initialExperiment }: { initialExperiment: GrowthExperiment }) {
  const [experiment, setExperiment] = useState(initialExperiment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadResults() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/experiments/${experiment.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disclosure: "synthetic_sample_data", metrics: sampleMetrics }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The sample result could not be loaded.");
      setExperiment(body.experiment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The sample result could not be loaded.");
    } finally {
      setPending(false);
    }
  }

  if (experiment.status !== "learned" || !experiment.result || !experiment.learning || !experiment.nextExperiment) {
    return (
      <section className="results-empty" aria-live="polite">
        <h2>Sample results are not loaded</h2><p>Load the labelled sample after the simulated distribution run. A connected workspace would wait for platform data and the agreed observation window.</p>
        <button className="primary-small" type="button" onClick={loadResults} disabled={pending || experiment.status !== "distributed"}>{pending ? "Loading sample…" : "Load labelled sample results"}</button>
        {experiment.status !== "distributed" ? <p className="form-error" role="status">Approve and run simulated distribution in Studio first.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  const { result, learning, nextExperiment } = experiment;
  const metrics = resultMovement(result);

  return (
    <div className="results-loaded" aria-live="polite">
      <div className="result-disclosure"><span>Synthetic sample result</span><strong><WarningCircle /> No causal claim</strong></div>
      <section className="result-metric-grid" aria-label="Sample experiment result">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>Baseline {metric.baseline}</small><em><ChartLineUp /> {metric.delta}</em></article>)}</section>
      <div className="learning-grid">
        <section className="analyst-card"><div className="analyst-heading"><div><h2>Analyst’s read</h2><strong className="analyst-conclusion">{learning.conclusion}</strong></div></div><p>Confidence {learning.confidence}% · useful direction, not proof</p><div className="analyst-columns"><div><h3>What moved</h3>{learning.evidence.map((item) => <p key={item}>{item}</p>)}</div><div><h3>What limits the claim</h3>{learning.limitations.map((item) => <p key={item}>{item}</p>)}</div></div></section>
        <section className="next-experiment-card"><h2>Next experiment: {nextExperiment.name}</h2><p>{nextExperiment.hypothesis}</p><div><span>Why this comes next</span><strong>{learning.nextMove}</strong></div><Link href="/experiments/exp_one_more_rule">Back to Experiment 04 <ArrowRight /></Link></section>
      </div>
    </div>
  );
}
