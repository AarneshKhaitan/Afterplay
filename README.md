# Afterplay

**The team behind the player.**

Afterplay is an autonomous growth team for gaming creators. It studies creator history, finds moments whose meaning depends on prior streams, chooses a falsifiable growth experiment, prepares coordinated work, waits for creator approval before external action, reads the result, and changes the next plan.

This repository is a working end-to-end prototype for the Garena AI Build Challenge 2026. The clipper is part of the team: it can backfill creator memory, find callback/payoff moments, render shorts, and hand Studio a manifest with cited evidence. The central object remains a growth experiment and the north star is returning audience behavior.

Riff extends that loop into the live show. The audible AI cohost reads chat, receives bounded game snapshots from the desktop companion, and turns source-bearing moments into highlights, memory, and experiment evidence.

`diagnosis → hypothesis → plan → production → approval → simulated distribution → result → learning → next experiment`

## What works

- Six populated product areas: Growth HQ, Experiments, Studio, Audience, Memory, and Integrations.
- One complete stateful experiment loop for the fictional creator Mika Rao.
- Revision-aware approval and fail-closed external action gating.
- Idempotent simulated distribution receipts; no social platform is contacted.
- Labelled synthetic results, explicit limits, and no causal-growth claim.
- A deterministic offline strategy director and an optional live OpenAI director returning the same validated schema.
- A nested Python clipper service that can backfill channel memory, select callback-aware clips, render them, QC them, and write manifests consumed by Studio.
- A Riff desktop companion and OBS overlays for live cohosting, simulated-chat rehearsal, captions, and selected-window game context.
- A visible reset control for repeatable judge runs.
- Public HTTP, browser, production-mode, accessibility, and mobile-overflow tests.

## Quick start

Requirements: Node.js `>=20.9.0`, npm, Python `>=3.10`, and `ffmpeg` in PATH.

For real clipper runs, install Deno so yt-dlp can avoid extraction warnings:

```bash
deno --version
```

```bash
npm install
npm run dev
```

```powershell
cd services\video-clipper
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m afterplay.cli doctor
```

**Before any live run or demo, update yt-dlp:**

```powershell
.\.venv\Scripts\python -m pip install -U yt-dlp
```

YouTube changes how it signs media URLs every few weeks. A stale extractor still reads
metadata and captions perfectly, then gets `403` on the video itself -- which surfaces as
an ffmpeg exit code and reads like a render or network bug, not a dependency one. `doctor`
prints the installed version and flags it once it is over 30 days old.


Open [http://localhost:3000](http://localhost:3000). No account, network connection, API key, or platform credential is required for the default demo.

### Riff desktop companion

Riff's live voice path needs a server-side OpenAI key plus macOS microphone and screen-recording permission:

```bash
cp .env.example .env.local
# Set OPENAI_API_KEY outside git, then:
npm run companion:dev
```

The companion opens the local web service and lets the streamer select the game window Riff may inspect. OBS can capture the transparent overlay at [http://127.0.0.1:3100/overlay/riff](http://127.0.0.1:3100/overlay/riff). The deterministic rehearsal path remains available when a repeatable demo is more important than a live provider call; see [the Riff and OBS rehearsal guide](docs/submission/OBS_REHEARSAL.md).

For callback clip review, run the Python clipper from `services/video-clipper` first,
then refresh Studio. The web app intentionally reads the latest local manifest; it does
not launch long-running media jobs from the browser.

### Preferred live callback path

```powershell
cd services\video-clipper
$env:PYTHONPATH='.'
$env:AFTERPLAY_MEMORY="$PWD\.memory"
$env:OPENAI_API_KEY="<set outside git>"

# Seed memory from a source stream
python -m afterplay.cli backfill --creator demo --stream-id prior_001 --vtt path\to\prior.vtt

# Generate callback-aware clips from a current stream
python -m afterplay.cli --json run --memory --creator demo --local path\to\current.mp4 --vtt path\to\current.vtt --clips 3 --platforms shorts
```

If memory is healthy but no callback is found, this is a valid outcome:
`No memory-dependent callback found in this run. Showing highest-quality standalone clips.`

If memory fails (`memory_degraded: true`), the result must show an explicit failure reason and must not appear as this valid no-callback fallback message.

### Fixture path (offline)

The repository still includes the deterministic fixture loop for interviews and test stability when external keys/services are unavailable.

- No credentials are required for fixture mode.
- `AFTERPLAY_OPENAI_MODEL` drives the live strategy director.
- `AFTERPLAY_CLIPPER_MODEL` drives clip extraction/selection in the Python service.

For a production-shaped local run:

```bash
npm run build
npm run start
```

## Modes and guarantees

| Mode | What runs | What it needs | What is guaranteed |
|---|---|---|---|
| `demo` | deterministic fixture director | none | repeatable, offline, no external calls |
| `live` | OpenAI strategy director | `AFTERPLAY_ENABLE_LIVE_AI=true` + `OPENAI_API_KEY` | real strategy output or visible error — never fixture output |
| `riff-live` | OpenAI Realtime cohost + selected-window snapshots | `OPENAI_API_KEY` + microphone/screen permission | live audio/image context or visible failure — never synthetic fallback |
| `clipper` | real ingestion, memory, callback scoring, render | `OPENAI_API_KEY` + `AFTERPLAY_CLIPPER_MODEL` | genuine per-input computed clips |

State plainly that demo-mode strategy is a fixture while clipper output is real.

Simulated distribution and labelled synthetic results run in every workspace, live included; only resetting the demo workspace (`POST /api/demo/reset`) stays demo-gated. Honesty comes from the payload, not the mode: results must declare the literal `disclosure: "synthetic_sample_data"`.

## Judge path

1. From `services/video-clipper`, run `backfill` on a prior creator-owned stream.
2. Run `afterplay.cli --json run --memory --creator <id>` on the current stream.
3. Open **Studio** and review the latest service manifest, callback citation, or explicit no-callback/degraded state.
4. Review the projected approval package. When a complete manifest exists, these outputs are pipeline-produced; otherwise the deterministic fixture package is shown.
5. Select **Approve current revision**. The UI confirms that nothing has been posted.
6. Select **Run simulated distribution**. Three receipts appear, each labelled `SIMULATED`.
7. Open **View sample results**, then select **Load labelled sample results**.
8. Read the Analyst's evidence, limitations, per-clip result note when present, and proposed **Name the Builder** experiment.
9. Return to Afterplay home. HQ now shows **Experiment 04 learned** and carries the next experiment forward.

To replay, open **Integrations → Reset demo workspace**.

## AI modes

Demo mode is selected by default. It is deterministic, schema-validated, offline, and never contacts OpenAI.

Optional live planning is disabled unless both server conditions are present:

```bash
cp .env.example .env.local
```

Then set:

```text
AFTERPLAY_ENABLE_LIVE_AI=true
OPENAI_API_KEY=your_server_only_key
AFTERPLAY_OPENAI_MODEL=gpt-5.6-sol
```

Live mode is exposed through `POST /api/strategy/plan` with `mode: "live"`. It uses the OpenAI Responses API, strict Structured Outputs, `store: false`, medium reasoning effort, a hashed safety identifier, and domain validation. If live mode is unavailable or fails, the API returns a visible error and does **not** substitute the demo proposal.

The judge workflow deliberately stays in deterministic mode.

The nested clipper service uses a separate model variable for callback extraction and
judging, so clipper experiments do not silently change the app's strategy director:

```text
AFTERPLAY_CLIPPER_MODEL=gpt-5.6-sol
```

## Verification

```bash
npm run typecheck
npm run lint
npm run test:e2e
npm run build
npx playwright test tests/e2e/judge-loop.spec.ts --config playwright.production.config.ts
```

The E2E suite verifies:

- visible product understanding and all six routes;
- approval, stale-revision, idempotency, and distribution guards;
- the complete browser loop and its learned HQ state;
- deterministic/live strategy adapter boundaries;
- WCAG A/AA automated checks and 390px horizontal overflow;
- visible demo reset.

## Architecture

- `src/domain/` owns lifecycle legality, revisions, decisions, receipts, results, and learning.
- `src/ai/` owns the shared strategy schema and deterministic/live directors.
- `src/app/api/` exposes the public HTTP seam.
- `src/components/` contains the shared product shell and stateful creator controls.
- `src/app/` contains the six product projections.
- `tests/e2e/` verifies only public HTTP and visible browser behavior.

The prototype uses seeded in-process state. It is ideal for a deterministic single-process judge run, but is not durable, multi-instance, or production multi-tenant storage.

## Truth boundary

- Mika Rao, Rivetfall, creator history, analytics, audience movement, and results are synthetic samples.
- The generated images are project-owned fixtures and are disclosed with hashes and prompts.
- Distribution creates local sample receipts only.
- The prototype does not perform real OAuth, publishing, outreach, spending, or account mutation.
- One sample run does not prove causality or guarantee creator growth.
- Cross-platform identity is not inferred.

## Documentation map

- [Competitive intelligence engine](docs/intel/INTELLIGENCE.md) — the `/intel` console: what is real, what is not, what is hardcoded
- [Product requirements](docs/prd/PRD.md) — verified current state, full gap register, requirements
- [Implementation phases](docs/prd/IMPLEMENTATION-PHASES.md) — what gets built when, with acceptance criteria
- [Product contract](docs/product/PRODUCT.md)
- [Demo workspace](docs/product/DEMO_WORKSPACE.md)
- [Design system](docs/design/DESIGN.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Clipper integration](docs/architecture/CLIPPER_INTEGRATION.md)
- [AI contract](docs/AI.md)
- [Problem evidence and competitor boundary](docs/research/PROBLEM_EVIDENCE.md)
- [Accepted public test seams](docs/testing/TEST-SEAMS.md)
- [Five-minute demo contract](docs/submission/DEMO_CONTRACT.md)
- [Riff and OBS rehearsal](docs/submission/OBS_REHEARSAL.md)
- [Challenge traceability](docs/submission/REQUIREMENTS.md)
- [Third-party and synthetic asset ledger](docs/THIRD_PARTY.md)
- [Image prompts](docs/assets/IMAGE_PROMPTS.md)
- [Architecture decisions](docs/decisions/)
