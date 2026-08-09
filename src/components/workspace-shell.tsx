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

import { CreatorSwitcher } from "@/components/creator-switcher";
import { currentCreator, GUEST, listCreators } from "@/domain/creators";
import { liveAiState } from "@/domain/identity";

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
    items: [{ label: "Integrations", href: "/integrations", icon: LinkSimple, hint: "Keys and permissions" }],
  },
];

export async function WorkspaceShell({
  active,
  pageName,
  children,
  dataNote,
  badge,
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
}>) {
  const identity = await currentCreator();
  const creators = [...listCreators(), GUEST];
  const live = liveAiState();

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
          <div className={`mode-block mode-block--${live.enabled ? "live" : "demo"}`}>
            <span className="mode-dot" aria-hidden="true" />
            <span>
              <strong>{live.enabled ? "Live AI enabled" : "Demo mode"}</strong>
              <small>{live.enabled ? live.model : "No live actions"}</small>
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
            <span className="sample-badge"><span /> {badge ?? "Sample workspace"}</span>
            <span className="updated">{live.enabled ? `Live · ${live.model}` : "Demo snapshot"}</span>
          </div>
        </header>
        {children}
        <footer className="truth-footer">
          <span>{dataNote ? "Live data" : "Demo mode"}</span>
          <p>
            {dataNote ??
              "This workspace contains synthetic sample data. Distribution and elapsed-time results are simulated."}
          </p>
          <time dateTime="2026-08-05">Snapshot 05 Aug 2026</time>
        </footer>
      </main>
    </div>
  );
}
