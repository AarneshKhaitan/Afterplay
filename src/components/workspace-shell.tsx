import {
  Broadcast,
  CirclesThreePlus,
  Database,
  Flask,
  House,
  LinkSimple,
  Crosshair,
  Scissors,
  Stack,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { DemoReplayToggle } from "@/components/demo-replay-toggle";
import { demoReplayEnabled } from "@/domain/demo-replay";

import { CreatorSwitcher } from "@/components/creator-switcher";
import { currentCreator, GUEST, listCreators } from "@/domain/creators";
import { liveAiState } from "@/domain/identity";
import { workspaceModeState, type WorkspaceModeState } from "@/domain/mode";

/** Navigation follows the actual workflow, not an alphabet of features.
 *
 * The pages existed as seven peers with no implied order, so nothing told a first-time
 * viewer where to start or what follows what. Grouping them into the loop the product
 * actually performs — research, make, learn — is what makes the demo read as one
 * system rather than a menu. */
const navigation: Array<{
  section: string;
  items: Array<{ label: string; href: string; icon: typeof House; hint?: string }>;
}> = [
  {
    section: "Overview",
    items: [{ label: "HQ", href: "/", icon: House, hint: "Where things stand" }],
  },
  {
    section: "1 · Decide",
    items: [
      { label: "Intel", href: "/intel", icon: Crosshair, hint: "What to make next" },
      { label: "Experiments", href: "/experiments", icon: Flask, hint: "The growth test" },
    ],
  },
  {
    section: "2 · Make",
    items: [
      { label: "Riff live", href: "/live", icon: Broadcast, hint: "Cohost the stream" },
      { label: "Riff board", href: "/riff-dashboard", icon: Broadcast, hint: "What Riff saw" },
      { label: "Ingest", href: "/ingest", icon: Scissors, hint: "Clip a stream" },
      { label: "Studio", href: "/studio", icon: Stack, hint: "Review and approve" },
    ],
  },
  {
    section: "3 · Learn",
    items: [
      { label: "Audience", href: "/audience", icon: UsersThree, hint: "What happened" },
      { label: "Memory", href: "/memory", icon: Database, hint: "What it remembers" },
    ],
  },
  {
    section: "Setup",
    items: [
      { label: "Setup", href: "/setup", icon: CirclesThreePlus, hint: "First-run guide" },
      { label: "Integrations", href: "/integrations", icon: LinkSimple, hint: "Keys and permissions" },
    ],
  },
];

export async function WorkspaceShell({
  active,
  pageName,
  children,
  dataNote,
  badge,
  modeState: suppliedModeState,
}: Readonly<{
  active: string;
  pageName: string;
  children: React.ReactNode;
  /** Overrides the truth footer. The default states that the workspace is synthetic,
   * which is correct for the seeded experiment loop and WRONG for surfaces built on real
   * scraped data — labelling real competitor numbers as sample data is as much a
   * truthfulness failure as the reverse. */
  dataNote?: string;
  /** Overrides the topbar badge, for the same reason. */
  badge?: string;
  /** Pages that branch on mode can pass the state they already resolved. */
  modeState?: WorkspaceModeState;
}>) {
  const [identity, modeState] = await Promise.all([
    currentCreator(),
    suppliedModeState ? Promise.resolve(suppliedModeState) : workspaceModeState(),
  ]);
  const creators = [...listCreators(), GUEST];
  const live = liveAiState();
  const pageDataNote = dataNote ?? (modeState.mode === "demo"
    ? "Demo workspace is active. Fixture-backed surfaces are labelled; real pipeline data remains identified separately."
    : "Live workspace is active. This page does not substitute demo fixtures when persisted data is unavailable.");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Afterplay home">
          <span className="brand-mark"><CirclesThreePlus weight="fill" /></span>
          <span>Afterplay</span>
        </Link>

        <CreatorSwitcher active={identity} creators={creators} />

        <nav className="product-nav" aria-label="Product">
          {navigation.map(({ section, items }) => (
            <div key={section} className="nav-group">
              <p className="nav-label">{section}</p>
              {items.map(({ label, href, icon: Icon, hint }) => (
                <Link key={label} href={href}
                  className={label === active ? "nav-link nav-link--active" : "nav-link"}>
                  <Icon aria-hidden="true" />
                  <span className="nav-text"><span>{label}</span>{/* Decorative: keeps each link's accessible name the label alone, so it stays
                        addressable as "Studio" rather than "Studio Review and approve". */}
                    {hint ? <small aria-hidden="true">{hint}</small> : null}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className={`mode-block mode-block--${modeState.mode}`}>
            <span className="mode-dot" aria-hidden="true" />
            <span>
              <strong>{modeState.mode === "live" ? "Live workspace" : "Demo workspace"}</strong>
              <small>{modeState.locked ? "Locked by environment" : "Selected workspace"}</small>
            </span>
          </div>
          <div className={`mode-block mode-block--${live.enabled ? "live" : "demo"}`}>
            <span className="mode-dot" aria-hidden="true" />
            <span>
              <strong>{live.enabled ? "Live AI enabled" : "Live AI disabled"}</strong>
              <small>{live.enabled ? live.model : "Live AI disabled"}</small>
            </span>
          </div>
          <details className="team-menu">
            <summary className="team-button"><Database weight="bold" /> Team notes</summary>
            <div className="team-popover">
              <strong>Notes shared by all four roles</strong>
              <p>See what the team knows, what changed, and what still needs approval.</p>
              <Link href="/memory">Open memory</Link>
            </div>
          </details>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">{pageName}</span>
            <span className="topbar-date">{identity.displayName}</span>
          </div>
          <div className="topbar-actions">
            <DemoReplayToggle initial={await demoReplayEnabled()} />
            <span className="sample-badge"><span /> {modeState.mode === "live" ? "Live workspace" : "Demo workspace"}</span>
            {badge ? <span className="sample-badge"><span /> {badge}</span> : null}
            <span className="updated">{live.enabled ? `Live AI · ${live.model}` : "Live AI off"}</span>
          </div>
        </header>
        {children}
        <footer className="truth-footer">
          <span>{modeState.mode === "live" ? "Live workspace" : "Demo workspace"}</span>
          <p>{pageDataNote}</p>
          <span>{modeState.locked ? "Mode locked" : "Mode visible"}</span>
        </footer>
      </main>
    </div>
  );
}
