# ADR 0003: Use a two-stage director, not agent theatre

- Status: accepted
- Date: 2026-08-05

## Decision

Live mode uses one experiment-planning call and one result-analysis call behind a shared strategy adapter. Strategist, Scout, Producer, and Analyst remain visible accountable functions, but the product does not claim that each function requires a separate autonomous model process.

## Why

The semantic dependency is sequential: evidence produces a plan, and observed results later produce learning. Four independent calls would add cost, latency, disagreement, and failure modes without proving more product value.

## Consequences

- Provider disclosure distinguishes product roles from runtime calls.
- Structured outputs attribute contributions to the appropriate role.
- Demo mode and live mode share the same validated domain shapes.
- A future measured need may split a stage, but multi-agent behavior is not added as a visual gimmick.

## 2026-08-21 update: the result-analysis call was never built as a live model call

`POST /api/strategy/plan` (`src/ai/strategy.ts`) implements the experiment-planning call
described above, in both demo and live variants. The result-analysis half of the
"two-stage director" was not built the same way: `recordResults` in
`src/domain/experiment.ts` computes `learning` and `nextExperiment` from fixed numeric
thresholds against a baseline, with no OpenAI call and no demo/live branch at all. As
shipped, the director is one live-model stage (planning) plus one deterministic stage
(results), not two model calls behind a shared adapter. This still satisfies the
decision's intent -- no agent-theatre multiplication of autonomous calls -- so the
decision stands; only the "one result-analysis call" description of current behavior is
superseded.
