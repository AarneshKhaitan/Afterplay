# Afterplay — Implementation Phases

Companion to [PRD.md](./PRD.md). Gap IDs (`G1`…`G23`) refer to the PRD gap register.

The calendar-bound 19-22 August finals program is indexed in
[FINALS-PHASES.md](./FINALS-PHASES.md). Its executable workstream checklists live under
[`docs/finals/`](../finals/README.md).

Phases are ordered by **dependency and risk**, not by calendar. Each phase is independently
shippable and leaves the product in a coherent state.

**Rule for every phase:** no phase is done until its acceptance criteria have been
*executed*, not reasoned about. A claim without a command that reproduces it is not done.

| Phase | Theme | Gaps | Blocking? |
|---|---|---|---|
| 0 | Truth and submission integrity | G5, G13, G14, G15 | Implemented except G1 deliverables; evidence: [E-010](./EVIDENCE.md#e-010-install-path-correction), [E-012](./EVIDENCE.md#e-012-callback-status-contract), [E-013](./EVIDENCE.md#e-013-app-feedback-loop-typecheck) |
| 1 | Make the live path the demo | G2, G6, G19, G20, G23 | **Complete — all five closed.** G2/G6 on real creator VODs; G23 by ASR on caption-less gameplay ([E-025](./EVIDENCE.md#e-025-asr-backfill-on-a-caption-less-source)); G19/G20 by fault injection, not inspection ([E-026](./EVIDENCE.md#e-026-fault-injection-degraded-and-stale)); the callback status contract now reports what shipped rather than what was scored ([E-024](./EVIDENCE.md#e-024-callback-found-reflects-shipped-clips)). Evidence: [E-001](./EVIDENCE.md#e-001-single-video-live-run), [E-003](./EVIDENCE.md#e-003-negative-control-and-adversarial), [E-006](./EVIDENCE.md#e-006-callback-is-additive-not-a-gate), [E-011](./EVIDENCE.md#e-011-no-callback-valid-fallback), [E-012](./EVIDENCE.md#e-012-callback-status-contract), [E-013](./EVIDENCE.md#e-013-app-feedback-loop-typecheck) |
| 2 | Close the loop | G7 | **Complete.** Recorded results demonstrably re-rank a later run ([E-016](./EVIDENCE.md#e-016-ranking-feedback-changes-a-later-run)); pipeline clips are approved and dispatched with the curated package ([E-020](./EVIDENCE.md#e-020-pipeline-clips-in-the-approval-loop)); real analytics exports reach the priors ([E-021](./EVIDENCE.md#e-021-real-analytics-csv-into-the-ranking-priors)). Publishing itself remains G12. |
| 3 | Creator self-service ingestion | G8, G9, G10 | No |
| 4 | Editorial control | G11 | No |
| 5 | Publishing and real performance | G12, G10 | No |
| 6 | Production hardening | G16–G18, G21, G22 | No |

---

## Phase 0 — Truth and submission integrity

**Why first:** the repository currently contains statements that are false or that route a
judge away from the submission. This is the cheapest, highest-leverage work and it is pure
credibility.

### 0.1 Fix the service README — mostly done

`services/video-clipper/README.md`

- ~~Delete the external `git clone .../video-clipper-service-.git` and `cd
  video-clipper-service-` lines.~~ **Done** → PRD `FIX-9`. Install now starts from
  `cd services/video-clipper`.
- ~~Replace the unreproduced "Verified on real sources" table (`5/5 clips, 65s`,
  `3/3 clips, 130s`) and the "93 tests" count.~~ **Done** → PRD `FIX-10`. Replaced with
  measured runs, hardware stated, plus a re-measure warning; count corrected to 100
  passed / 1 skipped.
- **Still open:** add a section documenting channel memory (`backfill`, `--memory`, and the
  new `--local` / ASR path from 1.1). The service README currently has **zero** mentions of
  either, despite now containing the feature.

### 0.2 Rewrite the judge path to lead with the live capability (G5) — implemented

`README.md`

- The nine-step walkthrough currently covers only the fixture loop. Restructure so step 1
  is the callback flow: `backfill` → `run --memory` → open Studio → read the citation.
- Put the **actual commands** in Quick start. They currently live in
  `docs/submission/DEMO_CONTRACT.md`, `docs/demo/CALLBACK.md`,
  `docs/architecture/CLIPPER_INTEGRATION.md`, and `services/video-clipper/README.md` —
  four places, none of them the front page. Always give the full path; bare filenames
  invite the wrong guess.
- Add Python prerequisites (version, `pip install -r requirements.txt`, ffmpeg, `deno` per
  G18) alongside the Node prerequisites.
- Keep the fixture experiment loop as the **second** half; it demonstrates the authority
  model, which is a genuine strength.

### 0.3 Add the mode table (G13) — implemented

`README.md` and `docs/AI.md`. One table, three columns:

| Mode | What runs | What it needs | What is guaranteed |
|---|---|---|---|
| `demo` | deterministic fixture director; simulated distribution | nothing | repeatable, offline, no external calls |
| `live` | OpenAI strategy director | `AFTERPLAY_ENABLE_LIVE_AI=true` + `OPENAI_API_KEY` | real model output or a visible error — never fixture output |
| clipper | real ingestion, memory, detection, render | `OPENAI_API_KEY` + `AFTERPLAY_CLIPPER_MODEL` | genuine per-input computation |

State plainly that **demo-mode strategy is a fixture** and the **clipper is not**. Being
first to say it converts a weakness into a credibility signal.
Also record that callback scoring is additive: a valid stream can still return ranked clips when
callback evidence is absent.

### 0.4 Resolve model config drift (G14)

`.env` sets `AFTERPLAY_OPENAI_MODEL=gpt-4o-mini`; `docs/AI.md:30` documents `gpt-5.6-sol`.
Pick one, update both, and state the choice in the mode table.

### 0.5 Rewrite `tasks/todo.md` (G15) — implemented

Currently duplicated, contradictory, historical. Replace with current status only; move
history to an archive file if it has value.

### 0.6 Produce the deliverables (G1)

- ≤15-slide PDF: problem, target user, solution, AI contribution, expected impact,
  technical decisions, implementation. Map explicitly to 40/30/30.
- ≤5-minute demo video, following the Phase 0.2 judge path.
- Document the Drive handoff and private-repo collaborator process.
- Tick the boxes in `docs/submission/REQUIREMENTS.md` only once each artifact exists.

**Acceptance**

- No URL in the repo points at a different repository.
- Every performance number in any doc is reproducible on the demo machine, or absent.
- A reader following only `README.md` can install both halves and reach a rendered
  callback clip with a citation.
- Both deliverables exist.

---

## Phase 1 — Make the live path the demo

**Why:** the differentiator currently cannot be built on the content type being pitched.

### 1.1 ASR fallback in `backfill` (G2, G23) — DONE, verified on real caption-less gameplay ([E-025](./EVIDENCE.md#e-025-asr-backfill-on-a-caption-less-source))

`services/video-clipper/afterplay/cli.py`, `cmd_backfill`

Today it requires captions and errors out otherwise. The main `run` path already solves
this: fetch audio only, try `transcribe`, fall back to audio-energy. Reuse it.

- On no captions: `fetch_audio_only` → `asr.transcribe` → `to_vtt` → continue through the
  existing `parse_vtt` entry point, exactly as `Orchestrator.run` does.
- Persist the generated VTT in the job dir so the run is inspectable and re-runnable.
- If ASR weights are unavailable, fail with a **clear, actionable** message — do not fall
  through to "no captions" (G19).
- Add `faster-whisper` guidance to the setup docs; keep it optional but document that
  memory on caption-less sources depends on it.

### 1.2 Surface silent failures and no-callback state (G19) — DONE, fault-injected ([E-026](./EVIDENCE.md#e-026-fault-injection-degraded-and-stale))

`MemoryReasoner.rank` catches everything and degrades to heuristic, so a dead model id or
auth failure produces a successful-looking run containing zero callbacks.

Callbacks are additive and should never be treated as a gate for output.

- Precision-first callback reporting: if thread evidence is unavailable or confidence is low, the run
  must emit the no-callback outcome message, not a fabricated callback.

- Record degradation in the manifest (`memory: { degraded, reason, threads_considered, callback_found }`).
- Surface it in Studio as a visible notice rather than an absent feature.
- When there is no callback match for a stream, explicitly show:
  "No memory-dependent callback found in this run. Showing highest-quality standalone clips."
- Add a `doctor`-style preflight that makes one live model call and one embedding call and
  reports pass/fail before a long job starts.

### 1.3 Fail loudly on incomplete runs (G20) — DONE, fault-injected ([E-026](./EVIDENCE.md#e-026-fault-injection-degraded-and-stale))

A run that dies before writing `manifest.json` silently leaves the previous manifest
served. Write a `status.json` at job start and mark completion; have
`getLatestClipManifest` prefer completed jobs and expose staleness in the UI.

### 1.4 Demo reset

Add a documented command to clear the clipper workdir/memory for a clean run. The e2e
fixture already writes to an isolated temp dir (fixed), so this is for operator hygiene.

**Acceptance**

- `backfill` succeeds on a real caption-less gameplay VOD and produces threads.
- Detection then finds a genuine callback on that creator's later stream.
- A run with no callback still returns ranked clips with the explicit fallback outcome message.
- Killing the process mid-render leaves the UI showing a stale/incomplete state, not a
  silently wrong one.
- Revoking the API key produces a visible error, not an empty success.

---

## Phase 2 — Close the loop

**Why:** "learns what grows their audience" is currently unsupported. `getLatestClipManifest`
is referenced by three files; the Analyst never sees a clip (G7).

### 2.1 Manifest → experiment outputs — implemented

Project the latest complete manifest into `ExperimentOutput` when present, preserving
`provenance` and disclosure labelling. Fixture outputs remain the fallback for deterministic
tests and clean checkouts.

### 2.2 Clip-level results — implemented

Extend result recording to accept per-clip metrics keyed by `clip_id`, so the Analyst
reasons about *which clip* performed, not a single aggregate.

### 2.3 Feed outcomes back into ranking — DONE, ranking change demonstrated ([E-016](./EVIDENCE.md#e-016-ranking-feedback-changes-a-later-run))

`insights.py` already has `Analytics`, `record_post`, `compute_priors`, `ranking_hints`,
and applies priors to moments. Wire the app's recorded results into it so the next run's
ranking reflects real performance. **This is the "learning" claim, made true.**

### 2.4 Callback-aware strategy

When memory contains open threads, the Strategist should be able to propose an experiment
grounded in them ("this rivalry is unresolved; test a payoff cut"). Live mode only.

**Acceptance**

- Studio's approval package is generated from a real clipper run.
- Recording results changes the ranking of a subsequent run, demonstrably.
- The Analyst cites a specific clip.

---

## Phase 3 — Creator self-service ingestion

**Why:** R5. Today media enters only via CLI on the operator's machine (G8, G9, G10).

### 3.1 Job orchestration first

Prerequisite for everything else here: renders take minutes (1,907s observed on a real
VOD; ~89s on a short local source). A synchronous request cannot do this.

- Job queue with persisted state: `queued → resolving → understanding → rendering → qc → done/failed`.
- `POST /api/jobs` to enqueue, `GET /api/jobs/:id` to poll, progress surfaced in the UI.
- Workers invoke the existing Python CLI; do not reimplement the pipeline in TypeScript.

### 3.2 Upload

`POST /api/uploads` with multipart streaming to disk, size/type limits, and a rights
attestation checkbox recorded with the upload. Wire to the job queue via `--local`.

### 3.3 Channel connect

No channel enumeration exists today. Add a resolver that expands a channel URL or `@handle`
into a video list (`yt-dlp --flat-playlist`), lets the creator pick which streams form the
memory backfill set, and auto-assigns stable `stream_id`s instead of requiring manual flags.

### 3.4 OAuth and real analytics

- YouTube OAuth (read-only) for the creator's **own** channel.
- YouTube Analytics API for retention, returning viewers, traffic sources — replacing
  synthetic baselines with real ones.
- Store tokens encrypted; never in the repo; surface connection state in Integrations,
  which currently reads "OAuth is not configured".

**Acceptance**

- A creator uploads a file in the browser and receives clips without touching a terminal.
- A creator pastes a channel URL, selects streams, and memory is built for them.
- The Analyst's baseline comes from real analytics for a connected channel.

---

## Phase 4 — Editorial control

**Why:** R6. Studio is review-only (G11); a creator who disagrees with a cut can only reject it.

- Adjust in/out points against sentence boundaries (`snap()` already exists) and re-render.
- Edit caption text and style; re-render with the existing ASS pipeline.
- Reject-with-reason → regenerate an alternative cut for the same moment.
- Manual reframe override when face/saliency tracking picks wrong (observed drifting on
  gameplay — no faces, so saliency takes over).
- Record every edit as creator preference; feed into `CreatorMemory`, which already
  promotes repeated corrections into defaults.

**Acceptance**

- A creator changes a cut and gets a re-rendered clip that passes QC.
- Repeated corrections visibly change defaults for the next run.

---

## Phase 5 — Publishing and real performance

**Why:** R4/R5 end state. Approval currently yields simulated receipts (G12).

- Platform connectors (YouTube Shorts first) behind the **existing** approval gate. The
  authority model — revision-aware approval, fail-closed dispatch, idempotent receipts —
  is already built and verified; connectors slot in behind it.
- Idempotency keys so a retry cannot double-post.
- Scheduling.
- Post-publish metric ingestion on a cadence, feeding Phase 2.3.

**Acceptance**

- An approved clip posts to a real connected account, once, with a real receipt.
- A duplicate dispatch does not double-post.
- Published performance appears in the Analyst's next read.

---

## Phase 6 — Production hardening

### 6.1 Reframe performance (G16)

Measured **142s for one 41.7s 1080p60 clip** with zero contention. `vision.py:87` (face
pass) and `produce.py:126` (saliency pass) each open the clip and `cap.read()` every frame,
discarding all but every Nth — two full decodes.

- Downscale frames to ~320px before `_energy_columns`; edge energy does not need 1080p.
- Share one decode between the face and saliency passes.
- Re-measure and publish honest numbers (ties back to Phase 0.1).

### 6.2 Duration drift (G17)

Planned 30.0s, rendered 26.4–27.0s on every clip — systematic, currently only a `warn`.
Find the cause; either correct it or make the planned duration honest.

### 6.3 Ingestion environment (G18)

yt-dlp now warns that extraction without a JS runtime is deprecated. Install `deno` on
ingesting machines; document it; add it to `doctor`.

### 6.4 Durability and multi-tenancy (G21)

Replace seeded in-process state with a real store. Per-creator isolation for memory,
manifests, and media. Required before more than one creator uses it.

### 6.5 Media delivery (G22)

Add ETag/Last-Modified and sane caching to the media route; `no-store` is correct for a
demo and wasteful in production. Range support is already implemented and tested.

### 6.6 Observability

Structured logs, per-stage timings (the manifest already carries `timings`), token/cost
accounting per job, and QC pass-rate trends per creator.

---

## Cross-cutting: testing

Maintain the standard already set — the suites currently catch real defects.

- Every bug fixed gets a test that **fails without the fix**. Demonstrated for the
  click-blocking overlay: reverting the CSS turned the spec red on exactly that test.
- Keep the adversarial memory tests (no false positive, hallucinated id rejected, low
  confidence gated, outage degrades, cold start makes zero calls). These are the strongest
  credibility asset in the repo.
- Browser tests must never write into the real clipper workdir (already enforced via
  `AFTERPLAY_CLIPPER_WORKDIR` in `webServer.env`).
- Add coverage per phase: job lifecycle (3), edit→re-render (4), publish idempotency (5).
