# Canonical demo workspace

All identities, games, platform events, metrics, and results in this document are **fictional sample data** for the prototype. Visual media will be generated for Afterplay and disclosed as synthetic.

## Creator

- Display name: **Mika Rao**
- Handle: **mika_rigged**
- Workspace ID: `ws_mika_rigged`
- Primary category: physics sandbox and engineering challenge games
- Current game: **Rivetfall**, a fictional construction sandbox
- Creator accent: signal coral on a cool graphite product shell
- Goal: build a small audience that returns for the creator's ideas and community, not only isolated failures
- Boundaries: no automatic publishing, no trend-chasing unrelated to the channel, no invented community quotes

Mika is one selected account inside a reusable multi-account shell. No route, navigation label, layout primitive, or experiment field may contain Mika- or Rivetfall-specific assumptions.

## Baseline observation window

Sample window: 28 days before the active experiment.

| Signal | Sample value | Interpretation limit |
| --- | ---: | --- |
| Completed live sessions | 8 | Small history; format comparisons remain noisy. |
| Average concurrent live viewers | 3.4 | Directional, not statistically stable. |
| Distinct live chat participants | 17 | Platform-local identity only. |
| Repeat live chat participants | 4 | Based on connected sample chat history, not cross-platform identity resolution. |
| Published short-form posts | 12 | Mix of unrelated highlight formats. |
| Median short-form views | 842 | Two outliers received substantially more reach. |
| Returning YouTube viewers | 8.2% | Platform-native sample metric. |
| Median repeat commenters per post | 2 | Observed within the sample social adapter. |
| Median tracked live-link visits per post | 3 | Requires a tagged link; it is not inferred identity matching. |

## Evidence behind the diagnosis

1. `ev_clip_crane_fail`: a crane collapse reaches 4,718 views, but the clip starts at failure and never establishes the challenge or creator premise.
2. `ev_comment_context`: six comments ask what Mika was trying to build; only two commenters appear again during the observation window.
3. `ev_stream_rule`: a stream segment where chat adds a "no straight beams" constraint produces the highest chat participation rate despite modest reach.
4. `ev_creator_preference`: Mika says the fun comes from solving increasingly unreasonable community constraints, not from optimal builds.
5. `ev_format_fragmentation`: the twelve posts use nine different framings, titles, or recurring concepts.

## Active diagnosis

Mika can attract attention with spectacular failures, but the content removes the premise and community mechanism that make the channel distinctive. Viewers receive isolated payoffs without a recognizable show to return to.

- Confidence: `medium`
- Primary uncertainty: only four weeks of history and two reach outliers
- What would change the diagnosis: repeated evidence that premise-led clips lower completion without improving comments, return, or tracked live interest

## Considered alternatives

### Post more frequently

Rejected because output volume does not address why viewers cannot identify a recurring promise.

### Switch to a currently trending game

Rejected because the trend audience may not match Mika's creator identity, and existing evidence suggests the community-constraint format is the stronger signal.

### Improve hook editing only

Rejected as incomplete. The high-reach collapse clip already has a strong visual hook; its missing element is a repeatable premise and return path.

## Active growth experiment

- ID: `exp_one_more_rule`
- Name: **One More Rule**
- State on demo reset: `awaiting_creator_decision`
- Target audience: curious sandbox viewers who enjoy collective problem-solving more than optimized builds
- Hypothesis: if Mika packages community-added constraints as a named recurring format and lets viewers choose the next constraint, more reached viewers will return or take a measurable step toward the next live session

### Stream plan

Build a working bridge in Rivetfall while chat adds one new construction constraint every ten minutes. Display the current rule stack during the stream and end by selecting three viewer suggestions for the next episode.

### Studio outputs

1. **Premise cut**: establishes the simple bridge goal, introduces the rule stack, then reveals the failure caused by the third community constraint.
2. **Community cut**: opens on a viewer-submitted "no straight beams" rule and shows Mika attempting to honor it.
3. **Return prompt**: asks viewers which rule should be added in the next live episode and uses a tagged live-session link.

The prototype initially presents the premise cut and community cut as a reviewable package. A change request creates Revision 02 without erasing Revision 01.

## Approval and simulated distribution

Approval creates one idempotent action for the current revision. Demo mode returns sample receipts for YouTube Shorts and TikTok. No receipt or outbox item exists before approval.

All distribution surfaces show:

- `simulation: true`;
- provider name;
- sample post ID;
- selected output revision;
- approval decision ID;
- created timestamp from the deterministic demo clock.

## Sample result

The result represents one completed experiment and is not evidence of general product efficacy.

| Signal | Baseline | Experiment | Interpretation |
| --- | ---: | ---: | --- |
| Short-form views | 842 median | 1,284 | Reach improved, but this is not the north-star result. |
| Returning YouTube viewers | 8.2% | 13.6% | Directionally supports a recognizable recurring premise. |
| Repeat commenters | 2 median | 7 | Viewer rule suggestions created a stronger return mechanism. |
| Tracked live-link visits | 3 median | 9 | More viewers took a measurable step toward the live session. |
| Next-stream average concurrency | 3.4 | 4.6 | Encouraging but too small and confounded for a causal claim. |

## Analyst learning

The result directionally supports the hypothesis that a named community mechanism creates more return intent than isolated failure clips. It does not establish that the format alone caused higher live concurrency.

- Hypothesis result: `supported_with_low_sample`
- Confidence: `medium_low`
- Memory update: Mika's strongest repeatable promise is collaborative constraint escalation, not generic engineering failure

## Next experiment

Feature three named viewer constraints from the first episode at the beginning of the next stream, then compare whether recognized contributors and observers return to see their rule attempted.

This materially changes the next test from an anonymous recurring format to a participant-recognition loop. It remains a draft until the creator approves the plan.
