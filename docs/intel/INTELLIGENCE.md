# Competitive intelligence engine

Last verified against the codebase on 9 August 2026.

The intelligence console (`/intel`) is the answer to "what should I make next, and why".
It scrapes a creator's channel and up to five competitors, measures what actually
correlates with reach, reasons over the result with a model, and folds the findings into a
memory that compounds across scans.

This document is the truth boundary. **Read the "What is real" and "What is not" sections
before demoing or describing this feature.**

---

## 1. The flow

```
resolve  →  harvest  →  measure  →  watch  →  reason  →  remember
```

| Stage | What it literally does | Real? |
|---|---|---|
| **resolve** | Normalises typed handles into YouTube channel URLs; rejects malformed input | real |
| **harvest** | Calls the Apify actor `streamers/youtube-scraper` per channel. The only paid step | **real network call** |
| **measure** | Pure arithmetic: outlier multiples, engagement, cadence, volatility, hit rate, packaging lift | real, deterministic |
| **watch** | Reads each video's title, description, packaging features, and — where YouTube exposed captions — the actual transcript | real read; see pacing note |
| **reason** | One OpenAI Responses call over the corpus, structured output, citations validated afterwards | **real model call** |
| **remember** | Merges findings into durable beliefs; reinforces, decays, contradicts | real, deterministic |

Source: `src/domain/intel/pipeline.ts`.

---

## 2. What is real

Everything below is genuinely computed from live data. None of it is fixture output.

- **The corpus.** Titles, view counts, likes, comment counts, durations, publish dates,
  hashtags, descriptions, subscriber counts and thumbnails all come from a live Apify
  scrape. Transcripts are real YouTube captions when the channel exposes them.
- **Every number in the report.** Outlier multiples, engagement rates, views per
  subscriber, hit rate, volatility, cadence, packaging lift and theme gaps are computed in
  `src/domain/intel/metrics.ts` from the scraped corpus. No constants.
- **The analysis.** `src/domain/intel/analyst.ts` makes a real model call. If it fails,
  the scan fails visibly — there is no fixture fallback, matching the rule the strategy
  director already follows.
- **Citation grounding.** Every citation the model emits is checked against the real
  corpus. Anything unresolvable is stripped, and a finding left with no evidence is
  discarded. Counts are logged and shown in the scan log.
- **The strategist chat.** Grounded in the real corpus plus the standing memory. Video
  citations render as links to the actual videos.
- **The memory.** Beliefs persist under `.intel/memory/`, gain confidence when
  re-observed, decay when a later scan stops supporting them, and record a timeline.
- **The agent swarm.** One scout per channel, one watcher per channel, one analyst, one
  consolidator. Counts, per-channel findings and progress are read from the scan file.

---

## 3. What is NOT real — read this before pitching

### 3.1 The AI does not watch video frames

The **"Watching & understanding"** stage name is evocative; the stage's own `truth` field
(shown on hover in the UI) states literally what it reads: *titles, descriptions,
packaging features, and transcripts where available*.

**There is no computer vision in this feature.** Thumbnails are displayed but never
analysed. No frame is decoded, sampled or sent to a vision model.

This is an honest gap, not a hidden one, and it is a small one to close: the repo already
has a working vision path in the Python clipper (`services/video-clipper/afterplay/vision.py`
does face detection and saliency on decoded frames, and `qc.py` measures real pixels). A
future stage would sample frames per video and add thumbnail/hook analysis to the same
corpus. Until that exists, **do not claim the system watches videos.**

### 3.2 Watcher pacing is presentational

The watch stage steps its watchers on a ~110ms tick, capped at 12 ticks. The read itself
is near-instant because the corpus is already in memory. The **counts, titles and
transcript flags are real**; the pacing exists so the stage is legible instead of flashing
past. Documented at the loop in `pipeline.ts`.

### 3.3 Association, not causation

Packaging lift measures whether videos with a trait outperform videos without it, within
this channel set. It cannot establish that the trait *caused* the reach. The UI says this
in the Packaging lab and the analyst is instructed to preserve the distinction.

### 3.4 What public scraping cannot see

No retention, click-through rate, traffic source, impressions, or demographics. Those need
the creator's own YouTube Analytics (OAuth), which this feature does not use. The report's
"What this cannot tell you" section states the blind spots the model itself identifies.

---

## 4. Hardcoded values

Everything hardcoded in this feature is a **convenience default or a display constant**.
No finding, number or recommendation is hardcoded.

| What | Where | Why it is safe |
|---|---|---|
| Competitor presets ("FPS / Battlefield", etc.) | `components/intel/scan-setup.tsx` | Prefill only. Typing your own handles takes the identical path. |
| Suggested questions | `domain/intel/suggestions.ts` | UI affordance. Each produces a real grounded model call. |
| Packaging feature definitions | `domain/intel/features.ts` | The *detectors* are hand-written regexes; the *lift* for each is measured from real data. A feature that does not correlate shows a lift below 1. |
| `USD_PER_RESULT = 0.005` | `domain/intel/apify.ts` | Display-only cost estimate, from the actor's pricing page. Never gates a run. |
| `MAX_RESULTS_PER_SCAN = 400` | `domain/intel/apify.ts` | Cost ceiling so a typo cannot spend the balance. |
| `REINFORCE` / `DECAY` / `WEAK_FLOOR` | `domain/intel/memory.ts` | Belief-update constants. Tunable policy, applied uniformly. |
| Default creator id `creator_mika_rigged` | `app/intel/page.tsx` | Ties the console to the demo workspace. |

**Not hardcoded:** every insight, recommendation, parallel, belief, headline, metric, lift
value and chat answer.

---

## 5. Cost control

The actor bills per scraped video (~$0.005). Three guards:

1. **Ceiling.** `MAX_RESULTS_PER_SCAN` rejects oversized scans before any spend.
2. **Cache.** Raw scrape payloads are cached 24h under `.intel/cache/`, keyed on channels,
   video count, transcript flag **and sort order**. Re-running an identical scan costs
   nothing, so a demo can be rehearsed indefinitely once warmed.
3. **Visible estimate.** The setup panel shows the estimated cost before you launch.

Test runs can never spend: both Playwright configs pin `APIFY_API_TOKEN` empty.

---

## 6. Sampling: the trap worth knowing

A scan samples either the **most recent** uploads or the **all-time most popular** ones.
This choice changes what the numbers mean, and getting it wrong produced a real bug.

- **Most recent (default).** A contiguous window. Cadence and recency are genuine
  measurements. This is what a competitive read usually wants: what are they doing *now*.
- **All-time best.** Spans years. `uploadsPerWeek` is therefore reported as **null**, and
  the UI renders "not measured" rather than a number.

> **The bug this prevents.** Cadence was originally computed from a popularity-ordered
> sample, producing `0.02 uploads/week` for a channel that actually posts ~3.7×/week — two
> orders of magnitude wrong. The model read that number and made *"publishing cadence is
> the clearest structural disadvantage"* its headline finding, which was false. After the
> fix the same channels produced *"high cadence is sustaining market-leading reach"* — the
> opposite conclusion. `channelStats` now gates the calculation, and the corpus sent to the
> model carries a `sampling` note explaining any null.

---

## 7. Durability boundary

`.intel/` is file-backed JSON (`scans/`, `cache/`, `memory/`), gitignored. It survives dev
restarts, which is what makes accumulating memory real rather than a claim. It is **not** a
database: no concurrent-writer safety beyond atomic rename, no multi-tenancy, no retention
policy beyond the bounded lists. Same trade-off as the rest of the prototype (PRD G21).

---

## 8. Configuration

```bash
APIFY_API_TOKEN=apify_api_...     # required for scans; no fixture fallback
OPENAI_API_KEY=sk-...             # required for analysis and the strategist
AFTERPLAY_INTEL_MODEL=gpt-5.6-sol # falls back to AFTERPLAY_OPENAI_MODEL
AFTERPLAY_INTEL_DIR=.intel        # store location
```

Missing either key produces a visible, specific error. Neither is ever substituted with
sample output.

---

## 9. Verification

```bash
npx playwright test tests/e2e/intel-engine.spec.ts    # 24 adversarial unit tests
npx playwright test tests/e2e/intel-console.spec.ts   # 6 browser tests
npx playwright test                                    # full suite, 57 tests
```

`intel-engine.spec.ts` covers the shapes that genuinely arrive from the scraper: zero-view
channels, channels that do not exist, unparseable durations, relative dates,
prompt-injection in titles, belief decay to the floor, and citation grounding including the
regression that destroyed 12 of 15 real findings.

Browser tests write to an isolated `AFTERPLAY_INTEL_DIR`, because belief memory is
cumulative — pollution there would compound with every run rather than be overwritten.
