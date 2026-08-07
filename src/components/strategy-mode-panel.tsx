"use client";

import { Lightning, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

type Proposal = {
  name: string;
  diagnosis: string;
  hypothesis: string;
  confidence: number;
  alternatives: Array<{ title: string; reasonNotChosen: string }>;
  uncertainty: string;
  falsifier: string;
};

type Meta = { mode: "demo" | "live"; model: string | null };

/** Run the strategy director in demo or live mode, per request.
 *
 * Deliberately NOT a global switch: flipping server-wide AI behaviour from the browser
 * would break the deterministic judge run and let a client mutate server state. The API
 * already takes `mode` per call, so each run is explicit and the other is unaffected.
 *
 * Live mode fails visibly when unconfigured — it never substitutes demo output. That
 * contract is what makes the demo result trustworthy, so surface the error rather than
 * hiding it. */
export function StrategyModePanel({ evidenceRefs }: { evidenceRefs: string[] }) {
  const [pending, setPending] = useState<"demo" | "live" | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "demo" | "live") {
    setPending(mode);
    setError(null);
    try {
      const response = await fetch("/api/strategy/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          input: {
            creatorId: "creator_mika_rigged",
            objective: "Grow the returning audience for this gaming creator.",
            evidenceRefs,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setProposal(null);
        setMeta(null);
        throw new Error(body.error?.message ?? "The strategy director failed.");
      }
      setMeta(body.meta);
      setProposal(body.proposal);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The strategy director failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="mode-panel" aria-labelledby="mode-panel-title">
      <div className="mode-panel-head">
        <div>
          <h2 id="mode-panel-title">Strategy director</h2>
          <p>
            Demo mode is deterministic and offline. Live mode calls the model and, if it is
            not configured, fails visibly rather than returning demo output.
          </p>
        </div>
        <div className="mode-actions">
          <button type="button" onClick={() => run("demo")} disabled={pending !== null}>
            <Sparkle weight="fill" /> {pending === "demo" ? "Running…" : "Run demo plan"}
          </button>
          <button
            type="button"
            className="mode-button--live"
            onClick={() => run("live")}
            disabled={pending !== null}
          >
            <Lightning weight="fill" /> {pending === "live" ? "Running…" : "Run live plan"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mode-alert" role="alert">
          <WarningCircle weight="fill" />
          <div>
            <strong>Live planning is unavailable</strong>
            <span>{error}</span>
            <span className="mode-alert-note">
              No demo output was substituted. This is the intended behaviour.
            </span>
          </div>
        </div>
      ) : null}

      {proposal && meta ? (
        <div className="mode-result">
          <div className="mode-result-head">
            <span className={`mode-chip mode-chip--${meta.mode}`}>
              {meta.mode === "live" ? "Live model output" : "Deterministic demo output"}
            </span>
            <span>{meta.model ? `model ${meta.model}` : "no model call"}</span>
            <span>{proposal.confidence}% confidence</span>
          </div>
          <h3>{proposal.name}</h3>
          <p>{proposal.diagnosis}</p>
          <p className="mode-hypothesis">{proposal.hypothesis}</p>
          <div className="mode-result-grid">
            <div>
              <span>Rejected alternatives</span>
              <ul>
                {proposal.alternatives.map((alt) => (
                  <li key={alt.title}>
                    <strong>{alt.title}</strong> — {alt.reasonNotChosen}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span>What would falsify it</span>
              <p>{proposal.falsifier}</p>
              <span>Uncertainty</span>
              <p>{proposal.uncertainty}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
