# Afterplay Finals Execution Index

Status: approved for execution on 2026-08-19

This directory turns the finals strategy into four parallel, owner-ready workstreams. This
index is the repository source of truth for ownership, dependencies, integration order, and
completion status. The workstream documents contain implementation checklists; they must not
redefine shared contracts independently.

## Objective

By the 22 August noon freeze, Afterplay must demonstrate:

1. Every displayed claim is real, source-bearing, and independently checkable.
2. Channel memory measurably changes a decision in the same pipeline.
3. The live path survives expected failures and retains state across restarts.
4. Intel and strategy operate on creator-scoped, source-bearing evidence.
5. The product surface is coherent when a judge leaves the happy path.
6. A second creator can provide a bounded language-variation case study without becoming a
   claim of general multilingual support.

The primary pitch remains:

> Most creator tools optimize each upload independently. Afterplay is designed to accumulate
> channel history and use that history directly in future decisions.

The primary proof is the memory ablation. The second-channel proof demonstrates breadth; it is
not the main demo.

## Workstreams

| Workstream | Accountable owner | Phases | Plan |
|---|---|---|---|
| AI, provenance, and proof | AI/Data lead | F1, F2, F3, F9 | [01-ai-provenance-proof.md](./01-ai-provenance-proof.md) |
| Backend and product | Product/Backend lead | F4, F6 | [02-backend-product.md](./02-backend-product.md) |
| Intel and contracts | Intel/Integration lead | F5, F7 | [03-intel-contracts.md](./03-intel-contracts.md) |
| Demo, QA, and narrative | Demo/QA lead | F8 and release verification | [04-demo-qa-narrative.md](./04-demo-qa-narrative.md) |

One person may own multiple workstreams, but every deliverable has one accountable workstream.
Cross-workstream support does not transfer accountability.

## Shared Contracts

The integration owner freezes these shapes before downstream implementation begins:

1. **Verified mention**
   - `verified` defaults to `false` when absent.
   - Includes transcript-derived `quote`, `t`, `t_reported`, `match_ratio`, and repair/audit
     metadata.
   - Unverified mentions may be retained for audit but cannot affect retrieval, judging,
     boosting, selection, or finale-facing output.
2. **Source provenance**
   - Includes explicit footage rights; rights are never inferred from a URL or creator id.
   - Includes `transcript_language`, `transcript_source`, and `subtitle_track`.
   - `transcript_source` distinguishes `provided_vtt`, `youtube_manual`, `youtube_auto`,
     `youtube_unknown`, and `asr`; the unknown state is visible rather than guessed.
3. **Memory ablation**
   - Carries baseline and memory ranks, rank delta, base percentile, boost, final score, scale,
     comparison point, and a disabled reason when comparison is unavailable.
4. **Creator scope**
   - Creator id is explicit on manifests, experiments, memory, Intel scans, and strategy input.
   - Switching creators changes every creator-dependent artifact, or the switcher is disabled.
5. **Riff handoff**
   - A versioned evidence packet defines highlights, evidence, and a proposed next experiment.
   - No product or pitch claim says Riff writes into Afterplay until an end-to-end run proves it.

Schema changes are merged before UI projection. Any shared-contract change after the freeze
requires the integration owner and Demo/QA owner to approve and rerun the full release gate.

## Corpus Rules

Every source has exactly one role:

| Role | Purpose | Constraint |
|---|---|---|
| Historical backfill | Builds channel memory | Never evaluated against |
| Tuning | Prompt and threshold work | May be inspected and labelled |
| Held-out evaluation | Reported quality numbers | Never tuned against |
| Finale demonstration | Stage run | Never backfilled, tuned against, or included in eval sets |

The second channel follows the same separation. The default language-variation proof freezes
English-derived thresholds and measures transfer. If language-specific tuning is needed, it
uses a separate tuning source and the proof source remains untouched.

## Dependency And Merge Order

1. Freeze corpus roles and the five shared contracts.
2. Merge citation verification, source provenance, and creator-isolation foundations.
3. Merge persistence, atomic writes, and structured job state.
4. Merge eval harness, prompt/threshold work, and memory ablation.
5. Merge Intel integrity and evidence-grounded strategy.
6. Merge Studio projection, creator scoping, evidence UI, cold states, and design consolidation.
7. Merge narrative/docs, record the fallback, and run the release gate.

Use scheduled merge windows at least twice per day. The integration owner resolves changes to
the manifest schema, creator identity, Studio, shared persistence, and global CSS.

## Four-Day Schedule

| Day | AI/Data | Product/Backend | Intel/Integration | Demo/QA |
|---|---|---|---|---|
| 19 Aug | Corpus, clean memory, citation contract | Creator scope and persistence foundation | Ownership isolation and atomic writes | Truthful script, baseline, permissions and creator quote |
| 20 Aug | Eval harness, labels, frozen thresholds, language discovery | Structured progress and cancellation | Intel integrity and strategy grounding | Ablation evidence audit and competitor wording |
| 21 Aug | Final pipeline, ablation, second-channel proof | Evidence UI, cold states, design pass | Recommendations and Riff contract | Integration, responsive, and accessibility checks |
| 22 Aug | Measured fixes only | Blocker fixes only | Contract verification | Freeze at noon, record fallback, rehearse |

External F9 dependencies have a Day 3 go/no-go. If usable transcripts or the required
permissions are unavailable, remove the second-channel segment instead of consuming freeze day.

## Status

- [ ] Shared contracts frozen.
- [ ] AI, provenance, and proof accepted.
- [ ] Backend and product accepted.
- [ ] Intel and contracts accepted.
- [ ] Demo, QA, and narrative accepted.
- [ ] Full release gate passed from a clean checkout/runtime directory.
- [ ] Tier 3 fallback recorded from the frozen build.
- [ ] At least five rehearsals completed, including a network-failure drill.

## Global Release Gate

Run after each merge window and once more after the freeze candidate is created:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npx playwright test tests/e2e/accessibility.spec.ts
Set-Location services/video-clipper
.venv/Scripts/python -m pytest
.venv/Scripts/python -m afterplay.cli eval --set evals/heldout.jsonl
```

The final manual path must prove:

1. Historical backfill produces verified source-bearing threads.
2. The finale source produces a real manifest and a memory ablation.
3. The citation resolves to the spoken words at the displayed source time.
4. Approval, distribution, results, and learning survive a server restart.
5. Concurrent Intel scans complete without an atomic-write collision.
6. Ingest cancellation and poll failure reach visible terminal states.
7. Creator switching changes all creator-dependent data or is disabled.
8. The second-channel result, if retained, uses an untouched proof source and bounded wording.
