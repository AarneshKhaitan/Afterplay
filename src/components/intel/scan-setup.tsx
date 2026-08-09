"use client";

import { Crosshair, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";

import type { ScanHistoryRow } from "./intel-console";
import { LocalTime } from "./local-time";

/** Suggested competitor sets.
 *
 * HARDCODED (documented in docs/intel/INTELLIGENCE.md): these are convenience presets so
 * a demo does not begin with someone typing six handles. They are only prefill values —
 * every handle is scraped live, and typing your own gives an identical result path.
 */
const PRESETS: Array<{ label: string; own: string; rivals: string[] }> = [
  {
    label: "FPS / Battlefield",
    own: "@jackfrags",
    rivals: ["@LevelCapGaming", "@Stodeh", "@Flakes"],
  },
  {
    label: "Physics sandbox",
    own: "@RealCivilEngineer",
    rivals: ["@Blitz", "@ReidCaptain"],
  },
  {
    label: "Variety / reaction",
    own: "@Jerma985",
    rivals: ["@Vinesauce", "@DougDoug"],
  },
];

export function ScanSetup({
  onStart,
  disabled,
  history,
}: {
  onStart: (input: {
    ownChannel: string;
    competitors: string[];
    videosPerChannel: number;
    withTranscripts: boolean;
    sortVideosBy: "NEWEST" | "POPULAR";
  }) => void;
  disabled: boolean;
  history: ScanHistoryRow[];
}) {
  const [own, setOwn] = useState("@jackfrags");
  const [rivals, setRivals] = useState<string[]>(["@LevelCapGaming", "@Stodeh"]);
  const [videosPerChannel, setVideosPerChannel] = useState(8);
  const [withTranscripts, setWithTranscripts] = useState(true);
  const [sortVideosBy, setSortVideosBy] = useState<"NEWEST" | "POPULAR">("NEWEST");

  const channelCount = 1 + rivals.filter((r) => r.trim()).length;
  const totalVideos = channelCount * videosPerChannel;
  // Mirrors USD_PER_RESULT in domain/intel/apify.ts. Shown so the operator always knows
  // what a scan costs before spending it — a scan that quietly bills is a scan people
  // stop trusting.
  const estimate = (totalVideos * 0.005).toFixed(2);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!own.trim()) return;
    onStart({
      ownChannel: own.trim(),
      competitors: rivals.map((r) => r.trim()).filter(Boolean),
      videosPerChannel,
      withTranscripts,
      sortVideosBy,
    });
  }

  return (
    <section className="scan-setup" aria-labelledby="scan-setup-title">
      <div className="scan-setup-head">
        <div>
          <h2 id="scan-setup-title">Configure the scan</h2>
          <p>
            Your channel is compared against up to five competitors. Handles, @names and full URLs
            all work.
          </p>
        </div>
        <div className="preset-row" role="group" aria-label="Presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="preset-chip"
              onClick={() => {
                setOwn(preset.own);
                setRivals(preset.rivals);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <form className="scan-form" onSubmit={submit}>
        <div className="scan-field scan-field--own">
          <label htmlFor="own-channel">Your channel</label>
          <input
            id="own-channel"
            value={own}
            onChange={(event) => setOwn(event.target.value)}
            placeholder="@yourchannel"
            required
            autoComplete="off"
          />
        </div>

        <fieldset className="scan-rivals">
          <legend>Competitors ({rivals.length}/5)</legend>
          {rivals.map((rival, index) => (
            <div className="scan-rival-row" key={index}>
              <input
                value={rival}
                onChange={(event) =>
                  setRivals((current) => current.map((r, i) => (i === index ? event.target.value : r)))
                }
                placeholder="@competitor"
                aria-label={`Competitor ${index + 1}`}
                autoComplete="off"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setRivals((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove competitor ${index + 1}`}
              >
                <Trash />
              </button>
            </div>
          ))}
          {rivals.length < 5 ? (
            <button
              type="button"
              className="secondary-button scan-add"
              onClick={() => setRivals((current) => [...current, ""])}
            >
              <Plus weight="bold" /> Add competitor
            </button>
          ) : null}
        </fieldset>

        <div className="scan-options">
          <div className="scan-field">
            <label htmlFor="videos-per-channel">Videos per channel</label>
            <input
              id="videos-per-channel"
              type="range"
              min={3}
              max={25}
              value={videosPerChannel}
              onChange={(event) => setVideosPerChannel(Number(event.target.value))}
            />
            <span className="scan-range-value">{videosPerChannel}</span>
          </div>

          <label className="scan-toggle">
            <input
              type="checkbox"
              checked={withTranscripts}
              onChange={(event) => setWithTranscripts(event.target.checked)}
            />
            <span>
              <strong>Read transcripts</strong>
              <small>Pulls captions so the analysis reads what was actually said, not just titles.</small>
            </span>
          </label>
        </div>

        <fieldset className="scan-sampling">
          <legend>Which videos to sample</legend>
          <div className="sampling-options">
            <label className={sortVideosBy === "NEWEST" ? "sampling-option sampling-option--on" : "sampling-option"}>
              <input
                type="radio"
                name="sampling"
                checked={sortVideosBy === "NEWEST"}
                onChange={() => setSortVideosBy("NEWEST")}
              />
              <span>
                <strong>Most recent</strong>
                <small>
                  What they are doing now. A contiguous window, so posting cadence and
                  recency are real measurements.
                </small>
              </span>
            </label>
            <label className={sortVideosBy === "POPULAR" ? "sampling-option sampling-option--on" : "sampling-option"}>
              <input
                type="radio"
                name="sampling"
                checked={sortVideosBy === "POPULAR"}
                onChange={() => setSortVideosBy("POPULAR")}
              />
              <span>
                <strong>All-time best</strong>
                <small>
                  What broke out for them ever. Spans years, so cadence is not measurable
                  and is reported as unknown rather than guessed.
                </small>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="scan-submit-row">
          <div className="scan-estimate">
            <span>
              {channelCount} channels · {totalVideos} videos
            </span>
            <strong>~${estimate} scrape cost</strong>
            <small>Identical scans within 24h are served from cache and cost nothing.</small>
          </div>
          <button type="submit" className="primary-action" disabled={disabled || !own.trim()}>
            <Crosshair weight="bold" /> Launch scan
          </button>
        </div>
      </form>

      {history.length > 0 ? (
        <div className="scan-history">
          <h3>Previous scans</h3>
          <ul>
            {history.slice(0, 5).map((row) => (
              <li key={row.scanId}>
                <span className={`scan-history-dot scan-history-dot--${row.status}`} aria-hidden="true" />
                <LocalTime value={row.startedAt} />
                <span className="scan-history-headline">{row.headline ?? row.status}</span>
                <span className="scan-history-count">{row.videos} videos</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
