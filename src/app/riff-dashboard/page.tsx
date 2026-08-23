import {
  Broadcast,
  CheckCircle,
  ChatCircleDots,
  Clock,
  GameController,
  Sparkle,
  TrendUp,
  Waveform,
} from "@phosphor-icons/react/dist/ssr";

import { WorkspaceShell } from "@/components/workspace-shell";
import { riffStreamAnalytics } from "@/domain/riff-stream-analytics";

const momentIcon = {
  memory: Sparkle,
  audience: ChatCircleDots,
  poll: Broadcast,
  game: GameController,
} as const;

export default function RiffDashboardPage() {
  const data = riffStreamAnalytics;

  return (
    <WorkspaceShell active="Riff board" pageName="Riff Control Room" badge="Stream intelligence">
      <div className="riff-analytics">
        <header className="riff-analytics-intro">
          <div>
            <h1>{data.headline.title}</h1>
            <p>{data.headline.summary}</p>
          </div>
          <div className="riff-live-stamp"><span /><div><strong>Latest session</strong><small>{data.selectedSession.date}</small></div></div>
        </header>

        <section className="riff-analytics-totals" aria-label="Riff totals">
          {data.totals.map((total) => <article key={total.label}><span>{total.label}</span><strong>{total.value}</strong><small>{total.note}</small></article>)}
        </section>

        <section className="riff-analytics-workspace" aria-label="Stream session analytics">
          <aside className="riff-session-list">
            <div className="riff-section-heading"><h2>Streams</h2><span>Latest first</span></div>
            {data.sessions.map((session) => (
              <article className={session.active ? "riff-session-item riff-session-item--active" : "riff-session-item"} key={session.title}>
                <span className="riff-session-play"><Waveform weight="fill" /></span>
                <div><h3>{session.title}</h3><p>{session.date} · {session.duration}</p></div>
                <small>{session.moments}</small>
              </article>
            ))}
          </aside>

          <div className="riff-session-detail">
            <section className="riff-session-hero" aria-labelledby="session-title">
              <div><span>Session replay</span><h2 id="session-title">{data.selectedSession.title}</h2><p>{data.selectedSession.summary}</p></div>
              <dl><div><dt>Capture</dt><dd>{data.selectedSession.source}</dd></div><div><dt>Result</dt><dd>{data.selectedSession.result}</dd></div></dl>
            </section>

            <section className="riff-session-metrics" aria-label="Selected session metrics">
              {data.sessionMetrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>)}
            </section>

            <section className="riff-moment-stream" aria-labelledby="moment-title">
              <div className="riff-section-heading"><h2 id="moment-title">Moment trail</h2><span>What triggered the response</span></div>
              <ol>
                {data.moments.map((moment) => {
                  const Icon = momentIcon[moment.kind];
                  return <li key={moment.time}><time>{moment.time}</time><span className={`riff-moment-badge riff-moment-badge--${moment.kind}`}><Icon /></span><div><h3>{moment.title}</h3><p>{moment.detail}</p></div></li>;
                })}
              </ol>
            </section>
          </div>
        </section>

        <section className="riff-memory-overview" aria-labelledby="memory-title">
          <div className="riff-memory-intro"><span><Sparkle weight="fill" /></span><div><h2 id="memory-title">What Riff remembers</h2><p>Signals persist beyond one stream, so the next run has context before the first cactus appears.</p></div></div>
          <div className="riff-memory-list">{data.memory.map((memory) => <article key={memory.label}><div><h3>{memory.label}</h3><p>{memory.detail}</p></div><span>{memory.signal}</span></article>)}</div>
          <div className="riff-memory-foot"><CheckCircle weight="fill" /> Memory links are available to Riff before it responds on the next stream.</div>
        </section>

        <footer className="riff-analytics-foot"><TrendUp weight="fill" /><p><strong>From one session to the next:</strong> Riff joins game frames, audience messages, overlay moments, and memory into a single stream record.</p><Clock weight="fill" /><span>Updated after each session</span></footer>
      </div>
    </WorkspaceShell>
  );
}
