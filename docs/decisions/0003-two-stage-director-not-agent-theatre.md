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
