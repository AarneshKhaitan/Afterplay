import { Check, LinkSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { ResetDemoButton } from "@/components/reset-demo-button";
import { WorkspaceShell } from "@/components/workspace-shell";

const connections = [
  { name: "YouTube", purpose: "Content and audience snapshots", state: "Sample data", scope: "Read-only", tone: "sample", initial: "YT" },
  { name: "Twitch", purpose: "Stream archive and chat", state: "Sample data", scope: "Read-only", tone: "sample", initial: "TW" },
  { name: "Distribution", purpose: "Approved publishing actions", state: "Simulation", scope: "Local only", tone: "simulated", initial: "DS" },
  { name: "OpenAI", purpose: "Live experiment planning", state: "Off", scope: "Server key required", tone: "offline", initial: "AI" },
];

const authority = [
  { action: "Research, diagnose, and plan", owner: "Afterplay", rule: "Runs inside the workspace", state: "autonomous" },
  { action: "Publish or schedule content", owner: "Creator", rule: "Approval required", state: "controlled" },
  { action: "Send outreach or accept terms", owner: "Creator", rule: "Approval required", state: "controlled" },
  { action: "Spend money or change access", owner: "Creator", rule: "Approval required", state: "controlled" },
];

export default function IntegrationsPage() {
  return (
    <WorkspaceShell active="Integrations" pageName="Integrations">
      <div className="surface integrations-surface">
        <section className="page-hero integrations-hero">
          <div>
            <h1>Connections and permissions</h1>
            <p>See what is connected, what is simulated, and which actions still need the creator.</p>
            <div className="hero-meta">
              <span className="status-chip status-chip--safe">Demo configuration</span>
              <span>2 sample sources</span>
              <span>No live writes</span>
            </div>
          </div>
        </section>

        <section className="mode-section" aria-labelledby="mode-title">
          <div className="memory-section-heading"><h2 id="mode-title">Strategy mode</h2><span>Current run: demo</span></div>
          <div className="mode-grid">
            <article className="mode-card mode-card--selected">
              <div className="mode-card-top"><span className="mode-radio mode-radio--selected"><span /></span><div><h3>Deterministic demo</h3><p>Selected</p></div><span className="connection-state connection-state--ready">Ready</span></div>
              <p>Uses the same validated proposal on every reset. No network call.</p>
              <dl><div><dt>Planner</dt><dd>Fixed sample</dd></div><div><dt>Network</dt><dd>Off</dd></div><div><dt>Fallback</dt><dd>Not needed</dd></div></dl>
              <ResetDemoButton />
            </article>
            <article className="mode-card">
              <div className="mode-card-top"><span className="mode-radio" /><div><h3>Optional live AI</h3><p>Requires server setup</p></div><span className="connection-state">Not configured</span></div>
              <p>Calls OpenAI to draft a plan, then checks the response against the same schema and evidence list. A failed call stays failed.</p>
              <dl><div><dt>Model</dt><dd>gpt-5.6-sol</dd></div><div><dt>Storage</dt><dd>store: false</dd></div><div><dt>Key</dt><dd>Server only</dd></div></dl>
            </article>
          </div>
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
