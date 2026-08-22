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

/** The evidence card, redesigned as a receipt: a document pulled from the creator's own
 * footage rather than a generic stat panel. The rail on the left is not decoration — its
 * top node marks the older stream the quote was pulled from, its bottom node marks the
 * measured effect on the new clip, and the dotted thread between them runs behind the
 * quote because the quote is the thing that connects the two. */
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
    <aside className="receipt" aria-label="Verified callback evidence">
      <div className="receipt__head">
        <span className="receipt__badge"><CheckCircle weight="fill" /> Verified callback</span>
        <p className="receipt__thread">{evidence.threadLabel}</p>
      </div>
      <div className="receipt__scan">
        <div className="receipt__rail" aria-hidden="true">
          <span className="receipt__node receipt__node--source" />
          <span className="receipt__rail-line" />
          <span className="receipt__node receipt__node--payoff" />
        </div>
        <div className="receipt__main">
          <p className="receipt__source">
            <span className="receipt__id">{evidence.sourceStream}</span>
            <span className="receipt__sep"> · </span>
            <span className="receipt__time">{timestamp(evidence.sourceT)}</span>
          </p>
          <blockquote className="receipt__quote"><Quotes weight="fill" />{evidence.sourceQuote}</blockquote>
          {corrected ? (
            <p className="receipt__audit">
              Reported at {timestamp(evidence.sourceTReported!)}; transcript match corrected the source
              time to {timestamp(evidence.sourceT)}.
            </p>
          ) : null}
          <div className="receipt__perf" aria-hidden="true" />
          <dl className="receipt__ledger">
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
        </div>
      </div>
    </aside>
  );
}
