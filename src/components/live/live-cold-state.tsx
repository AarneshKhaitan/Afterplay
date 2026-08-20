import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { LiveWorkspaceCounts } from "./data";

type Fact = {
  label: string;
  value: string;
};

export function LiveColdState({
  title,
  summary,
  creatorName,
  creatorId,
  counts,
  missingTitle,
  missingReason,
  nextTitle,
  nextAction,
  href,
  linkLabel,
  facts = [],
}: Readonly<{
  title: string;
  summary: string;
  creatorName: string;
  creatorId: string;
  counts: LiveWorkspaceCounts;
  missingTitle: string;
  missingReason: string;
  nextTitle: string;
  nextAction: string;
  href: string;
  linkLabel: string;
  facts?: Fact[];
}>) {
  const persistedFacts: Fact[] = [
    { label: "Channel memory on disk", value: `${counts.threads} threads from ${counts.streams} streams` },
    { label: "Completed intelligence scans", value: String(counts.completeScans) },
    { label: "Usable clips in latest run", value: String(counts.usableClips) },
    ...facts,
  ];

  return (
    <div className="surface">
      <section className="page-hero">
        <div>
          <h1>{title}</h1>
          <p>{summary}</p>
          <div className="hero-meta">
            <span className="status-chip status-chip--safe">Live cold state</span>
            <span>{creatorName}</span>
            <span>{creatorId}</span>
          </div>
        </div>
      </section>

      <section className="channel-memory" aria-labelledby="live-exists-title">
        <div className="memory-section-heading">
          <h2 id="live-exists-title">What exists on disk</h2>
          <span>Selected creator only</span>
        </div>
        <div className="plan-table">
          {persistedFacts.map((fact) => (
            <div className="plan-row" key={fact.label}>
              <span className="plan-role">Persisted</span>
              <strong>{fact.label}</strong>
              <span>{fact.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="results-empty" aria-labelledby="live-missing-title">
        <h2 id="live-missing-title">{missingTitle}</h2>
        <p>{missingReason}</p>
        <h2>{nextTitle}</h2>
        <p>{nextAction}</p>
        <Link className="primary-small" href={href}>{linkLabel} <ArrowRight weight="bold" /></Link>
      </section>
    </div>
  );
}
