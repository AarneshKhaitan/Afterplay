"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Belief, IntelMemory, ScanJob } from "@/domain/intel/types";

import { LocalTime } from "./local-time";
import { MemoryView } from "./memory-view";
import { PackagingView } from "./packaging-view";
import { ReportView } from "./report-view";
import { ScanSetup } from "./scan-setup";
import { StrategistChat } from "./strategist-chat";
import { SwarmView } from "./swarm-view";
import { VideoExplorer } from "./video-explorer";

export type ScanHistoryRow = {
  scanId: string;
  status: string;
  startedAt: string;
  headline: string | null;
  videos: number;
};

type Tab = "overview" | "videos" | "packaging" | "memory" | "strategist";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "videos", label: "Video explorer" },
  { id: "packaging", label: "Packaging lab" },
  { id: "memory", label: "Memory" },
  { id: "strategist", label: "Strategist" },
];

export function IntelConsole({
  creatorId,
  initialScan,
  initialMemory,
  initialActiveBeliefs,
  history,
  scraperConfigured,
}: {
  creatorId: string;
  initialScan: ScanJob | null;
  initialMemory: IntelMemory;
  initialActiveBeliefs: Belief[];
  history: ScanHistoryRow[];
  scraperConfigured: boolean;
}) {
  const [scan, setScan] = useState<ScanJob | null>(initialScan);
  const [liveScan, setLiveScan] = useState<ScanJob | null>(null);
  const [memory, setMemory] = useState(initialMemory);
  const [active, setActive] = useState(initialActiveBeliefs);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(!initialScan);

  // Poll id lives in a ref so the effect can clear it without re-subscribing on every
  // tick, which would restart the interval and double the request rate.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshMemory = useCallback(async () => {
    try {
      const response = await fetch(`/api/intel/memory?creatorId=${encodeURIComponent(creatorId)}`);
      if (!response.ok) return;
      const body = await response.json();
      setMemory(body.memory);
      setActive(body.active);
    } catch {
      // A failed memory refresh must not disturb a completed scan on screen.
    }
  }, [creatorId]);

  const poll = useCallback(
    (scanId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/intel/scan/${scanId}`);
          if (!response.ok) return;
          const { scan: next } = (await response.json()) as { scan: ScanJob };
          setLiveScan(next);
          if (next.status === "complete" || next.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (next.status === "complete") {
              setScan(next);
              void refreshMemory();
              // Hold the finished swarm on screen briefly: it is the proof that the work
              // happened, and cutting to the report the instant the last agent lands
              // makes it look like nothing ran.
              setTimeout(() => setLiveScan(null), 2600);
            } else {
              setError(next.error?.message ?? "The scan failed.");
            }
          }
        } catch {
          /* transient; the next tick retries */
        }
      }, 1000);
    },
    [refreshMemory],
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startScan = useCallback(
    async (input: {
      ownChannel: string;
      competitors: string[];
      videosPerChannel: number;
      withTranscripts: boolean;
      sortVideosBy: "NEWEST" | "POPULAR";
    }) => {
      setError(null);
      try {
        const response = await fetch("/api/intel/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorId, ...input }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error?.message ?? "The scan could not be started.");
          return;
        }
        setSetupOpen(false);
        setLiveScan(body.scan);
        poll(body.scan.scanId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The scan could not be started.");
      }
    },
    [creatorId, poll],
  );

  const running = liveScan !== null;

  return (
    <div className="surface intel-surface">
      <section className="page-hero intel-hero">
        <div>
          <span className="intel-kicker">Competitive intelligence</span>
          <h1>The channel brain</h1>
          <p>
            Afterplay watches your competitors continuously, measures what actually moves their
            reach, and remembers what it learns so every scan sharpens the last one.
          </p>
          <div className="hero-meta">
            <span className="status-chip status-chip--review">
              {memory.totals.scans} {memory.totals.scans === 1 ? "scan" : "scans"} run
            </span>
            <span>{memory.totals.videosAnalyzed} videos analysed</span>
            <span>{memory.totals.transcriptsRead} transcripts read</span>
            <span>{active.length} standing beliefs</span>
          </div>
        </div>
        <div className="intel-hero-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => setSetupOpen((open) => !open)}
            disabled={running}
            aria-expanded={setupOpen}
          >
            {running ? "Scan running…" : scan ? "Run a new scan" : "Set up your first scan"}
          </button>
          {scan ? (
            <span className="intel-last-scan">
              Last scan <LocalTime value={scan.startedAt} /> · {scan.cost?.videosScraped ?? 0} videos
            </span>
          ) : null}
        </div>
      </section>

      {!scraperConfigured ? (
        <div className="manifest-alert manifest-alert--warning" role="alert">
          <div>
            <strong>Scraper not configured</strong>
            <span>
              APIFY_API_TOKEN is not set, so a competitive scan cannot run. No sample report is
              substituted in its place.
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="manifest-alert manifest-alert--warning" role="alert">
          <div>
            <strong>Scan failed</strong>
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {setupOpen ? (
        <ScanSetup onStart={startScan} disabled={running || !scraperConfigured} history={history} />
      ) : null}

      {liveScan ? <SwarmView scan={liveScan} /> : null}

      {scan && !liveScan ? (
        <>
          <nav className="intel-tabs" aria-label="Intelligence views">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={id === tab ? "intel-tab intel-tab--active" : "intel-tab"}
                onClick={() => setTab(id)}
                aria-current={id === tab ? "page" : undefined}
              >
                {label}
                {id === "memory" && active.length > 0 ? (
                  <span className="intel-tab-count">{active.length}</span>
                ) : null}
              </button>
            ))}
          </nav>

          {tab === "overview" ? <ReportView scan={scan} /> : null}
          {tab === "videos" ? <VideoExplorer scan={scan} /> : null}
          {tab === "packaging" ? <PackagingView scan={scan} /> : null}
          {tab === "memory" ? <MemoryView memory={memory} active={active} /> : null}
          {tab === "strategist" ? <StrategistChat creatorId={creatorId} scan={scan} memory={memory} /> : null}
        </>
      ) : null}

      {!scan && !liveScan && !setupOpen ? (
        <section className="results-empty">
          <h2>No scan has been run yet</h2>
          <p>Add your channel and up to five competitors to build the first intelligence picture.</p>
          <button type="button" className="primary-small" onClick={() => setSetupOpen(true)}>
            Set up a scan
          </button>
        </section>
      ) : null}
    </div>
  );
}
