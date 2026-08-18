# Workstream 1: AI, Provenance, And Proof

Accountable owner: AI/Data lead

Phases: F1, F2, F3, F9

## Outcome

Produce a truthful memory corpus, verified citations, measured detection quality, and a
same-pipeline memory ablation. Optionally add a bounded second-channel language-variation case
study when transcripts and permissions pass the go/no-go gate.

## Preconditions

- [ ] Assign every Sidemen source one non-overlapping corpus role.
- [ ] Identify historical, tuning, held-out, and finale sources before any new backfill.
- [ ] Freeze the verified-mention, source-provenance, and ablation contracts with the integration
      owner.
- [ ] Preserve the current staged artifacts only as labelled historical fixtures; remove them
      from active runtime paths.

## Deliverables

### A1. Rebuild memory honestly

- [ ] Remove the four authored `probe_ksi` threads that cite the unprocessed source.
- [ ] Acquire and cache enough independent history to satisfy the corpus-role split.
- [ ] Re-backfill historical sources only after citation verification is active.
- [ ] Replace `.demo-final` with genuine pipeline output over the finale source.
- [ ] Accept a genuine no-callback outcome and adapt the narrative to the output.
- [ ] Record corpus roles and verified callback evidence in `docs/demo/CALLBACK.md`.

Expected files:

- `services/video-clipper/.memory/<creator>/threads.json`
- `services/video-clipper/.demo-cache/`
- `services/video-clipper/.work/`
- `.env`
- `docs/demo/CALLBACK.md`

### A2. Verify every citation at write time

- [ ] Add `afterplay/citations.py` and wire it into thread extraction.
- [ ] Match model-reported text to an actual transcript span, then derive the timestamp from the
      matched span.
- [ ] Preserve the reported timestamp for audit but never use it as verified source time.
- [ ] Store the transcript-verbatim quote separately from any readable summary.
- [ ] Default missing verification metadata to `verified=False`.
- [ ] Revalidate or re-extract legacy records; never grandfather them as trusted.
- [ ] Exclude unverified mentions from retrieval, judging, boosting, selection, and UI evidence.
- [ ] Report verified, repaired, and unverified counts from backfill.
- [ ] Add positive, repaired, rejected, Unicode, and mixed-script tests.

Expected files:

- `services/video-clipper/afterplay/citations.py`
- `services/video-clipper/afterplay/channel_memory.py`
- `services/video-clipper/tests/test_citations.py`
- `services/video-clipper/tests/test_extended.py`

### A3. Build the evaluation harness

- [ ] Label 40-60 candidate windows with positives, clear negatives, and semantic near misses.
- [ ] Keep tuning and held-out records in separate committed files.
- [ ] Use two annotators for ambiguous examples and record disagreements.
- [ ] Record model responses once; fail on replay misses instead of making hidden live calls.
- [ ] Report detection and selection separately.
- [ ] Print precision, recall, confusion matrix, and judge-confidence buckets.
- [ ] Sweep thresholds on tuning data only and report held-out results separately.
- [ ] Stamp model, prompt version, citation-verifier version, thresholds, corpus revision, and run
      time into every report.
- [ ] Add `--memory` to `afterplay plan` for decide-only evaluation.

Expected files:

- `services/video-clipper/evals/`
- `services/video-clipper/afterplay/evals/run_eval.py`
- `services/video-clipper/afterplay/evals/replay.py`
- `services/video-clipper/afterplay/cli.py`

### A4. Improve quality from measured results

- [ ] Add tuning-only positive and hard-negative examples to extraction and callback prompts.
- [ ] Remove the decision threshold from the model prompt and use evidence-based confidence
      anchors.
- [ ] Define or remove retrieval similarity shown to the judge.
- [ ] Add a similarity floor selected from tuning data.
- [ ] Normalize base ranking to a comparable scale before applying memory boost.
- [ ] Vectorize cosine retrieval with NumPy.
- [ ] Parallelize extraction while preserving deterministic merge order.
- [ ] Add memory embed, retrieve, and judge timings.
- [ ] Rerun the English held-out evaluation after every prompt, verifier, model, or retrieval
      change. Previously recorded metrics become stale when any of these changes.

### A5. Produce the memory ablation

- [ ] Split ranking into score-all and select operations with an equivalence test.
- [ ] Compute the comparison before sponsor filtering and analytics mutation.
- [ ] Emit baseline and memory ranks, rank delta, base percentile, boost, final score, scale, and
      comparison point.
- [ ] Disable the comparison with an explicit reason when memory or transcripts are unavailable.
- [ ] Assert that memory-off makes no memory embedding or callback-judge calls.
- [ ] Never describe memory-off as a competitor or an ordinary clipper.

Expected files:

- `services/video-clipper/afterplay/understand.py`
- `services/video-clipper/afterplay/baseline.py`
- `services/video-clipper/afterplay/agent.py`
- Manifest schema and pipeline tests

### A6. Run the second-channel language-variation proof

- [ ] Inspect several real transcripts before naming the language condition.
- [ ] Record caption source and actual subtitle track per stream.
- [ ] Request configured subtitle languages in priority order.
- [ ] If none exists, use explicitly configured ASR or fail clearly; never select another
      language silently.
- [ ] Carry `transcript_language`, `transcript_source`, and `subtitle_track` through `Source` and
      the Python manifest.
- [ ] Freeze English-derived detection and citation thresholds for the default transfer test.
- [ ] Keep the proof stream separate from backfill and tuning.
- [ ] If transfer fails, report the failure. A later language-specific threshold requires a
      separate tuning stream.
- [ ] Keep labels and summaries in English while preserving source quotes verbatim.
- [ ] Present small results as a case study, not an accuracy result.
- [ ] Do not claim multilingual Intel, multilingual UI, multilingual Riff, or general language
      support.

The Demo/QA workstream obtains footage, naming, and quote permissions. The Product/Backend
workstream validates and projects explicit footage-rights metadata. This workstream remains
accountable for the proof corpus and measured result.

## Handoffs

- **To Product/Backend:** verified mention fields, source-language provenance, footage-rights
  field, and ablation manifest shape with fixtures.
- **To Intel/Integration:** verified threads and stable evidence identifiers for strategy input.
- **To Demo/QA:** held-out report, exact ablation result, source timestamps, bounded second-channel
  wording, and known failure modes.

## Acceptance

- [ ] Active demo memory contains only revalidated or newly verified records from multiple
      independent historical streams.
- [ ] Every displayed callback resolves to a real setup and payoff; no-callback remains valid.
- [ ] `afterplay eval` reports held-out metrics and immutable run metadata.
- [ ] One command produces the same-source memory-off/memory-on ranking and structured diff.
- [ ] Studio-ready ablation data matches the generated manifest.
- [ ] The Python suite passes.
- [ ] If F9 ships, its proof source was untouched, its thresholds were frozen, and its claim is
      bounded to the measured case.

## Demo Evidence

Provide Demo/QA with:

- The exact backfill and finale commands.
- A transcript-verbatim setup quote and payoff quote with source times.
- Held-out metrics and their version metadata.
- The rank change used on stage.
- The second-channel case study result or the explicit go/no-go decision.

