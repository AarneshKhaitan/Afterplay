# Callback evaluation corpus

This directory contains a bounded 50-window callback-judge evaluation drawn verbatim from the
real cached Sidemen transcripts available during the finals build. It is a product smoke corpus,
not a benchmark and not evidence of broad creator or language generalisation.

- `tuning.jsonl`: 25 windows used for threshold selection.
- `heldout.jsonl`: 25 windows never used by the threshold sweep.
- `replays.jsonl`: recorded model responses. Evaluation defaults to replay and fails if a request
  is absent. Only explicit `--record` mode may call OpenAI.
- `corpus.json`: hashes, counts, source-overlap disclosure, and annotation limitations.
- `build_corpus.py`: reproducibly extracts the committed window text from ignored local VTTs.

The available cache has no source-disjoint tuning/held-out pair. Event groups never cross the
split, but both source IDs do. Ambiguous records have two transparent system/AI review records;
there were no independent human annotators. Reports preserve both limitations and must retain the
claim scope `bounded_candidate_window_corpus_not_a_benchmark`.

From `services/video-clipper`:

```powershell
$env:PYTHONPATH='.'
python -m afterplay.cli eval --set evals/heldout.jsonl --tuning evals/tuning.jsonl

# This is the only mode allowed to make missing live calls.
python -m afterplay.cli eval --set evals/heldout.jsonl --tuning evals/tuning.jsonl --record
```
