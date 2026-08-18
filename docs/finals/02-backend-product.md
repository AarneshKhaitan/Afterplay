# Workstream 2: Backend And Product

Accountable owner: Product/Backend lead

Phases: F4, F6

## Outcome

Make the live path durable, creator-scoped, failure-legible, and coherent across the product
surface. Consume the shared provenance and ablation contracts without redefining them.

## Preconditions

- [ ] Freeze creator-scope, source-provenance, verified-mention, and ablation contracts.
- [ ] Read the relevant Next.js guides under `node_modules/next/dist/docs/` before changing Next
      application code.
- [ ] Capture a clean baseline for typecheck, lint, build, E2E, accessibility, and 390px overflow.

## Deliverables

### B1. Close creator isolation gaps

- [ ] Reject an Intel `scanId` that does not belong to the requesting creator.
- [ ] Make creator identity use one resolver instead of divergent fixture fallbacks.
- [ ] Add creator identity to manifests and experiment state where required by the shared
      contract.
- [ ] Ensure creator switching changes manifests, experiments, memory, Intel data, and strategy
      context together.
- [ ] Disable the switcher for the finale if complete scoping cannot be proven.

Expected files:

- `src/app/api/intel/ask/route.ts`
- `src/domain/creators.ts`
- `src/domain/identity.ts`
- `src/domain/clip-manifest.ts`
- `src/domain/experiment.ts`
- `src/components/creator-switcher.tsx`
- `src/components/workspace-shell.tsx`

### B2. Persist experiment state

- [ ] Extract shared JSON persistence helpers into `src/domain/persist.ts`.
- [ ] Load experiment state from disk on cache miss.
- [ ] Persist decisions, dispatches, results, resets, learning, and next experiments.
- [ ] Make the persistence root environment-configurable for isolated tests.
- [ ] Verify state survives both a production restart and a development recompile.

### B3. Fix atomic writes

- [ ] Replace PID-only temporary names with a unique per-write name.
- [ ] Retry a failed rename once for the known Windows race.
- [ ] Use the corrected helper for Intel and experiment writes.
- [ ] Prove two same-process concurrent writes cannot collide.

### B4. Make ingest state trustworthy

- [ ] Emit structured progress from Python and keep log-regex parsing only as a fallback.
- [ ] Render stages immediately when a job starts.
- [ ] Retain the process handle required for cancellation and add a stop endpoint.
- [ ] Produce an explicit cancelled terminal state.
- [ ] Surface polling and network errors instead of swallowing them.
- [ ] Mark progress updates with `aria-live`.
- [ ] Test start, progress, failure, cancellation, and dropped-poll behavior.

Expected files:

- `src/domain/ingest/jobs.ts`
- `src/components/ingest/ingest-console.tsx`
- `src/app/api/ingest/`
- Python status/progress writer

### B5. Harden demo resources

- [ ] Pre-warm or explicitly replay Intel cache entries used on stage.
- [ ] Pre-warm captions, metadata, and local media for every prepared demo source.
- [ ] Add a preflight that verifies local assets and the required OpenAI calls without exposing
      secrets.
- [ ] Cache creator listing briefly instead of synchronously rereading every memory file twice per
      render.
- [ ] Keep arbitrary judge-provided URLs outside the promise unless tested separately.

### B6. Project truthful evidence in Studio

- [ ] Extend `clip-manifest.ts` to validate verified citations, explicit footage rights, source
      language provenance, creator identity, and ablation output.
- [ ] Reject unknown rights values; do not infer rights from URL or creator id.
- [ ] Project explicit rights into experiment outputs.
- [ ] Extract the inline callback evidence markup into `evidence-card.tsx`.
- [ ] Show verified source, quote, time, memory contribution, and rank change.
- [ ] Never render an unverified mention as a receipt or let it appear to support a decision.
- [ ] Preserve play-control hit targets and existing callback-manifest behavior.

### B7. Make the product coherent off the happy path

- [ ] Replace fabricated Memory beliefs/events with file-backed data and a designed cold state.
- [ ] Remove debug creator ids from visible product identity.
- [ ] Add explicit empty, loading, stale, degraded, no-callback, cancelled, and failed states.
- [ ] Add workspace creation only after creator scoping is complete.
- [ ] Require a display name without editing a source-code constant.

### B8. Consolidate the Afterplay design system

- [ ] Limit global CSS changes to the Afterplay region unless a shared-token change is reviewed
      with the Riff owner.
- [ ] Add spacing, weight, shadow, duration, and z-index tokens.
- [ ] Consolidate repeated cards, chips, section headings, and spinner keyframes.
- [ ] Complete reduced-motion coverage.
- [ ] Verify desktop and 390px layouts, focus states, text fit, and no overlay collisions.

## Handoffs

- **From AI/Data:** versioned Python manifest fixtures for verified citations, provenance, and
  ablation.
- **To Intel/Integration:** creator-isolation helper and shared persistence primitives.
- **To Demo/QA:** stable routes, preflight command, failure behaviors, and stage-ready screenshots.

## Acceptance

- [ ] Cross-creator Intel access is rejected.
- [ ] Approval through learning survives restart.
- [ ] Concurrent writes complete without `EPERM`.
- [ ] Ingest cancellation reaches the correct terminal state.
- [ ] Poll failure is visible and recoverable.
- [ ] Creator switching changes every dependent artifact or is disabled.
- [ ] Every Studio evidence card is backed by a verified manifest receipt.
- [ ] New workspace creation is available only if end-to-end creator scoping passes.
- [ ] Typecheck, lint, build, E2E, accessibility, and responsive checks pass.

## Demo Evidence

Provide Demo/QA with:

- A restart-survival recording or reproducible script.
- A cancellation and poll-failure drill.
- The cached-source inventory and preflight output.
- Desktop and mobile screenshots of Studio, Memory, Intel, and cold/failure states.

