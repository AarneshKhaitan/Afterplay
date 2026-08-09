import { Check, Sparkle, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator, loadThreads } from "@/domain/creators";


/* Runtime-dependent: the shell reports the ACTIVE creator and the real live-AI
 * state, both read from the environment. Statically prerendered, this page would
 * bake in whatever was true at build time and then report it forever — the exact
 * stale-state failure this panel exists to prevent. */
export const dynamic = "force-dynamic";

const beliefs = [
  {
    belief: "Recurring bits outperform one-off spectacle",
    confidence: 88,
    status: "confirmed",
    evidence: "Cross-episode running jokes carry the densest references in the sampled catalog.",
  },
  {
    belief: "Series formats can become return cues",
    confidence: 61,
    status: "learning",
    evidence: "The 20-vs-1 format recurs with rising anticipation per episode; confounders remain.",
  },
  {
    belief: "Generic follow prompts feel off-brand",
    confidence: 76,
    status: "confirmed",
    evidence: "Sample belief. Not derived from this channel.",
  },
];

const memoryEvents = [
  { owner: "Strategist", time: "Today · 09:46", title: "Experiment 04 approved", detail: "Sample event from the seeded experiment loop." },
  { owner: "Analyst", time: "Today · 09:40", title: "Result saved with limits", detail: "Keep the format name as a lead, not proof." },
  { owner: "Producer", time: "Yesterday · 18:12", title: "Copy rule added", detail: "Avoid hype language, generic follow requests, and claims that the build is impossible." },
  { owner: "Scout", time: "Mon · 11:20", title: "Viewer phrases added", detail: "Viewers call the elimination beat “the turn-off round” and the finale “the final pick curse.”" },
];

function timestamp(seconds: number) {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default async function MemoryPage() {
  const creator = await currentCreator();
  const threads = loadThreads(creator.id);
  const streams = new Set(threads.map((thread) => thread.streamId));

  return (
    <WorkspaceShell active="Memory" pageName="Memory">
      <div className="surface memory-surface">
        <section className="page-hero memory-hero"><div><h1>What Afterplay remembers about {creator.displayName}</h1><p>Channel memory is what makes a callback findable: threads extracted from earlier streams, each with the moment and the words that started it.</p><div className="hero-meta"><span className="status-chip status-chip--memory">{threads.length} extracted {threads.length === 1 ? "thread" : "threads"}</span><span>{streams.size} {streams.size === 1 ? "stream" : "streams"}</span><span>{creator.id}</span></div></div></section>

        <section className="channel-memory" aria-labelledby="threads-title">
          <div className="memory-section-heading">
            <h2 id="threads-title">Channel memory</h2>
            <span>{threads.length ? "Real, extracted from this channel's transcripts" : "Nothing backfilled yet"}</span>
          </div>
          {threads.length ? (
            <div className="thread-list">
              {threads.map((thread) => (
                <article key={thread.id} className="thread-row">
                  <div className="thread-head">
                    <span className="thread-kind">{thread.kind}</span>
                    <h3>{thread.label}</h3>
                    <span className={`thread-status thread-status--${thread.status}`}>{thread.status}</span>
                  </div>
                  {thread.summary ? <p>{thread.summary}</p> : null}
                  <div className="thread-cite">
                    <span>{thread.streamId} · {timestamp(thread.t)}</span>
                    {thread.quote ? <q>{thread.quote}</q> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="thread-empty">
              No channel memory for <code>{creator.id}</code> yet. Run a backfill, or clip a
              stream from Ingest with memory enabled. Until then no callback can be claimed —
              the cold-start path returns standalone clips and says so.
            </p>
          )}
        </section>

        <div className="memory-grid">
          <section className="identity-card" aria-labelledby="identity-title">
            <div className="identity-header"><span className="identity-mark">{creator.initials}</span><div><h2 id="identity-title">{creator.displayName}</h2><span>{creator.id} · {threads.length} threads</span></div></div>
            <dl><div><dt>Creative territory</dt><dd>Ensemble group formats, recurring bits, escalating social stakes</dd></div><div><dt>Voice</dt><dd>Fast, self-aware banter; the joke is funnier because the audience knows the history</dd></div><div><dt>Avoid</dt><dd>Manufactured rage, fake stakes, trend-chasing without a creator fit</dd></div><div><dt>Community promise</dt><dd>Long-running jokes pay off — loyal viewers are in on something new viewers are not</dd></div></dl>
          </section>

          <section className="beliefs-card" aria-labelledby="beliefs-title">
            <div className="memory-section-heading"><h2 id="beliefs-title">Working beliefs</h2><span>Authored sample · not learned</span></div>
            <div className="belief-list">{beliefs.map((item) => <article key={item.belief}><div className={`belief-status belief-status--${item.status}`}>{item.status === "confirmed" ? <Check weight="bold" /> : <Sparkle weight="fill" />}</div><div><div><h3>{item.belief}</h3><span>{item.confidence}%</span></div><p>{item.evidence}</p></div></article>)}</div>
          </section>

          <section className="boundary-card" aria-labelledby="boundary-title">
            <div className="boundary-icon"><WarningCircle /></div><h2 id="boundary-title">Approval rules</h2><strong>Never publish, contact, spend, or change an account without approval.</strong><p>The team can research, plan, draft, render, and analyze inside Afterplay.</p>
            <div className="boundary-split"><span><Check weight="bold" /> Team can do</span><p>Study sample evidence · draft a test · prepare assets · explain results</p><span><WarningCircle /> {creator.displayName} must decide</span><p>Publish · contact people · spend money · grant account access</p></div>
          </section>

          <section className="language-card" aria-labelledby="language-title"><div className="memory-section-heading"><h2 id="language-title">Viewer phrases worth reusing</h2></div><div className="phrase-cloud"><span>the turn-off round</span><span>she doesn&apos;t know him</span><span>the final pick curse</span><span>down bad</span><span>built different</span></div><p>The model treats these quotes as reference material, not instructions.</p></section>

          <section className="memory-timeline" aria-labelledby="timeline-title"><div className="memory-section-heading"><h2 id="timeline-title">Recent updates</h2><span>Every update has an owner</span></div><div>{memoryEvents.map((event) => <article key={event.title}><span className="timeline-mark" /><div><span>{event.owner} · {event.time}</span><h3>{event.title}</h3><p>{event.detail}</p></div></article>)}</div></section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
