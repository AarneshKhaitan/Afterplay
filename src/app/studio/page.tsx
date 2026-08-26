import { Check, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { EvidenceCard } from "@/components/evidence-card";
import { StudioDecisionPanel } from "@/components/studio-decision-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getLatestClipManifest } from "@/domain/clip-manifest";
import { currentCreator } from "@/domain/creators";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

/** Display label for a manifest clip.
 *
 * Never the raw transcript. Note `copy.title` is NOT reliably a title: without an LLM the
 * heuristic copy generator derives it from the transcript, so it arrives as a sentence
 * fragment of speech. Accept it only when short enough to read as a heading, then fall
 * back to the callback thread label, which is short and human by construction. */
function clipLabel(clip: {
  copy?: { title?: string; hook_text_overlay?: string | null };
  threadLabel?: string;
  why?: string;
}): string {
  const generated = clip.copy?.title?.trim() ?? "";
  const usableTitle = generated && generated.length <= 60 ? generated : "";
  const candidate =
    usableTitle || clip.threadLabel || clip.copy?.hook_text_overlay || clip.why || "";
  const trimmed = candidate.trim();
  if (!trimmed) return "Stand-alone clip";
  return trimmed.length > 72 ? `${trimmed.slice(0, 69).trimEnd()}…` : trimmed;
}

/** Turn the picker's internal reason into something a creator can read.
 *
 * `why` is a diagnostic string — "cold-start: 1 audio-events, 0 turns, 0 questions,
 * 222 wpm" — and it was being rendered as the clip's pull-quote. A callback reason is
 * genuinely informative and stays; a cold-start reason is not, so it becomes a plain
 * statement of how the moment was chosen instead of leaking instrumentation. */
function selectionReason(clip: {
  why?: string; callback?: boolean; threadLabel?: string; callbackConfidence?: number;
}): string {
  const why = clip.why?.trim() ?? "";
  if (clip.callback && clip.threadLabel) {
    return `Pays off “${clip.threadLabel}” from an earlier stream${
      clip.callbackConfidence ? ` · confidence ${clip.callbackConfidence}` : ""}.`;
  }
  if (!why || /^cold-start:/.test(why)) {
    const events = why.match(/(\d+) audio-events/)?.[1];
    const wpm = why.match(/(\d+) wpm/)?.[1];
    const signals = [
      events && Number(events) > 0 ? `${events} audio peak${Number(events) === 1 ? "" : "s"}` : null,
      wpm ? `${wpm} words per minute` : null,
    ].filter(Boolean);
    return signals.length
      ? `Chosen on delivery signals: ${signals.join(", ")}. No earlier stream was referenced here.`
      : "Chosen as a strong standalone moment. No earlier stream was referenced here.";
  }
  return why;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function StudioPage() {
  const creator = await currentCreator();
  const experiment = getExperiment("exp_one_more_rule", creator.id);
  const manifest = getLatestClipManifest(creator.id);
  const realClips = manifest?.clips ?? [];
  const pipelineOutputs = experiment.pipelineOutputs ?? [];
  const memory = manifest?.memory;
  /** Every applicable state, not just the first one.
   *
   * These were chained with `? :`, so a run that was both stale AND degraded showed only
   * the stale banner: the operator saw that a newer job had not finished, but not that
   * the run they were looking at had a broken memory pass. A panel whose purpose is to
   * stop states being hidden must not hide one behind another.
   *
   * `message` is skipped when degraded because it carries the degradation text already;
   * the no-callback message is the only thing it adds on its own. */
  const manifestAlerts: Array<{ tone: string; title: string; body: string }> = [];
  if (manifest?.stale) {
    manifestAlerts.push({ tone: "warning", title: "Showing latest complete run", body: manifest.staleReason ?? "A newer job has not completed yet." });
  }
  if (memory?.degraded) {
    manifestAlerts.push({ tone: "warning", title: "Creator memory degraded", body: memory.reason ?? "The memory pass failed; standalone clips are still shown." });
  } else if (manifest?.message) {
    manifestAlerts.push({ tone: "neutral", title: "No callback found", body: manifest.message });
  }
  if (manifest && !manifest.approvalReady) {
    manifestAlerts.push({
      tone: "warning",
      title: "Review only — approval blocked",
      body: manifest.approvalBlockedReasons.join(" "),
    });
  }

  return (
    <WorkspaceShell active="Studio" pageName="Studio">
      <div className="surface studio-surface">
        <section className="page-hero studio-hero"><div><h1>Review the package</h1><p>{realClips.length ? `${plural(realClips.length, "clip", "clips")} from the latest run, each with the evidence for why it was chosen. ${manifest?.approvalReady ? "Approving here approves the cleared clips too." : "The clips remain review-only until provenance and rights are complete."}` : "No clipper run yet. Clip a stream from Ingest and its clips appear here with their evidence trail."}</p><div className="hero-meta"><span className="status-chip status-chip--review">Needs approval</span><span>Revision {experiment.revision}</span>{realClips.length ? <span>{plural(realClips.length, "real clip", "real clips")}</span> : null}<span>{plural(experiment.outputs.length, "seeded output", "seeded outputs")}</span></div></div><div className="studio-summary"><span><Check weight="bold" /> Approval gates distribution</span><span>{manifest?.approvalReady ? <ShieldCheck weight="fill" /> : <WarningCircle weight="fill" />} {pipelineOutputs.length ? "Cleared pipeline output + seeded sample" : "Seeded sample approval only"}</span></div></section>

        {manifest ? (
          <section className="manifest-panel" aria-label="Latest clipper manifest">
            <div className="manifest-heading">
              <div>
                <span>Latest service manifest</span>
                <h2>{manifest.source.title || manifest.job_id}</h2>
              </div>
              <strong>{plural(realClips.length, "clip", "clips")} · {manifest.encoder || "encoder unknown"}</strong>
            </div>
            {manifestAlerts.map((alert) => (
              <div key={alert.title} className={`manifest-alert manifest-alert--${alert.tone}`} role={alert.tone === "warning" ? "alert" : "status"}>
                <WarningCircle weight="fill" /><div><strong>{alert.title}</strong><span>{alert.body}</span></div>
              </div>
            ))}
            <div className="output-grid output-grid--manifest">
              {realClips.map((clip, index) => {
                return (
                  <article className={`output-card${clip.ok ? "" : " output-card--failed"}`} key={clip.clip_id} aria-label={clip.clip_id}>
                    <div className={`output-preview manifest-preview${clip.path ? "" : " manifest-preview--failed"}`}>{clip.path ? <video controls preload="metadata" src={`/api/clips/${encodeURIComponent(clip.clip_id)}/media`} aria-label={`${clip.clip_id} preview`} /> : <><WarningCircle weight="fill" /><strong>Render unavailable</strong></>}<span className="output-order">0{index + 1}</span><span className="duration">{Math.round(clip.duration)}s</span></div>
                    <div className="output-body"><h2>{clipLabel(clip)}</h2><small className="clip-id">{clip.clip_id}</small><div className="output-platform"><span>{clip.ok ? (clip.callback ? "callback clip" : "service clip") : "failed clip"}</span><strong>{clip.platform}</strong></div>{clip.ok ? <p className="selection-reason">{selectionReason(clip)}</p> : <p className="clip-failure" role="status"><WarningCircle weight="fill" />{clip.error || "This clip failed its quality gate and is excluded from approval."}</p>}{clip.copy?.caption ? <p className="clip-caption"><span>Caption</span>{clip.copy.caption}</p> : null}{clip.copy?.hashtags?.length ? <ul className="output-hashtags">{clip.copy.hashtags.map((tag) => <li key={tag}>#{tag}</li>)}</ul> : null}<p className="clip-transcript"><span>Transcript</span>{clip.text_for_copy || "No transcript excerpt was included in the manifest."}</p>{clip.evidence ? <EvidenceCard evidence={clip.evidence} /> : <div className="output-rationale"><span>Manifest</span><strong>{manifest.manifestPath}</strong></div>}<div className={`provenance${manifest.approvalReady && clip.ok ? "" : " provenance--blocked"}`}>{manifest.approvalReady && clip.ok ? <ShieldCheck /> : <WarningCircle />}<span>{clip.ok ? (manifest.source.footage_rights ? manifest.source.footage_rights.replaceAll("_", " ") : "Legacy manifest — rights not recorded") : "Failed quality gate · excluded from approval"}</span></div></div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {pipelineOutputs.length ? (
          <section className="pipeline-approval" aria-label="Pipeline clips in this approval">
            <div className="section-heading">
              <h2>Also in this approval: pipeline clips</h2>
              <span className="sample-note">
                {plural(pipelineOutputs.length, "real clip", "real clips")} from the clipper — approving this experiment approves these too
              </span>
            </div>
            <div className="pipeline-approval-list">
              {pipelineOutputs.map((output) => (
                <article key={output.id} className="pipeline-approval-row">
                  <div>
                    <strong>{output.title}</strong>
                    <small className="clip-id">{output.id}</small>
                  </div>
                  <p>{output.rationale}</p>
                  <div className="pipeline-approval-meta">
                    <span>{output.platform}</span>
                    <span>{output.duration}</span>
                    <span className={`status-chip status-chip--${output.status}`}>{output.status}</span>
                    <span className="provenance-tag">{output.provenance.rights.replaceAll("_", " ")}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* The seeded package's cards are not rendered.
         *
         * They were authored sample media -- three stock bridge renders with invented
         * titles -- sitting directly beneath the creator's own clips. Two sets of cards
         * in one column invited the reader to take them for the same kind of thing, and
         * the disclaimer above them was the only thing saying otherwise.
         *
         * The experiment itself is untouched: it still backs the approval below, which
         * is what the revision and receipts belong to. Only its invented artwork is
         * gone from the page. */}
        <StudioDecisionPanel initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
