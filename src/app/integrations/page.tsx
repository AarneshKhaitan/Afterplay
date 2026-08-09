import { Check, LinkSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ResetDemoButton } from "@/components/reset-demo-button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { activeCreator, liveAiState } from "@/domain/identity";


/* Runtime-dependent: the shell reports the ACTIVE creator and the real live-AI
 * state, both read from the environment. Statically prerendered, this page would
 * bake in whatever was true at build time and then report it forever — the exact
 * stale-state failure this panel exists to prevent. */
export const dynamic = "force-dynamic";

/** Connection states are derived from the environment, never asserted.
 *
 * The OpenAI row was hardcoded to "Off" and the live-AI card to "Not configured", both of
 * which were simply false on a machine with a key. */
function connectionRows(live: ReturnType<typeof liveAiState>) {
  return [
    { name: "YouTube", purpose: "Ingestion via yt-dlp", state: "Read-only", scope: "No OAuth", tone: "sample", initial: "YT" },
    { name: "Twitch", purpose: "Stream archive and chat", state: "Sample data", scope: "Read-only", tone: "sample", initial: "TW" },
    { name: "Distribution", purpose: "Approved publishing actions", state: "Simulation", scope: "Local only", tone: "simulated", initial: "DS" },
    {
      name: "OpenAI",
      purpose: "Live planning, callback judging, intel reasoning",
      state: live.usable ? "Connected" : live.keyPresent ? "Key set, disabled" : "No key",
      scope: live.usable ? live.model : "Server key required",
      tone: live.usable ? "ready" : "offline",
      initial: "AI",
    },
  ];
}

const authority = [
  { action: "Research, diagnose, and plan", owner: "Afterplay", rule: "Runs inside the workspace", state: "autonomous" },
  { action: "Publish or schedule content", owner: "You", rule: "Approval required", state: "controlled" },
  { action: "Send outreach or accept terms", owner: "You", rule: "Approval required", state: "controlled" },
  { action: "Spend money or change access", owner: "You", rule: "Approval required", state: "controlled" },
];

export default function IntegrationsPage() {
  const live = liveAiState();
  const identity = activeCreator();
  const connections = connectionRows(live);
  return (
    <WorkspaceShell active="Integrations" pageName="Integrations">
      <div className="surface integrations-surface">
        <section className="page-hero integrations-hero">
          <div>
            <h1>Connections and permissions</h1>
            <p>See what is connected, what is simulated, and which actions still need your approval.</p>
            <div className="hero-meta">
              <span className={`status-chip status-chip--${live.usable ? "review" : "safe"}`}>
                {live.usable ? "Live AI configured" : "Demo configuration"}
              </span>
              <span>{identity.clipperCreatorId}</span>
              <span>No live writes</span>
            </div>
          </div>
        </section>

        <section className="mode-section" aria-labelledby="mode-title">
          <div className="memory-section-heading">
            <h2 id="mode-title">Strategy mode</h2>
            <span>{live.usable ? "Live available" : "Demo only"}</span>
          </div>
          <p className="mode-intro">
            Mode is chosen <strong>per request</strong>, on the Experiments page — there is no
            global switch to flip here, because a run should never silently change what the
            previous one meant. This panel reports what the server is configured to allow.
          </p>
          <div className="mode-grid">
            <article className="mode-card mode-card--selected">
              <div className="mode-card-top">
                <span className="mode-radio mode-radio--selected"><span /></span>
                <div><h3>Deterministic demo</h3><p>Always available</p></div>
                <span className="connection-state connection-state--ready">Ready</span>
              </div>
              <p>Uses the same validated proposal on every reset. No network call.</p>
              <dl><div><dt>Planner</dt><dd>Fixed sample</dd></div><div><dt>Network</dt><dd>Off</dd></div><div><dt>Fallback</dt><dd>Not needed</dd></div></dl>
              <ResetDemoButton />
            </article>
            <article className={live.usable ? "mode-card mode-card--available" : "mode-card"}>
              <div className="mode-card-top">
                <span className="mode-radio" />
                <div><h3>Optional live AI</h3><p>{live.usable ? "Ready to run" : "Requires server setup"}</p></div>
                <span className={`connection-state connection-state--${live.usable ? "ready" : "offline"}`}>
                  {live.usable ? "Configured" : "Not configured"}
                </span>
              </div>
              <p>{live.reason}</p>
              <dl>
                <div><dt>Model</dt><dd>{live.model}</dd></div>
                <div><dt>Flag</dt><dd>{live.enabled ? "enabled" : "off"}</dd></div>
                <div><dt>Key</dt><dd>{live.keyPresent ? "present" : "absent"}</dd></div>
              </dl>
              {live.usable ? (
                <Link className="mode-cta" href="/experiments">Run a live plan in Experiments</Link>
              ) : null}
            </article>
          </div>
        </section>

        <section className="mode-section" aria-labelledby="workspace-title">
          <div className="memory-section-heading">
            <h2 id="workspace-title">Creator workspace</h2>
            <span>{identity.source}</span>
          </div>
          <p className="mode-intro">
            Everything the clipper reads and writes — channel memory, recorded results — is
            keyed on this id. Change it with <code>AFTERPLAY_CREATOR_ID</code>; switching
            accounts from the UI is not built yet.
          </p>
          <dl className="identity-grid">
            <div><dt>Display name</dt><dd>{identity.displayName}</dd></div>
            <div><dt>Clipper creator id</dt><dd><code>{identity.clipperCreatorId}</code></dd></div>
            <div><dt>Source</dt><dd>{identity.source}</dd></div>
          </dl>
        </section>

        <section className="connections-section" aria-labelledby="connections-title">
          <div className="memory-section-heading"><h2 id="connections-title">Data sources and actions</h2><span>OAuth is not configured</span></div>
          <div className="connection-list">
            {connections.map((connection) => (
              <article key={connection.name}>
                <span className={`connection-logo connection-logo--${connection.tone}`}>{connection.initial}</span>
                <div><h3>{connection.name}</h3><p>{connection.purpose}</p></div>
                <span className={`connection-state connection-state--${connection.tone}`}>{connection.state}</span>
                <span className="connection-scope">{connection.scope}</span>
                <LinkSimple />
              </article>
            ))}
          </div>
        </section>

        <section className="authority-section" aria-labelledby="authority-title">
          <div className="memory-section-heading"><h2 id="authority-title">Who can do what</h2><span>Unapproved actions are blocked</span></div>
          <div className="authority-table">
            <div className="authority-head"><span>Action</span><span>Decision owner</span><span>Rule</span><span>Status</span></div>
            {authority.map((row) => (
              <div className="authority-row" key={row.action}>
                <strong>{row.action}</strong><span>{row.owner}</span><span>{row.rule}</span>
                <span className={`authority-state authority-state--${row.state}`}>{row.state === "autonomous" ? <Check weight="bold" /> : <WarningCircle />}{row.state === "autonomous" ? "Allowed" : "Approval"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="simulation-callout">
          <span className="simulation-icon"><WarningCircle /></span>
          <div><h2>No posts leave Afterplay</h2><p>The distribution button writes local receipts with sample platforms and dates. It never signs into an account or publishes anything.</p></div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
