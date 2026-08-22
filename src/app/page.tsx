import {
  ArrowRight,
  Broadcast,
  ChartLineUp,
  Check,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { loadLiveWorkspaceCounts } from "@/components/live/data";
import { LiveHqColdState } from "@/components/live/hq-cold-state";
import { HqLiveSummary } from "@/components/live/hq-live-summary";
import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator } from "@/domain/creators";
import { getExperiment, resultMovement } from "@/domain/experiment";
import { workspaceModeState } from "@/domain/mode";
import { getDemoWorkspace } from "@/domain/workspace";

export const dynamic = "force-dynamic";


const roleTone = {
  Strategist: "role--strategist",
  Scout: "role--scout",
  Producer: "role--producer",
  Analyst: "role--analyst",
} as const;

export default async function GrowthHqPage() {
  const [creator, modeState] = await Promise.all([currentCreator(), workspaceModeState()]);
  if (modeState.mode === "live") {
    const counts = loadLiveWorkspaceCounts(creator);
    const nothingYet = counts.threads === 0 && counts.usableClips === 0 && counts.completeScans === 0;

    // A live workspace keeps the cold state only until the creator has genuinely built
    // something -- channel memory, an intelligence scan, or a usable clip. Before that
    // there is nothing to summarize; substituting the seeded demo diagnosis there would
    // invent a result nobody asked for. Once real artifacts exist, HQ summarizes them
    // and the simulated experiment/distribution state honestly, same as Audience does.
    if (nothingYet) {
      return (
        <WorkspaceShell
          active="HQ"
          pageName="Growth HQ"
          modeState={modeState}
          badge="Persisted sources only"
          dataNote="HQ has no live diagnosis or audience result. The counts shown are read from this creator's persisted memory, intelligence, and clip stores; demo fixtures are not substituted."
        >
          <LiveHqColdState
            creatorName={creator.displayName}
            creatorId={creator.id}
            counts={counts}
          />
        </WorkspaceShell>
      );
    }

    const experiment = getExperiment("exp_one_more_rule", creator.id);
    return (
      <WorkspaceShell
        active="HQ"
        pageName="Growth HQ"
        modeState={modeState}
        badge="Persisted state only"
        dataNote="HQ summarizes this creator's persisted channel memory, intelligence scans, and clip manifests, plus the simulated experiment pipeline's own state. No audience measurement is connected, and demo fixtures are not substituted."
      >
        <HqLiveSummary
          creatorName={creator.displayName}
          creatorId={creator.id}
          counts={counts}
          experiment={experiment}
        />
      </WorkspaceShell>
    );
  }

  // `meta` and `creator` moved into the shared shell with the sidebar and footer.
  const { workspace } = getDemoWorkspace();
  const { diagnosis, activeExperiment, teamActivity, decision, learning } = workspace;
  const experiment = getExperiment("exp_one_more_rule", creator.id);
  const movement = resultMovement(experiment.result);
  const learnedState = experiment.status === "learned" && experiment.learning && experiment.nextExperiment
    ? { learning: experiment.learning, nextExperiment: experiment.nextExperiment }
    : null;
  const loopComplete = learnedState !== null;
  const visibleActivity = loopComplete
    ? teamActivity.map((activity) => activity.role === "Analyst"
      ? { ...activity, action: "Recorded the learning and proposed the next test", state: "complete" as const, time: "09:46" }
      : activity)
    : teamActivity;

  return (
    <WorkspaceShell
      active="HQ"
      pageName="Growth HQ"
      modeState={modeState}
      badge="Seeded HQ fixture"
      dataNote="This HQ diagnosis, experiment, activity, and result loop are synthetic demo fixtures."
    >
        <div className="workspace-grid">
          <section className="primary-column" aria-labelledby="diagnosis-title">
            <article className="diagnosis-panel">
              <div className="diagnosis-heading">
                <h1 id="diagnosis-title">{diagnosis.title}</h1>
                <span className="confidence">{diagnosis.confidence}% confidence</span>
              </div>
              <p className="diagnosis-summary">{diagnosis.summary}</p>
              <div className="evidence-row" aria-label="Diagnosis evidence">
                {diagnosis.evidence.map((item) => (
                  <div className="evidence-item" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <p className="uncertainty"><Sparkle aria-hidden="true" /> {diagnosis.uncertainty}</p>
            </article>

            <section className="section-block" aria-labelledby="movement-title">
              <div className="section-heading">
                <h2 id="movement-title">Early return signals</h2>
                <span className="sample-note">{experiment.result ? "Sample result · 1 run" : "Baseline before result"}</span>
              </div>
              <div className="metric-grid">
                {movement.map((metric) => (
                  <article className="metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <div><strong>{metric.value}</strong><em><ChartLineUp /> {metric.delta}</em></div>
                    <small>{metric.delta === "baseline" ? "28-day baseline" : "vs 28-day baseline"}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="section-block" aria-labelledby="activity-title">
              <div className="section-heading">
                <h2 id="activity-title">Work prepared for this test</h2>
                <span className="live-indicator">Prepared</span>
              </div>
              <div className="activity-list">
                {visibleActivity.map((activity) => (
                  <div className="activity-row" key={activity.role}>
                    <span className={`role-mark ${roleTone[activity.role]}`}>{activity.role.slice(0, 1)}</span>
                    <div><strong>{activity.role}</strong><span>{activity.action}</span></div>
                    <span className={`activity-state activity-state--${activity.state}`}>
                      {activity.state === "complete" && <Check weight="bold" />}
                      {activity.time}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <aside className="right-rail" aria-label="Current work">
            <article className="experiment-card">
              <div className="experiment-image">
                <Image src="/media/rivetfall-one-more-rule.png" alt="Generated concept art for the fictional game Rivetfall" fill sizes="(max-width: 1100px) 100vw, 360px" loading="eager" />
                <span className="image-label"><Broadcast weight="fill" /> Active experiment</span>
              </div>
              <div className="experiment-body">
                <div className="experiment-title-row">
                  <div><h2>{learnedState ? learnedState.nextExperiment.name : activeExperiment.name}</h2><span className="experiment-id">{loopComplete ? "Next experiment" : "Experiment 04"}</span></div>
                  <span className="revision">R{activeExperiment.currentRevision}</span>
                </div>
                <p>{learnedState ? learnedState.nextExperiment.hypothesis : activeExperiment.premise}</p>
                <div className="experiment-target"><span>{loopComplete ? "Why this comes next" : "Target behavior"}</span><strong>{learnedState ? learnedState.learning.nextMove : activeExperiment.behavior}</strong></div>
                <Link className="text-link" href={loopComplete ? "/audience" : `/experiments/${activeExperiment.id}`}>{loopComplete ? "Review result and learning" : "See evidence and plan"} <ArrowRight /></Link>
              </div>
            </article>

            {learnedState ? (
              <article className="decision-card decision-card--learned">
                <div className="decision-top">
                  <span className="decision-icon decision-icon--learned"><Check weight="bold" /></span>
                  <div><h2>Experiment 04 learned</h2><span className="decision-status">Result recorded</span></div>
                </div>
                <p>{learnedState.learning.conclusion}</p>
                <div className="decision-meta"><span>{learnedState.learning.confidence}% confidence</span><span>No causal claim</span></div>
                <Link className="primary-action" href="/audience">Review learning <ArrowRight weight="bold" /></Link>
              </article>
            ) : (
              <article className="decision-card">
                <div className="decision-top">
                  <span className="decision-icon"><Check weight="bold" /></span>
                  <div><h2>{decision.title}</h2><span className="decision-status">Approval needed</span></div>
                </div>
                <p>{decision.summary}</p>
                <div className="decision-meta"><span>{decision.outputCount} outputs</span><span>{decision.risk}</span></div>
                <Link className="primary-action" href="/studio">Review package <ArrowRight weight="bold" /></Link>
              </article>
            )}

            <article className="learning-card">
              <h2>Latest learning</h2>
              <strong className="learning-conclusion">{learning.title}</strong>
              <p>{learning.summary}</p>
              <div className="next-move"><span>Next test</span><strong>{learning.nextMove}</strong></div>
            </article>
          </aside>
        </div>

    </WorkspaceShell>
  );
}
