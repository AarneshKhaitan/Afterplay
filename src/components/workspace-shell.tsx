import {
  CaretDown,
  CirclesThreePlus,
  Database,
  Flask,
  House,
  LinkSimple,
  Crosshair,
  Stack,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { demoWorkspace } from "@/domain/workspace";

const navigation = [
  { label: "HQ", href: "/", icon: House },
  { label: "Intel", href: "/intel", icon: Crosshair },
  { label: "Experiments", href: "/experiments", icon: Flask },
  { label: "Studio", href: "/studio", icon: Stack },
  { label: "Audience", href: "/audience", icon: UsersThree },
  { label: "Memory", href: "/memory", icon: Database },
  { label: "Integrations", href: "/integrations", icon: LinkSimple },
];

export function WorkspaceShell({
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
  const { creator } = demoWorkspace.workspace;

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
            <span className="creator-copy"><strong>{creator.displayName}</strong><small>@{creator.handle}</small></span>
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
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link key={label} href={href} className={label === active ? "nav-link nav-link--active" : "nav-link"}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {label === "Studio" && <span className="nav-count" aria-hidden="true">3</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="mode-block"><span className="mode-dot" aria-hidden="true" /><span><strong>Demo mode</strong><small>No live actions</small></span></div>
          <details className="team-menu">
            <summary className="team-button"><Database weight="bold" /> Team notes</summary>
            <div className="team-popover"><strong>Notes shared by all four roles</strong><p>See what the team knows, what changed, and what still needs Mika’s approval.</p><Link href="/memory">Open memory</Link></div>
          </details>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div><span className="topbar-kicker">{pageName}</span><span className="topbar-date">Mika Rao · One More Rule</span></div>
          <div className="topbar-actions"><span className="sample-badge"><span /> {badge ?? "Sample workspace"}</span><span className="updated">Demo snapshot · 09:40</span></div>
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
