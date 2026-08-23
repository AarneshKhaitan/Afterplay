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
  // A moment where Riff chose not to speak is still a moment worth showing.
  silent: Waveform,
} as const;

export default function RiffDashboardPage() {
  const data = riffStreamAnalytics;

  // Chart geometry, derived once so the polyline, the dots and the collision marker
  // cannot drift apart.
  const trail = data.scoreTrail;
  const peak = Math.max(...trail.map((p) => p.score));
  // The plot stops at 596 of a 720 viewBox. The collision label sits past the last point
  // and is ~88px at 11px bold, so anything wider than this clipped its final character.
  const x = (index: number) => (index / (trail.length - 1)) * 596;
  const y = (score: number) => 102 - (score / peak) * 90;
  const points = trail.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");

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

            {/* The run itself, read off the captured frames. The score line is what makes
              * the moment trail below legible: every entry there has a position on this
              * curve, and the collision is where it stops. */}
            <section className="riff-run-chart" aria-labelledby="run-title">
              <div className="riff-section-heading">
                <h2 id="run-title">The run</h2>
                <span>score, sampled from captured frames</span>
              </div>
              <svg viewBox="0 0 720 132" role="img" aria-label={`Score climbs from 0 to ${peak} points over 51 seconds, ending in a collision.`}>
                <defs>
                  <linearGradient id="runFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6b55" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#ff6b55" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((row) => (
                  <line key={row} x1="0" y1={12 + row * 30} x2="720" y2={12 + row * 30}
                    stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
                ))}
                <polygon fill="url(#runFill)" points={`0,102 ${points} ${x(trail.length - 1)},102`} />
                <polyline fill="none" stroke="#ff6b55" strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" points={points} />
                {trail.map((p, i) => (
                  <circle key={p.t} cx={x(i)} cy={y(p.score)} r={p.end ? 4.5 : 2.5}
                    fill={p.end ? "#ff6b55" : "#0f0f11"} stroke="#ff6b55" strokeWidth="1.5" />
                ))}
                <line x1={x(trail.length - 1)} y1="12" x2={x(trail.length - 1)} y2="102"
                  stroke="#ff6b55" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 3" />
                <text x={x(trail.length - 1) + 10} y={y(peak) + 4} textAnchor="start"
                  fill="#ff6b55" fontSize="11" fontWeight="700">GAME OVER · {peak}</text>
                {trail.filter((_, i) => i % 2 === 0).map((p, i) => (
                  <text key={p.t} x={x(i * 2)} y="124" textAnchor="middle"
                    fill="currentColor" fillOpacity="0.45" fontSize="10">{p.t}</text>
                ))}
              </svg>
            </section>

            {/* What the director chose. Silence dominating is the point, not a gap. */}
            <section className="riff-decisions" aria-label="Director decisions this session">
              {data.decisions.map((decision) => (
                <article key={decision.kind} className={`riff-decision riff-decision--${decision.kind}`}>
                  <strong>{decision.count}</strong>
                  <div><span>{decision.label}</span><small>{decision.note}</small></div>
                </article>
              ))}
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
