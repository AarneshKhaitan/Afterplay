import { Check, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { StudioDecisionPanel } from "@/components/studio-decision-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getLatestClipManifest } from "@/domain/clip-manifest";
import { getExperiment } from "@/domain/experiment";

export const dynamic = "force-dynamic";

export default function StudioPage() {
  const experiment = getExperiment("exp_one_more_rule");
  const manifest = getLatestClipManifest();
  const realClips = manifest?.clips ?? [];

  return (
    <WorkspaceShell active="Studio" pageName="Studio">
      <div className="surface studio-surface">
        <section className="page-hero studio-hero"><div><h1>Review the package</h1><p>Review the three cuts as one test. Together they name the series, show how chat participates, and point to the next stream.</p><div className="hero-meta"><span className="status-chip status-chip--review">Needs approval</span><span>Revision {experiment.revision}</span><span>3 outputs</span></div></div><div className="studio-summary"><span><Check weight="bold" /> Matches Experiment 04</span><span><ShieldCheck weight="fill" /> Synthetic project-owned media</span></div></section>

        {manifest ? (
          <section className="manifest-panel" aria-label="Latest clipper manifest">
            <div className="manifest-heading">
              <div>
                <span>Latest service manifest</span>
                <h2>{manifest.source.title || manifest.job_id}</h2>
              </div>
              <strong>{realClips.length} clips · {manifest.encoder || "encoder unknown"}</strong>
            </div>
            <div className="output-grid output-grid--manifest">
              {realClips.slice(0, 3).map((clip, index) => {
                const callback = clip.signals?.callback === true;
                return (
                  <article className="output-card" key={clip.clip_id} aria-label={clip.clip_id}>
                    <div className="output-preview manifest-preview"><span className="output-order">0{index + 1}</span><span className="duration">{Math.round(clip.duration)}s</span><strong>{clip.ok ? "QC passed" : "Needs review"}</strong></div>
                    <div className="output-body"><h2>{clip.clip_id}</h2><div className="output-platform"><span>{callback ? "callback clip" : "service clip"}</span><strong>{clip.platform}</strong></div><blockquote>“{clip.why || "Manifest clip from the Python service."}”</blockquote><p>{clip.text_for_copy || clip.path || "No transcript excerpt was included in the manifest."}</p><div className="output-rationale"><span>{callback ? "Callback evidence" : "Manifest"}</span><strong>{callback ? `${String(clip.signals?.thread_label ?? "Thread")} · confidence ${String(clip.signals?.confidence ?? "?")}` : manifest.manifestPath}</strong></div><div className="provenance"><ShieldCheck /><span>Real clipper manifest</span></div></div>
                  </article>
                );
              })}
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
