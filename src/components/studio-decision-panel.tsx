"use client";

import { ArrowRight, Check, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import type { DistributionReceipt, GrowthExperiment } from "@/domain/experiment";

type PendingAction = "approve" | "reject" | "request_change" | "dispatch" | null;

export function StudioDecisionPanel({ initialExperiment }: { initialExperiment: GrowthExperiment }) {
  const [experiment, setExperiment] = useState(initialExperiment);
  const [receipts, setReceipts] = useState<DistributionReceipt[]>(initialExperiment.receipts);
  const [pending, setPending] = useState<PendingAction>(null);
  const [feedbackAction, setFeedbackAction] = useState<"reject" | "request_change" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject" | "request_change") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/experiments/${experiment.id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: experiment.revision, feedback: feedback || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The decision could not be recorded.");
      setExperiment(body.experiment);
      setFeedbackAction(null);
      setFeedback("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The decision could not be recorded.");
    } finally {
      setPending(null);
    }
  }

  async function dispatch() {
    setPending("dispatch");
    setError(null);
    try {
      const response = await fetch(`/api/experiments/${experiment.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: experiment.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Distribution could not be simulated.");
      setExperiment(body.experiment);
      setReceipts(body.receipts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Distribution could not be simulated.");
    } finally {
      setPending(null);
    }
  }

  if (experiment.status === "distributed" || experiment.status === "learned") {
    return (
      <section className="approval-console approval-console--complete" aria-live="polite">
        <div className="approval-console-heading"><span className="approval-icon"><PaperPlaneTilt weight="fill" /></span><div><h2>Simulated distribution complete</h2><span className="decision-status">Local receipts issued</span></div></div>
        <p>No public platform was contacted. These receipts record the approved demo action inside Afterplay.</p>
        <div className="receipt-list">{receipts.map((receipt) => <div key={receipt.id}><span className="sim-label">SIMULATED</span><strong>{receipt.platform}</strong><small>{receipt.id}</small><span>Accepted</span></div>)}</div>
        <Link className="primary-action" href="/audience">View sample results <ArrowRight weight="bold" /></Link>
      </section>
    );
  }

  if (experiment.status === "approved") {
    return (
      <section className="approval-console" aria-live="polite">
        <div className="approval-console-heading"><span className="approval-icon approval-icon--approved"><Check weight="bold" /></span><div><h2>Approved by you</h2><span className="decision-status">Revision {experiment.revision}</span></div></div>
        <p>Nothing has been posted yet.</p>
        <div className="authority-note"><WarningCircle /><span>Run the simulation to create three local receipts. No external service will be contacted.</span></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-action action-button" type="button" onClick={dispatch} disabled={pending !== null}>{pending === "dispatch" ? "Creating receipts…" : "Run simulated distribution"}<ArrowRight weight="bold" /></button>
      </section>
    );
  }

  if (experiment.status === "rejected" || experiment.status === "changes_requested") {
    return (
      <section className="approval-console" aria-live="polite"><h2>{experiment.status === "rejected" ? "Package rejected" : "Changes requested"}</h2><p>{experiment.decision?.feedback}</p><p className="console-footnote">This run stops here. Reset the demo workspace to replay the approval path.</p></section>
    );
  }

  return (
    <section className="approval-console">
      <div className="approval-console-heading"><span className="approval-icon"><Check weight="bold" /></span><div><h2>Approve revision {experiment.revision}</h2><span className="decision-status">Your approval required</span></div></div>
      <p>Approve these three pieces, ask the Producer for changes, or stop the test. Nothing leaves Afterplay at this step.</p>
      {feedbackAction ? (
        <form className="feedback-form" onSubmit={(event) => { event.preventDefault(); void decide(feedbackAction); }}>
          <label htmlFor="creator-feedback">{feedbackAction === "reject" ? "Why should this stop?" : "What should the Producer change?"}</label>
          <textarea id="creator-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} required maxLength={500} autoFocus />
          <div><button type="button" className="secondary-button" onClick={() => setFeedbackAction(null)}>Cancel</button><button type="submit" className="primary-small" disabled={pending !== null || !feedback.trim()}>Record decision</button></div>
        </form>
      ) : (
        <div className="decision-actions"><button type="button" className="secondary-button" onClick={() => setFeedbackAction("reject")}>Reject</button><button type="button" className="secondary-button" onClick={() => setFeedbackAction("request_change")}>Request changes</button><button type="button" className="primary-small" onClick={() => void decide("approve")} disabled={pending !== null}>{pending === "approve" ? "Approving…" : "Approve current revision"}</button></div>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <p className="console-footnote">The approval is tied to this revision and saved in memory.</p>
    </section>
  );
}
