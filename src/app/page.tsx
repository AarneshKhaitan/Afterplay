import {
  ArrowRight,
  Broadcast,
  CaretDown,
  ChartLineUp,
  Check,
  CirclesThreePlus,
  Clock,
  Database,
  Flask,
  House,
  LinkSimple,
  Sparkle,
  Stack,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { getExperiment } from "@/domain/experiment";
import { getDemoWorkspace } from "@/domain/workspace";

export const dynamic = "force-dynamic";

const navigation = [
  { label: "HQ", href: "/", icon: House },
  { label: "Experiments", href: "/experiments", icon: Flask },
  { label: "Studio", href: "/studio", icon: Stack },
  { label: "Audience", href: "/audience", icon: UsersThree },
  { label: "Memory", href: "/memory", icon: Database },
  { label: "Integrations", href: "/integrations", icon: LinkSimple },
];

const roleTone = {
  Strategist: "role--strategist",
  Scout: "role--scout",
  Producer: "role--producer",
  Analyst: "role--analyst",
} as const;

export default function GrowthHqPage() {
  const { meta, workspace } = getDemoWorkspace();
  const { creator, diagnosis, activeExperiment, movement, teamActivity, decision, learning } = workspace;
  const experiment = getExperiment("exp_one_more_rule");
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
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Afterplay home">
          <span className="brand-mark"><CirclesThreePlus weight="fill" /></span>
          <span>Afterplay</span>
        </Link>

        <details className="creator-menu">
          <summary className="creator-switcher" aria-label="Creator workspace">
            <Image src={creator.avatarUrl} alt="" width={38} height={38} priority />
            <span className="creator-copy">
              <strong>{creator.displayName}</strong>
              <small>@{creator.handle}</small>
            </span>
            <CaretDown aria-hidden="true" />
          </summary>
          <div className="creator-popover">
            <p>Creator workspaces</p>
            <div className="account-row account-row--active"><span className="account-avatar account-avatar--mika">MR</span><span><strong>Mika Rao</strong><small>Active demo</small></span></div>
            <div className="account-row"><span className="account-avatar">NL</span><span><strong>Nova Lee</strong><small>Example account · not loaded</small></span></div>
            <div className="account-row"><span className="account-avatar">RO</span><span><strong>Rae Okafor</strong><small>Example account · not loaded</small></span></div>
          </div>
        </details>

        <nav className="product-nav" aria-label="Product">
          <p className="nav-label">Workspace</p>
          {navigation.map(({ label, href, icon: Icon }, index) => (
            <Link key={label} href={href} className={index === 0 ? "nav-link nav-link--active" : "nav-link"}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {label === "Studio" && <span className="nav-count" aria-hidden="true">3</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="mode-block">
            <span className="mode-dot" aria-hidden="true" />
            <span><strong>Demo mode</strong><small>No live actions</small></span>
          </div>
          <details className="team-menu">
            <summary className="team-button"><Database weight="bold" /> Team notes</summary>
            <div className="team-popover"><strong>Notes shared by all four roles</strong><p>See what the team knows, what changed, and what still needs Mika’s approval.</p><Link href="/memory">Open memory</Link></div>
          </details>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">Growth HQ</span>
            <span className="topbar-date">Tuesday, 5 August</span>
          </div>
          <div className="topbar-actions">
            <span className="sample-badge"><span /> Sample workspace</span>
            <span className="updated"><Clock /> Updated 09:40</span>
          </div>
        </header>

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
                <span className="sample-note">Sample result · 1 run</span>
              </div>
              <div className="metric-grid">
                {movement.map((metric) => (
                  <article className="metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <div><strong>{metric.value}</strong><em><ChartLineUp /> {metric.delta}</em></div>
                    <small>vs 28-day baseline</small>
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

        <footer className="truth-footer">
          <span>Demo mode</span>
          <p>This workspace contains synthetic sample data. Distribution and elapsed-time results are simulated.</p>
          <time dateTime={meta.updatedAt}>Snapshot 05 Aug 2026</time>
        </footer>
      </main>
    </div>
  );
}
