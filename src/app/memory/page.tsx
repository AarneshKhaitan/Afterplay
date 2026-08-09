import { Check, Sparkle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { WorkspaceShell } from "@/components/workspace-shell";
import { demoWorkspace } from "@/domain/workspace";


/* Runtime-dependent: the shell reports the ACTIVE creator and the real live-AI
 * state, both read from the environment. Statically prerendered, this page would
 * bake in whatever was true at build time and then report it forever — the exact
 * stale-state failure this panel exists to prevent. */
export const dynamic = "force-dynamic";

const beliefs = [
  {
    belief: "Viewer ingenuity beats creator perfection",
    confidence: 88,
    status: "confirmed",
    evidence: "Constraint moments create the densest chat across the eight-stream sample.",
  },
  {
    belief: "Named formats can become return cues",
    confidence: 61,
    status: "learning",
    evidence: "One More Rule moved repeat behavior in one sample run; confounders remain.",
  },
  {
    belief: "Generic follow prompts feel off-brand",
    confidence: 76,
    status: "confirmed",
    evidence: "Mika rejected two direct-response captions during archive review.",
  },
];

const memoryEvents = [
  { owner: "Strategist", time: "Today · 09:46", title: "Experiment 04 approved", detail: "Mika accepted the participatory premise without changing the restrained voice." },
  { owner: "Analyst", time: "Today · 09:40", title: "Result saved with limits", detail: "Keep the format name as a lead, not proof." },
  { owner: "Producer", time: "Yesterday · 18:12", title: "Copy rule added", detail: "Avoid hype language, generic follow requests, and claims that the build is impossible." },
  { owner: "Scout", time: "Mon · 11:20", title: "Viewer phrases added", detail: "Viewers call failed machines “beautiful disasters” and constraints “new laws.”" },
];

export default function MemoryPage() {
  const { creator } = demoWorkspace.workspace;

  return (
    <WorkspaceShell active="Memory" pageName="Memory">
      <div className="surface memory-surface">
        <section className="page-hero memory-hero"><div><h1>What the team knows about Mika</h1><p>Creator preferences, audience patterns, test results, and approval rules live here so each role works from the same notes.</p><div className="hero-meta"><span className="status-chip status-chip--memory">Shared across 4 roles</span><span>18 sourced entries</span><span>Updated today</span></div></div></section>

        <div className="memory-grid">
          <section className="identity-card" aria-labelledby="identity-title">
            <div className="identity-header"><Image src={creator.avatarUrl} alt="Mika Rao" width={62} height={62} /><div><h2 id="identity-title">Mika Rao</h2><span>@{creator.handle} · {creator.category}</span></div></div>
            <blockquote>“I like when the audience makes the machine smarter—or much, much worse.”</blockquote>
            <dl><div><dt>Creative territory</dt><dd>Emergent physics, ridiculous constraints, patient problem-solving</dd></div><div><dt>Voice</dt><dd>Dry, curious, precise; excitement comes from the build</dd></div><div><dt>Avoid</dt><dd>Manufactured rage, fake stakes, trend-chasing without a creator fit</dd></div><div><dt>Community promise</dt><dd>Viewers can change the rules, not just watch the result</dd></div></dl>
          </section>

          <section className="beliefs-card" aria-labelledby="beliefs-title">
            <div className="memory-section-heading"><h2 id="beliefs-title">Working beliefs</h2><span>Not permanent facts</span></div>
            <div className="belief-list">{beliefs.map((item) => <article key={item.belief}><div className={`belief-status belief-status--${item.status}`}>{item.status === "confirmed" ? <Check weight="bold" /> : <Sparkle weight="fill" />}</div><div><div><h3>{item.belief}</h3><span>{item.confidence}%</span></div><p>{item.evidence}</p></div></article>)}</div>
          </section>

          <section className="boundary-card" aria-labelledby="boundary-title">
            <div className="boundary-icon"><WarningCircle /></div><h2 id="boundary-title">Approval rules</h2><strong>Never publish, contact, spend, or change an account without approval.</strong><p>The team can research, plan, draft, render, and analyze inside Afterplay.</p>
            <div className="boundary-split"><span><Check weight="bold" /> Team can do</span><p>Study sample evidence · draft a test · prepare assets · explain results</p><span><WarningCircle /> Mika must decide</span><p>Publish · contact people · spend money · grant account access</p></div>
          </section>

          <section className="language-card" aria-labelledby="language-title"><div className="memory-section-heading"><h2 id="language-title">Viewer phrases worth reusing</h2></div><div className="phrase-cloud"><span>beautiful disaster</span><span>one more rule</span><span>new law</span><span>the hinge tax</span><span>chat made it worse</span></div><p>The model treats these quotes as reference material, not instructions.</p></section>

          <section className="memory-timeline" aria-labelledby="timeline-title"><div className="memory-section-heading"><h2 id="timeline-title">Recent updates</h2><span>Every update has an owner</span></div><div>{memoryEvents.map((event) => <article key={event.title}><span className="timeline-mark" /><div><span>{event.owner} · {event.time}</span><h3>{event.title}</h3><p>{event.detail}</p></div></article>)}</div></section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
