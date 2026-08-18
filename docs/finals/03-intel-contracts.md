# Workstream 3: Intel And Contracts

Accountable owner: Intel/Integration lead

Phases: F5, F7

## Outcome

Make competitive intelligence internally honest, feed source-bearing evidence into strategy,
and define the Afterplay/Riff handoff without claiming an integration that has not run.

The cross-creator `scanId` bug belongs to F4 and is implemented by Product/Backend. This
workstream verifies that fix but does not own a duplicate implementation.

## Preconditions

- [ ] Receive the creator-isolation contract and persistence helper from Product/Backend.
- [ ] Receive stable verified-thread identifiers from AI/Data.
- [ ] Freeze the versioned Riff evidence-packet contract with the Riff owner.

## Deliverables

### I1. Correct Intel belief evolution

- [ ] Decay a belief only when a later scan covered the channels that supported it.
- [ ] Prevent a different competitor set from decaying unrelated beliefs.
- [ ] Implement contradiction evidence or remove the unreachable contradicted state and claim.
- [ ] Add tests for same-scope decay, different-scope preservation, and contradiction behavior.

Expected files:

- `src/domain/intel/memory.ts`
- `src/components/intel/memory-view.tsx`
- `src/domain/intel/pipeline.ts`
- Intel E2E/unit tests

### I2. Make feature claims match their detectors

- [ ] Stop `CHALLENGE` matching generic bare words such as `but` and `only`, or rename the
      feature to its actual meaning.
- [ ] Prevent acronym-only titles such as FPS/GTA/COD from being treated as title shouting, or
      rename the feature.
- [ ] Add positive and adversarial detector tests.

### I3. Surface small-sample uncertainty

- [ ] Display sample count beside hit rate, volatility, median views, and direction.
- [ ] Soften recommendation language when the sample is too small.
- [ ] Make failed scans legible and keep them out of the prepared demo path.
- [ ] Preserve provenance from scraped records to every displayed recommendation.

### I4. Ground strategy in real evidence

- [ ] Extend strategy input with id-addressable active beliefs and verified threads.
- [ ] Assemble strategy evidence server-side; never trust client-supplied evidence bodies.
- [ ] Preserve evidence-id validation.
- [ ] Keep the deterministic demo strategy fixture stable for existing tests.
- [ ] Require a live proposal to cite an evidence item that exists on disk.

Expected files:

- `src/ai/strategy.ts`
- `src/app/api/strategy/plan/route.ts`
- `src/domain/intel/agent.ts`
- Strategy tests

### I5. Turn recommendations into experiments

- [ ] Add a clear action from an Intel recommendation to a prefilled experiment proposal.
- [ ] Carry creator id, source recommendation id, evidence references, and proposed metric.
- [ ] Keep approval mandatory before dispatch.
- [ ] Return to Intel with the created experiment id so the relationship is inspectable.

### I6. Define the Riff evidence contract

- [ ] Write a versioned contract for a completed live session containing highlights, source
      evidence, decisions, and a proposed next experiment.
- [ ] Define idempotency, creator identity, timestamps, and rejection behavior.
- [ ] Provide a fixture that Afterplay can validate without importing or editing Riff code.
- [ ] Build the receiving endpoint only if the Riff owner commits to calling it.
- [ ] If implemented, prove one complete Riff-to-Afterplay handoff before changing any pitch
      claim.
- [ ] If not implemented, document the contract as the boundary and keep the integration claim
      out of the demo.

Riff-owned files remain out of scope:

- `src/components/riff-*.tsx`
- `src/components/chat-feed-overlay.tsx`
- `src/app/live/`, `src/app/companion/`, `src/app/overlay/`
- `src/app/api/live/`, `src/app/api/realtime/`
- `src/domain/live-session.ts`
- `src/ai/cohost.ts`
- `electron/`

## Handoffs

- **From Product/Backend:** creator-scope enforcement and corrected atomic persistence.
- **From AI/Data:** verified threads and source-bearing citation identifiers.
- **To Product/Backend:** strategy and recommendation payloads for UI projection.
- **To Demo/QA:** truthful Intel deltas, one evidence-grounded strategy result, and the exact Riff
  integration status.

## Acceptance

- [ ] A different competitor set does not decay unrelated beliefs.
- [ ] Contradicted is either reachable with evidence or absent from the product and copy.
- [ ] Feature detectors pass positive and adversarial cases.
- [ ] Low-sample outputs display `n` and bounded language.
- [ ] A live strategy proposal cites a real belief or verified thread on disk.
- [ ] An Intel recommendation creates a creator-scoped, evidence-bearing proposal.
- [ ] The Riff contract is versioned and agreed with the Riff owner.
- [ ] No doc or screen claims a completed Riff feedback loop unless the end-to-end test passes.

## Demo Evidence

Provide Demo/QA with:

- One corrected belief-delta example.
- One low-sample example with bounded copy.
- One strategy proposal and the exact source records it cites.
- The Riff contract version and a binary statement: integrated and proven, or contract-only.

