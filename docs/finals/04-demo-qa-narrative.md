# Workstream 4: Demo, QA, And Narrative

Accountable owner: Demo/QA lead

Phase: F8

Release responsibility: integration verification across F1-F9

## Outcome

Turn the implemented work into one truthful, rehearsed finals experience with an offline-safe
fallback. This workstream does not manufacture demo data or change technical results to fit the
story.

## Preconditions

- [ ] Capture the current test baseline before merges begin.
- [ ] Agree on two daily merge windows with the integration owner.
- [ ] Obtain three distinct permissions for the second creator: footage use, public naming, and
      quote/appearance.
- [ ] Keep private contact information outside the repository.

## Deliverables

### D1. Maintain one truthful claim ledger

- [ ] Map every slide and stage sentence to a current build artifact, test, source, or explicitly
      labelled future item.
- [ ] Remove claims that competitors are stateless by architecture or incapable of adding
      memory.
- [ ] Use the approved category boundary:

> Most creator tools optimize each upload independently. Afterplay is designed to accumulate
> channel history and use that history directly in future decisions.

- [ ] Describe the ablation as the identical Afterplay pipeline with memory disabled and enabled.
- [ ] Say memory contributed to this measured decision; do not call memory-off a competitor.
- [ ] Keep returning-viewer optimization, publishing, real analytics, one physical shared memory,
      and Riff feedback out of current-state claims unless implemented and proven.

### D2. Reconcile the product narrative

- [ ] Produce one finals runbook covering Afterplay and the Riff handoff.
- [ ] Keep Riff as the teammate-owned AI cohost track and Intel as a first-class subsystem.
- [ ] State the exact handoff status: proven integration or contract-only.
- [ ] Reconcile README, PRD, product docs, submission requirements, demo contract, and evidence
      ledger with the frozen build.
- [ ] Correct stale product-area counts, API-key requirements, paths, and submission assets.
- [ ] Update `tasks/todo.md` and `docs/prd/EVIDENCE.md` only with verified results.

Expected files:

- `README.md`
- `docs/product/PRODUCT.md`
- `docs/prd/PRD.md`
- `docs/prd/EVIDENCE.md`
- `docs/research/PROBLEM_EVIDENCE.md`
- `docs/submission/DEMO_CONTRACT.md`
- `docs/submission/REQUIREMENTS.md`
- `docs/demo/CALLBACK.md`

### D3. Own second-creator permissions and problem evidence

- [ ] Record footage-use permission without private contact details.
- [ ] Record permission to name the creator/channel publicly.
- [ ] Record permission to quote or show the creator.
- [ ] Add the footage-rights status to `docs/THIRD_PARTY.md`.
- [ ] Obtain the creator's direct description of the problem early.
- [ ] After F9.0, replace generic language wording with the observed condition.
- [ ] Use the bounded stage line supplied by AI/Data.
- [ ] Do not present a small case study as general multilingual support or ecosystem validation.

### D4. Build the tiered demo

- [ ] Tier 1 uses cached media/captions and preflighted OpenAI.
- [ ] Tier 2 lets judges choose only from a prepared cached shortlist.
- [ ] Tier 3 is a recording from the frozen current build.
- [ ] Keep the exact commands, expected timings, and visible success states in the runbook.
- [ ] Define operator actions for OpenAI failure, local asset failure, poll failure, cancellation,
      and no-callback output.
- [ ] Prepare a second laptop and copies of the fallback video on USB and phone.

### D5. Run continuous integration verification

- [ ] After each merge window, run typecheck, lint, build, Python tests, and affected E2E specs.
- [ ] Run accessibility and 390px overflow tests before the final design pass is declared done.
- [ ] Verify that copy-coupled tests were updated intentionally, not weakened.
- [ ] Inspect representative desktop and mobile screenshots for overlap, clipping, stale identity,
      and misleading provenance.
- [ ] Record failures and owners immediately in `tasks/todo.md`.

### D6. Freeze and rehearse

- [ ] Stop feature merges at noon on 22 August.
- [ ] Run the complete release gate from the freeze candidate.
- [ ] Record Tier 3 only after the release gate passes.
- [ ] Rehearse at least five times.
- [ ] Include one network-failure drill and one judge-clicks-off-path drill.
- [ ] Time the pitch, transitions, Riff handoff, Afterplay ablation, Intel proof, and fallback.
- [ ] Keep a written go/no-go decision for the second-channel segment.

## Required Inputs

- **From AI/Data:** corpus ledger, verified citations, held-out report, ablation result, and F9
  measured outcome.
- **From Product/Backend:** preflight, stable routes, restart/cancel/failure proof, and final UI.
- **From Intel/Integration:** grounded strategy example, corrected Intel outputs, and exact Riff
  contract status.

## Acceptance

- [ ] Every current-state claim has a source or build artifact.
- [ ] One runbook covers both products without implying one physical shared memory.
- [ ] The live demo uses only verified evidence and prepared sources.
- [ ] The fallback was recorded from the frozen build.
- [ ] The complete automated release gate passes.
- [ ] Manual source scrubbing confirms the displayed setup and payoff citations.
- [ ] At least five rehearsals and the failure drill are recorded.
- [ ] The pitch can continue coherently if F9 is cut or the live API fails.

## Final Stage Order

1. Creator problem and why per-upload optimization misses channel history.
2. Same-source memory ablation with a verified receipt.
3. Approval and durable learning loop.
4. Intel and evidence-grounded strategy.
5. Optional second-channel case study.
6. Riff handoff using only the integration status actually proven.
7. Roadmap and Garena relevance.

