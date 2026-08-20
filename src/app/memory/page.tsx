import { Check, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { MemoryView } from "@/components/intel/memory-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator, loadThreads } from "@/domain/creators";
import { activeBeliefs } from "@/domain/intel/memory";
import { loadMemory } from "@/domain/intel/store";


/* Runtime-dependent: the shell reports the ACTIVE creator and the real live-AI
 * state, both read from the environment. Statically prerendered, this page would
 * bake in whatever was true at build time and then report it forever — the exact
 * stale-state failure this panel exists to prevent. */
export const dynamic = "force-dynamic";

function timestamp(seconds: number) {
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default async function MemoryPage() {
  const creator = await currentCreator();
  const threads = loadThreads(creator.id);
  const intelligenceMemory = loadMemory(creator.id);
  const beliefs = activeBeliefs(intelligenceMemory);
  const streams = new Set(threads.map((thread) => thread.streamId));

  return (
    <WorkspaceShell active="Memory" pageName="Memory">
      <div className="surface memory-surface">
        <section className="page-hero memory-hero"><div><h1>What Afterplay remembers about {creator.displayName}</h1><p>Verified channel threads preserve continuity; intelligence beliefs preserve what repeated competitive scans have taught the strategy team.</p><div className="hero-meta"><span className="status-chip status-chip--memory">{threads.length} verified {threads.length === 1 ? "thread" : "threads"}</span><span>{beliefs.length} active {beliefs.length === 1 ? "belief" : "beliefs"}</span><span>{creator.id}</span></div></div></section>

        <section className="channel-memory" aria-labelledby="beliefs-title">
          <div className="memory-section-heading">
            <h2 id="beliefs-title">Intelligence beliefs</h2>
            <span>Creator-scoped findings loaded from competitive intelligence memory</span>
          </div>
          <MemoryView memory={intelligenceMemory} active={beliefs} />
        </section>

        <section className="channel-memory" aria-labelledby="threads-title">
          <div className="memory-section-heading">
            <h2 id="threads-title">Verified channel threads</h2>
            <span>{threads.length ? `${streams.size} transcript-backed ${streams.size === 1 ? "stream" : "streams"}` : "Nothing backfilled yet"}</span>
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
          <section className="boundary-card" aria-labelledby="boundary-title">
            <div className="boundary-icon"><WarningCircle /></div><h2 id="boundary-title">Approval rules</h2><strong>Never publish, contact, spend, or change an account without approval.</strong><p>The team can research, plan, draft, render, and analyze inside Afterplay.</p>
            <div className="boundary-split"><span><Check weight="bold" /> Team can do</span><p>Study sample evidence · draft a test · prepare assets · explain results</p><span><WarningCircle /> {creator.displayName} must decide</span><p>Publish · contact people · spend money · grant account access</p></div>
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
