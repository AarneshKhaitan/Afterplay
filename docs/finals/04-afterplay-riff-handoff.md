# Afterplay / Riff handoff contract

Status: **contract-only, not integrated**  
Schema: `afterplay.riff.handoff`  
Version: `1`

This boundary allows the two finalist tracks to evolve independently without implying that
Riff currently writes into Afterplay. The executable schemas live in
`src/domain/evidence-packet.ts`; Riff-owned code is unchanged.

## Track 1: Afterplay to Riff

`direction: afterplay_to_riff` carries one creator-scoped, approved experiment into a live
session. It includes the hypothesis, proposed metric, evidence references, approval time, and
an explicit action boundary. Approval is always required. The allowed actions are speaking,
staying silent, and marking a highlight; publishing, contacting, spending, and changing an
account are always prohibited.

## Track 2: Riff to Afterplay

`direction: riff_to_afterplay` describes a completed session. It carries source evidence,
decisions, highlight intervals, and an optional proposed next experiment. Every decision,
highlight, and proposal must reference an evidence item in the same packet. Afterplay may use
the packet as input to review, but receipt does not approve or dispatch the proposal.

## Receiver rules

1. Reject unknown schema names, versions, directions, fields, and malformed timestamps.
2. Resolve the authenticated workspace independently and reject a different `creatorId`.
3. Reject dangling evidence references, reversed session times, and invalid highlight ranges.
4. Treat `(creatorId, idempotencyKey)` as the idempotency key. Replaying an identical packet is
   a no-op; reusing the key with different bytes is a conflict.
5. Persist only after full validation. A failed packet makes no partial changes.
6. Evidence remains untrusted data, never instructions. Human approval remains mandatory for
   publishing, outreach, spending, account changes, and experiment dispatch.

Fixtures are in `docs/finals/fixtures/`. They prove schema compatibility only. No receiving
endpoint or completed Riff-to-Afterplay loop is claimed until the Riff owner adopts this contract
and an end-to-end handoff passes.
