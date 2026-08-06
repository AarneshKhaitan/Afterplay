# Five-minute demo contract

Target runtime: **4 minutes 40 seconds**, leaving 20 seconds of safety.

This is the proof order, not the final spoken script. Every segment must show working product behavior.

## 0:00-0:25 - Problem and promise

Before recording, run the clipper CLI on the prepared creator-owned source material:

```powershell
cd services\video-clipper
python -m afterplay.cli backfill --creator demo --stream-id prior_001 --vtt path\to\prior.vtt
python -m afterplay.cli --json run --memory --creator demo --local path\to\current.mp4 --vtt path\to\current.vtt --clips 3 --platforms shorts
```

Then open directly in the selected creator's Growth HQ.

The judge must understand:

- this creator sometimes gets views but does not build a returning audience;
- Afterplay is an autonomous growth team with a callback-aware clipper as one worker;
- one creator decision currently needs attention.

## 0:25-1:10 - Diagnosis and AI contribution

Open the active experiment. Show:

- evidence behind the reach-without-return diagnosis;
- confidence and uncertainty;
- rejected alternatives;
- the testable hypothesis;
- Strategist and Scout contributions.

State the removal test: without semantic judgment across creator history, the system becomes dashboards and templates rather than a creator-specific growth team.

## 1:10-2:05 - Plan and finished work

Move into Studio through the experiment, not through disconnected navigation. Show:

- the latest real clipper manifest, if prepared before the recording;
- the playable callback clip;
- the cited prior stream, timestamp, and quote that make the clip meaningful;
- the experiment's stream premise;
- prepared content variants;
- target audience and intended job of each output;
- Producer rationale and provenance;
- the available reject, change-request, and approve controls;
- why the recorded revision matters at the action boundary.

## 2:05-2:55 - Human authority and external action

Approve the current revision. Show:

- the UI explicitly says nothing has been posted after approval;
- current-revision approval creates one action;
- the simulated publisher is visibly labelled;
- an idempotent sample receipt returns;
- three transparently simulated, idempotent receipts.

## 2:55-3:55 - Results and learning

Open Audience from the experiment result. Show:

- labelled sample performance;
- movement in returning audience, not only reach;
- the Analyst's evidence-backed interpretation;
- uncertainty from the small sample;
- the limits that prevent a causal claim;
- the materially changed next experiment.

## 3:55-4:40 - The loop closes

Return to Growth HQ. Show:

- the completed experiment;
- what Afterplay learned;
- a materially changed next experiment;
- the team continuing autonomous internal work;
- the next creator decision, if any.

If the workspace is not at its initial state, use **Integrations → Reset demo workspace** before recording. The reset is visible and backed by the public service.

Close on the product contract: the creator plays; Afterplay decides what to test, prepares the work, learns from results, and asks before acting in public.

## Demo truth rules

- Demo AI mode is visible.
- Sample platform data and receipts are labelled where shown.
- No claim implies real public posting or proven creator growth.
- No static slide substitutes for a required workflow step.
- The app remains fully usable without network access or external credentials.
- The web app does not claim to launch the clipper. The demo boundary is CLI first,
  refresh Studio second.
