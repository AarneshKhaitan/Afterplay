# Afterplay

**The team behind the player.**

Afterplay is an autonomous growth team for gaming creators. It studies creator evidence, chooses a falsifiable growth experiment, prepares coordinated work, waits for creator approval before external action, reads the result, and changes the next plan.

This repository is a working end-to-end prototype for the Garena AI Build Challenge 2026. It is not a clipper with an AI sidebar: the central object is a growth experiment and the north star is returning audience behavior.

`diagnosis → hypothesis → plan → production → approval → simulated distribution → result → learning → next experiment`

## What works

- Six populated product areas: Growth HQ, Experiments, Studio, Audience, Memory, and Integrations.
- One complete stateful experiment loop for the fictional creator Mika Rao.
- Revision-aware approval and fail-closed external action gating.
- Idempotent simulated distribution receipts; no social platform is contacted.
- Labelled synthetic results, explicit limits, and no causal-growth claim.
- A deterministic offline strategy director and an optional live OpenAI director returning the same validated schema.
- A visible reset control for repeatable judge runs.
- Public HTTP, browser, production-mode, accessibility, and mobile-overflow tests.

## Quick start

Requirements: Node.js `>=20.9.0` and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No account, network connection, API key, or platform credential is required for the default demo.

For a production-shaped local run:

```bash
npm run build
npm run start
```

## Judge path

1. Start on **Growth HQ** and read “New viewers watch, but few come back.”
2. Open **One More Rule** and inspect evidence, confidence, alternatives, uncertainty, falsifier, plan, and success signal.
3. Select **Review 3 outputs** to enter Studio.
4. Review the premise cut, community cut, return prompt, rationale, and media provenance.
5. Select **Approve current revision**. The UI confirms that nothing has been posted.
6. Select **Run simulated distribution**. Three receipts appear, each labelled `SIMULATED`.
7. Open **View sample results**, then select **Load labelled sample results**.
8. Read the Analyst's evidence, limitations, and proposed **Name the Builder** experiment.
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

- [Product contract](docs/product/PRODUCT.md)
- [Demo workspace](docs/product/DEMO_WORKSPACE.md)
- [Design system](docs/design/DESIGN.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Clipper integration](docs/architecture/CLIPPER_INTEGRATION.md)
- [AI contract](docs/AI.md)
- [Problem evidence and competitor boundary](docs/research/PROBLEM_EVIDENCE.md)
- [Accepted public test seams](docs/testing/TEST-SEAMS.md)
- [Five-minute demo contract](docs/submission/DEMO_CONTRACT.md)
- [Challenge traceability](docs/submission/REQUIREMENTS.md)
- [Third-party and synthetic asset ledger](docs/THIRD_PARTY.md)
- [Image prompts](docs/assets/IMAGE_PROMPTS.md)
- [Architecture decisions](docs/decisions/)
