"use client";

import { Brain, Check, Eye, MagnifyingGlass, Sparkle, Warning, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import type { AgentKind, ScanJob } from "@/domain/intel/types";

import { LocalTime } from "./local-time";

const AGENT_ICON: Record<AgentKind, React.ComponentType<{ weight?: "bold" | "fill" }>> = {
  scout: MagnifyingGlass,
  watcher: Eye,
  analyst: Sparkle,
  consolidator: Brain,
};

function elapsed(from: string, to?: string): string {
  const ms = (to ? Date.parse(to) : Date.now()) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The live scan.
 *
 * This is deliberately the most animated surface in the product: it is the moment the
 * system is doing the most work and the creator can see least of it. Every number on
 * screen is read from the scan file — stage states, agent counters, findings and log
 * lines are all real. Each stage carries a `truth` line as its tooltip stating literally
 * what it does, so the theatre never outruns the substance.
 */
export function SwarmView({ scan, onDismiss }: {
  scan: ScanJob;
  /** Supplied once the run has finished. The swarm then stays until it is dismissed
   * rather than timing out: it is the evidence the work happened, and on stage the
   * presenter -- not a timer -- decides when the room has finished reading it. */
  onDismiss?: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [scan.log.length]);

  const totalVideos = scan.channels.reduce((sum, channel) => sum + channel.videos.length, 0);
  const transcripts = scan.channels.reduce(
    (sum, channel) => sum + channel.videos.filter((v) => v.transcript).length,
    0,
  );
  const done = scan.stages.filter((s) => s.state === "complete").length;

  return (
    <section className="swarm" aria-label="Live scan" aria-live="polite">
      <div className="swarm-head">
        <div>
          <span className="swarm-status">
            <span className={`swarm-pulse swarm-pulse--${scan.status}`} aria-hidden="true" />
            {scan.status === "complete"
              ? "Scan complete"
              : scan.status === "failed"
                ? "Scan failed"
                : "Intelligence run in progress"}
          </span>
          <h2>
            {scan.input.ownChannel} vs {scan.input.competitors.length}{" "}
            {scan.input.competitors.length === 1 ? "competitor" : "competitors"}
          </h2>
        </div>
        <div className="swarm-counters">
          <div>
            <strong>{scan.agents.length}</strong>
            <span>agents</span>
          </div>
          <div>
            <strong>{totalVideos}</strong>
            <span>videos</span>
          </div>
          <div>
            <strong>{transcripts}</strong>
            <span>transcripts</span>
          </div>
          <div>
            <strong>
              {done}/{scan.stages.length}
            </strong>
            <span>stages</span>
          </div>
        </div>
        {onDismiss && (scan.status === "complete" || scan.status === "failed") ? (
          <button className="swarm-dismiss" type="button" onClick={onDismiss}>
            {scan.status === "complete" ? "View the report" : "Close"}
          </button>
        ) : null}
      </div>

      {/* A pipeline, not a grid of cards.
       *
       * The card version gave every stage the height of the wordiest one, so a finished
       * "Locking targets" sat in a tall empty box while the whole strip read as six
       * unrelated panels. Six connected nodes read as one process moving left to right,
       * which is what is actually happening. The literal `truth` text moves to the
       * tooltip, so the theatre never gets ahead of the substance. */}
      <ol className="swarm-pipeline">
        {scan.stages.map((stage, index) => {
          const pct = stage.progress
            ? Math.min(100, (stage.progress.done / Math.max(1, stage.progress.total)) * 100)
            : 0;
          return (
            <li
              key={stage.id}
              className={`pipe-stage pipe-stage--${stage.state}`}
              title={stage.truth}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="pipe-track" aria-hidden="true">
                {index > 0 ? <span className="pipe-line pipe-line--in" /> : <span className="pipe-line pipe-line--stub" />}
                <span className="pipe-node">
                  {stage.state === "complete" ? (
                    <Check weight="bold" />
                  ) : stage.state === "failed" ? (
                    <X weight="bold" />
                  ) : null}
                </span>
                {index < scan.stages.length - 1 ? (
                  <span className="pipe-line pipe-line--out" />
                ) : (
                  <span className="pipe-line pipe-line--stub" />
                )}
              </div>
              <strong>{stage.label}</strong>
              <small>
                {stage.detail ??
                  (stage.state === "pending" ? "Queued" : stage.state === "running" ? "Working…" : "—")}
              </small>
              {stage.progress && stage.state === "running" ? (
                <span
                  className="pipe-bar"
                  role="progressbar"
                  aria-valuenow={stage.progress.done}
                  aria-valuemin={0}
                  aria-valuemax={stage.progress.total}
                  aria-label={`${stage.label} progress`}
                >
                  <i style={{ width: `${pct}%` }} />
                </span>
              ) : (
                <time>{stage.startedAt ? elapsed(stage.startedAt, stage.endedAt) : ""}</time>
              )}
            </li>
          );
        })}
      </ol>

      {scan.agents.length > 0 ? (
        <div className="swarm-agents">
          {scan.agents.map((agent) => {
            const Icon = AGENT_ICON[agent.kind];
            const pct = agent.total > 0 ? Math.min(100, (agent.processed / agent.total) * 100) : 0;
            return (
              <article key={agent.id} className={`swarm-agent swarm-agent--${agent.state}`}>
                <header>
                  <span className={`swarm-agent-icon swarm-agent-icon--${agent.kind}`}>
                    <Icon weight="bold" />
                  </span>
                  <div>
                    <strong>{agent.label}</strong>
                    <small>{agent.detail}</small>
                  </div>
                  <span className="swarm-agent-state">
                    {agent.state === "done" ? (
                      <Check weight="bold" />
                    ) : agent.state === "failed" ? (
                      <Warning weight="fill" />
                    ) : (
                      `${agent.processed}/${agent.total}`
                    )}
                  </span>
                </header>
                <span className="swarm-agent-bar" aria-hidden="true">
                  <i style={{ width: `${agent.state === "done" ? 100 : pct}%` }} />
                </span>
                {agent.findings.length > 0 ? (
                  <ul className="swarm-agent-findings">
                    {agent.findings.slice(-3).map((finding, index) => (
                      <li key={`${agent.id}_${index}`}>{finding}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="swarm-log" ref={logRef} role="log" aria-label="Scan log">
        {scan.log.slice(-60).map((line, index) => (
          <p key={`${line.at}_${index}`} className={`swarm-log-line swarm-log-line--${line.level}`}>
            <LocalTime value={line.at} mode="time" />
            <em>{line.stage}</em>
            {line.message}
          </p>
        ))}
      </div>

      {scan.status === "failed" && scan.error ? (
        <div className="manifest-alert manifest-alert--warning" role="alert">
          <div>
            <strong>{scan.error.code}</strong>
            <span>{scan.error.message}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
