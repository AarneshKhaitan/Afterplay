# Afterplay Finals Phases

Finale: 23 August 2026

Freeze: 22 August 2026 at noon

This is the PRD entry point for the calendar-bound finals program. The canonical ownership,
dependency, status, and release index is [docs/finals/README.md](../finals/README.md). Detailed
execution checklists live in the four linked workstream plans; this file does not duplicate
those checklists.

## Objective

Move Afterplay from a submission prototype to a truthful, measured, durable product demo whose
core differentiation is visible in the output:

> Most creator tools optimize each upload independently. Afterplay is designed to accumulate
> channel history and use that history directly in future decisions.

The memory-off versus memory-on ablation is the primary proof. Riff remains the teammate-owned
AI cohost track. Intel remains the competitive intelligence and grounded strategy track.

## Phase Ownership

| Phase | Outcome | Accountable workstream |
|---|---|---|
| F1 | Provenance and honest demo data | [AI, provenance, and proof](../finals/01-ai-provenance-proof.md) |
| F2 | Measured detection quality | [AI, provenance, and proof](../finals/01-ai-provenance-proof.md) |
| F3 | Same-pipeline memory ablation | [AI, provenance, and proof](../finals/01-ai-provenance-proof.md) |
| F4 | Durability, isolation, and live-run safety | [Backend and product](../finals/02-backend-product.md) |
| F5 | Intelligence integrity | [Intel and contracts](../finals/03-intel-contracts.md) |
| F6 | Creator scoping and product surface | [Backend and product](../finals/02-backend-product.md) |
| F7 | Shared evidence and Riff contracts | [Intel and contracts](../finals/03-intel-contracts.md) |
| F8 | Narrative, docs, stage, and release | [Demo, QA, and narrative](../finals/04-demo-qa-narrative.md) |
| F9 | Second-channel language-variation proof | [AI, provenance, and proof](../finals/01-ai-provenance-proof.md) |

## Operating Rules

1. A displayed claim is real and source-bearing or explicitly labelled as a fixture/future item.
2. Historical, tuning, held-out, and finale sources never share roles.
3. Missing citation verification defaults to unverified and cannot influence decisions.
4. Creator-dependent artifacts are scoped together or the creator switcher is disabled.
5. Rights are explicit source metadata, never inferred from a URL or creator id.
6. Riff-to-Afterplay learning is not claimed until an end-to-end run proves it.
7. The second-channel proof is a bounded case study, not general multilingual support.
8. No feature merges after the freeze; only measured blocker fixes are permitted.

## Release Authority

The Demo/QA owner accepts the freeze candidate only after all four workstream acceptance sections
and the global release gate in [the execution index](../finals/README.md#global-release-gate) pass.
Verified results are then recorded in [EVIDENCE.md](./EVIDENCE.md) and `tasks/todo.md`.
