"use client";

import { ArrowDown, ArrowUp, Brain, Clock, Minus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import type { Belief, BeliefStatus, IntelMemory } from "@/domain/intel/types";

import { LocalTime } from "./local-time";

const STATUS_ORDER: BeliefStatus[] = ["confirmed", "emerging", "weakening", "contradicted"];

const STATUS_COPY: Record<BeliefStatus, string> = {
  confirmed: "Held across multiple scans",
  emerging: "Seen once — not yet corroborated",
  weakening: "Not re-observed; confidence decaying",
  contradicted: "Later evidence argued against this",
};

/** Sparkline of a belief's confidence history.
 *
 * Inline SVG rather than a chart library: it is six points and it has to sit inside a
 * row without pulling a dependency into the bundle.
 */
function Trend({ history }: { history: Belief["history"] }) {
  if (history.length < 2) return null;
  const points = history.slice(-8);
  const w = 64;
  const h = 20;
  const step = w / (points.length - 1);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${index * step} ${h - point.confidence * h}`)
    .join(" ");
  const rising = points[points.length - 1].confidence >= points[0].confidence;

  return (
    <svg className="belief-trend" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke={rising ? "var(--positive)" : "var(--accent)"} strokeWidth="1.5" />
    </svg>
  );
}

export function MemoryView({ memory, active }: { memory: IntelMemory; active: Belief[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BeliefStatus | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<Belief["scope"] | "all">("all");

  const beliefs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...memory.beliefs]
      .filter((belief) => {
        if (statusFilter !== "all" && belief.status !== statusFilter) return false;
        if (scopeFilter !== "all" && belief.scope !== scopeFilter) return false;
        if (!needle) return true;
        return (
          belief.statement.toLowerCase().includes(needle) ||
          belief.detail.toLowerCase().includes(needle) ||
          belief.key.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const order = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        return order !== 0 ? order : b.confidence - a.confidence;
      });
  }, [memory.beliefs, query, statusFilter, scopeFilter]);

  if (memory.totals.scans === 0) {
    return (
      <p className="intel-empty">
        Memory is empty. Run a scan and Afterplay will start forming beliefs it carries forward.
      </p>
    );
  }

  return (
    <div className="memory-view">
      <section className="memory-totals" aria-label="Memory totals">
        <article>
          <strong>{memory.totals.scans}</strong>
          <span>scans</span>
        </article>
        <article>
          <strong>{memory.totals.videosAnalyzed}</strong>
          <span>videos analysed</span>
        </article>
        <article>
          <strong>{memory.totals.transcriptsRead}</strong>
          <span>transcripts read</span>
        </article>
        <article>
          <strong>{memory.totals.channelsTracked}</strong>
          <span>channels tracked</span>
        </article>
        <article className="memory-totals--accent">
          <strong>{active.length}</strong>
          <span>standing beliefs</span>
        </article>
      </section>

      <p className="memory-explainer">
        <Brain weight="fill" /> Every scan folds into this. A belief seen again gains confidence; a
        belief the next scan stops supporting decays and eventually fades. Nothing is deleted — the
        timeline keeps what Afterplay used to think, which is how you can tell it is learning
        rather than starting over.
      </p>

      <div className="memory-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search beliefs…"
          aria-label="Search beliefs"
        />
        <label className="explorer-select">
          <span className="visually-hidden">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as BeliefStatus | "all")}
          >
            <option value="all">Any status</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="explorer-select">
          <span className="visually-hidden">Filter by scope</span>
          <select
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value as Belief["scope"] | "all")}
          >
            <option value="all">Any scope</option>
            <option value="own">Your channel</option>
            <option value="competitive">Competitive</option>
            <option value="market">Market</option>
          </select>
        </label>
        <span className="explorer-count" role="status">
          {beliefs.length} of {memory.beliefs.length}
        </span>
      </div>

      <ul className="belief-list">
        {beliefs.map((belief) => (
          <li key={belief.key} className={`belief belief--${belief.status}`}>
            <div className="belief-head">
              <div>
                <h4>{belief.statement}</h4>
                <small>{belief.detail}</small>
              </div>
              <Trend history={belief.history} />
            </div>
            <div className="belief-meta">
              <span className={`belief-status belief-status--${belief.status}`} title={STATUS_COPY[belief.status]}>
                {belief.status}
              </span>
              <span className="belief-confidence">
                <i style={{ width: `${belief.confidence * 100}%` }} />
                <em>{Math.round(belief.confidence * 100)}%</em>
              </span>
              {belief.lastDelta !== 0 ? (
                <span className={`belief-delta belief-delta--${belief.lastDelta > 0 ? "up" : "down"}`}>
                  {belief.lastDelta > 0 ? <ArrowUp weight="bold" /> : <ArrowDown weight="bold" />}
                  {Math.abs(Math.round(belief.lastDelta * 100))} pts
                </span>
              ) : (
                <span className="belief-delta">
                  <Minus weight="bold" /> steady
                </span>
              )}
              <span className="belief-obs">
                seen {belief.observations}x · since {belief.firstSeen.slice(0, 10)}
              </span>
              <span className="belief-scope">{belief.scope}</span>
            </div>
          </li>
        ))}
      </ul>

      <section className="memory-timeline" aria-labelledby="timeline-title">
        <div className="section-heading">
          <h3 id="timeline-title">
            <Clock weight="bold" /> How the picture changed
          </h3>
        </div>
        <ol>
          {memory.events.slice(0, 40).map((event, index) => (
            <li key={`${event.at}_${index}`} className={`timeline-event timeline-event--${event.kind}`}>
              <LocalTime value={event.at} />
              <div>
                <strong>{event.summary}</strong>
                {event.detail ? <small>{event.detail}</small> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
