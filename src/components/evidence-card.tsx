import { ArrowDown, ArrowUp, CheckCircle, Minus, Quotes } from "@phosphor-icons/react/dist/ssr";

import type { VerifiedClipEvidence } from "@/domain/clip-manifest";

function timestamp(seconds: number) {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function rightsLabel(value?: VerifiedClipEvidence["footageRights"]) {
  return value ? value.replaceAll("_", " ") : "rights not recorded";
}

export function EvidenceCard({ evidence }: { evidence: VerifiedClipEvidence }) {
  const corrected = evidence.sourceTReported !== undefined
    && Math.abs(evidence.sourceTReported - evidence.sourceT) >= 0.5;
  const impact = evidence.memoryImpact;
  const rankMovement = impact
    ? impact.rankDelta > 0 ? <><ArrowUp weight="bold" />{impact.rankDelta} ranks</>
      : impact.rankDelta < 0 ? <><ArrowDown weight="bold" />{Math.abs(impact.rankDelta)} ranks</>
        : <><Minus weight="bold" />No rank change</>
    : null;
  const boost = impact ? `${impact.boost >= 0 ? "+" : ""}${impact.boost.toFixed(2)}` : null;
  return (
    <aside className="clip-evidence" aria-label="Verified callback evidence">
      <div className="clip-evidence__heading">
        <span><CheckCircle weight="fill" /> Verified callback</span>
        <strong>{evidence.threadLabel}</strong>
      </div>
      <div className="clip-evidence__source">
        <span>{evidence.sourceStream} · {timestamp(evidence.sourceT)}</span>
      </div>
      <blockquote><Quotes weight="fill" />{evidence.sourceQuote}</blockquote>
      {corrected ? (
        <p className="clip-evidence__audit">
          Reported at {timestamp(evidence.sourceTReported!)}; transcript match corrected the source
          time to {timestamp(evidence.sourceT)}.
        </p>
      ) : null}
      <dl>
        <div><dt>Confidence</dt><dd>{evidence.confidence ?? "not recorded"}</dd></div>
        <div><dt>Current clip rights</dt><dd>{rightsLabel(evidence.footageRights)}</dd></div>
        {impact ? (
          <>
            <div><dt>Rank</dt><dd>{impact.baselineRank} → {impact.memoryRank}</dd></div>
            <div><dt>Baseline percentile</dt><dd>{impact.basePercentile.toFixed(1)}%</dd></div>
            <div><dt>Memory lift</dt><dd>{rankMovement} · {boost}</dd></div>
            <div><dt>Score scale</dt><dd>{impact.scoreScale.replaceAll("_", " ")}</dd></div>
          </>
        ) : (
          <div><dt>Memory lift</dt><dd>Comparison not recorded</dd></div>
        )}
      </dl>
    </aside>
  );
}
