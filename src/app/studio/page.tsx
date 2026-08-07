import { Check, ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { StudioDecisionPanel } from "@/components/studio-decision-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getLatestClipManifest } from "@/domain/clip-manifest";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

function timestamp(seconds?: number) {
  if (seconds === undefined) return null;
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

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

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export default function StudioPage() {
  const experiment = getExperiment("exp_one_more_rule");
  const manifest = getLatestClipManifest();
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

  return (
    <WorkspaceShell active="Studio" pageName="Studio">
      <div className="surface studio-surface">
        <section className="page-hero studio-hero"><div><h1>Review the package</h1><p>Review the {plural(experiment.outputs.length, "cut", "cuts")} as one test. Together they name the series, show how chat participates, and point to the next stream.</p><div className="hero-meta"><span className="status-chip status-chip--review">Needs approval</span><span>Revision {experiment.revision}</span><span>{plural(experiment.outputs.length, "output", "outputs")}</span>{realClips.length ? <span>{plural(realClips.length, "clipper clip", "clipper clips")}</span> : null}</div></div><div className="studio-summary"><span><Check weight="bold" /> Matches Experiment 04</span><span><ShieldCheck weight="fill" /> Synthetic project-owned media</span></div></section>

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
              {realClips.slice(0, 3).map((clip, index) => {
                const sourceTime = timestamp(clip.sourceT);
                return (
                  <article className="output-card" key={clip.clip_id} aria-label={clip.clip_id}>
                    <div className="output-preview manifest-preview"><video controls preload="metadata" src={`/api/clips/${encodeURIComponent(clip.clip_id)}/media`} aria-label={`${clip.clip_id} preview`} /><span className="output-order">0{index + 1}</span><span className="duration">{Math.round(clip.duration)}s</span></div>
                    <div className="output-body"><h2>{clipLabel(clip)}</h2><small className="clip-id">{clip.clip_id}</small><div className="output-platform"><span>{clip.callback ? "callback clip" : "service clip"}</span><strong>{clip.platform}</strong></div><blockquote>“{clip.why || "Manifest clip from the Python service."}”</blockquote><p>{clip.text_for_copy || clip.path || "No transcript excerpt was included in the manifest."}</p><div className="output-rationale"><span>{clip.callback ? "Callback evidence" : "Manifest"}</span><strong>{clip.callback ? `${clip.threadLabel ?? "Thread"} · confidence ${clip.callbackConfidence ?? "?"}` : manifest.manifestPath}</strong>{clip.callback ? <div className="callback-citation"><span>{clip.sourceStream ?? "Unknown source"}{sourceTime ? ` · ${sourceTime}` : ""}</span><q>{clip.sourceQuote ?? "No source quote recorded."}</q></div> : null}</div><div className="provenance"><ShieldCheck /><span>Real clipper manifest</span></div></div>
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

        <section className="output-grid" aria-label="Experiment outputs">
          {experiment.outputs.map((output, index) => (
            <article className="output-card" key={output.id} aria-label={output.title}>
              <div className={`output-preview output-preview--${index + 1}`}><Image src={output.thumbnailUrl} alt="" fill sizes="(max-width: 900px) 100vw, 33vw" loading="eager" /><span className="output-order">0{index + 1}</span><span className="duration">{output.duration}</span></div>
              <div className="output-body"><h2>{output.title}</h2><div className="output-platform"><span>{output.type.replaceAll("_", " ")}</span><strong>{output.platform}</strong></div><blockquote>“{output.hook}”</blockquote><p>{output.caption}</p><div className="output-rationale"><span>Purpose</span><strong>{output.rationale}</strong></div><div className="provenance"><ShieldCheck /><span>Project-owned synthetic media</span></div></div>
            </article>
          ))}
        </section>

        <StudioDecisionPanel initialExperiment={experiment} />
      </div>
    </WorkspaceShell>
  );
}
