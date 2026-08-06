# Accepted public test seams

Status: **accepted on 5 August 2026**

The user approved these seams with the instruction to set the build goal and proceed.

TDD will verify behavior only through these public boundaries. Internal components, private functions, repository shapes, and agent orchestration details are not direct test targets.

## Seam 1: Creator browser experience

Verify the judge-visible workflow through accessible content and user actions:

- Growth HQ communicates the diagnosis, active experiment, team activity, approval need, and returning-audience movement.
- The creator can inspect evidence, confidence, alternatives, and uncertainty.
- The creator can request a change, reject work, or approve current work.
- Approval changes the visible experiment and distribution state.
- Results produce a visible learning and next experiment.
- All six product areas are navigable and creator-specific without fixture-specific structure.

## Seam 2: Platform service contract

Verify the domain lifecycle through a public HTTP interface:

- retrieve workspace, baseline, team activity, and active experiment;
- record a current-revision decision;
- dispatch only approved external actions;
- accept labelled sample performance results;
- produce evidence-backed learning and the next experiment;
- reject malformed, stale, duplicate, or unauthorized transitions predictably.

## Seam 3: External adapter contract

Verify replaceable system boundaries without contacting real third parties:

- deterministic and live strategy directors return the same validated domain shape;
- live failures do not silently become fixture success;
- simulated distribution returns explicit sample receipts;
- no distribution call exists before approval;
- media provenance and simulation metadata travel with outputs.

## Testing posture

- Browser tests use accessible visible behavior, not hidden DOM fixtures.
- Service tests call the public HTTP contract, not private repositories.
- Only model, distribution, media, time, and randomness boundaries may be replaced in tests.
- Each capability is implemented as one red-green vertical slice.
