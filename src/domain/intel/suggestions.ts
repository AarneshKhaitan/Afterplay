/** Starter questions for the strategist.
 *
 * In its own Node-free module on purpose. These are needed by a client component, and
 * `agent.ts` — the obvious home — transitively imports the store and therefore `node:fs`.
 * A client value-import of that chain fails the Turbopack build with
 * "the chunking context does not support external modules (request: node:fs)", which is
 * exactly the trap `experiment-metrics.ts` was split out to avoid.
 *
 * HARDCODED (see docs/intel/INTELLIGENCE.md): these are fixed prompt suggestions, not
 * generated. They are UI affordance only — each one produces a real, grounded model call
 * against the live scan corpus.
 */
export const SUGGESTED_QUESTIONS = [
  "What is the single biggest thing holding my channel back?",
  "Which competitor should I be most worried about, and why?",
  "What should my next three videos be?",
  "What are they doing that I am not even attempting?",
  "Where am I actually ahead of them?",
  "What would you need to see to change your mind about all this?",
];
