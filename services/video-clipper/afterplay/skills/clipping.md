---
name: clipping-craft
description: "Choosing and cutting short-form clips: moment selection, scoring signals, hook discipline, clip length, framing, caption and audio craft. Use when deciding WHICH seconds of a long video to clip and how the cut should feel."
version: 1.0.0
---

# Skill — clipping craft

What separates a clip that holds attention from a cut that technically exists. The
heuristic policy encodes these as rules; an LLM policy is handed this file verbatim.

## Choose the moment

- **A clip is a complete thought.** It must make sense to someone who has seen none
  of the source. Setup with no payoff is worse than no clip.
- **The hook is the first 1.5 seconds.** If the opening words are throat-clearing
  ("so, um, basically, what I wanted to say"), start later. Never open on silence or
  a black frame — QC treats both as a failure, not a warning.
- **Cut on sentence boundaries, never mid-word.** The only legal cut points are the
  sentence spans derived from word-level caption timings.
- **Prefer:** a punchline, a surprising claim, a strong number, a quotable line, a
  question immediately answered, a visible reaction.
- **Avoid:** mid-story starts, references to unseen context ("as I said before",
  "this next one"), long pauses, and anything that needs a chart the crop will cut off.
- **Spread the picks.** Five clips from the same 40 seconds is one clip. Enforce a
  gap between selections.

## Score the moment

Ranked in order of how much they actually predict a good clip:

1. **Engagement heatmap** (most-replayed). When the source exposes it, viewers have
   already told you where the good parts are. Strongest single signal — use it.
2. **Audio events in the caption track** — `[laughter]`, `[applause]`. On comedy,
   banter and reaction content these are near-perfect clip markers.
3. **Turn density** (`>>` speaker changes). Back-and-forth reads as energy.
4. **Questions.** A question sets up a payoff; the payoff is the clip.
5. **Pace.** Words-per-minute above the video's own baseline marks the animated
   stretches. Weakest signal — a tiebreaker, not a driver.

Most sources expose **no heatmap**. Treat the cold-start path as the default, not the
exception.

## Length

- 20–35 s is the sweet spot for Shorts/Reels/TikTok. Under 15 s rarely lands a
  complete thought; over 45 s bleeds retention unless the moment is exceptional.
- Never exceed the platform's hard cap. Trim to the last sentence that fits rather
  than cutting mid-sentence to hit a number.

## Frame

- Keep the speaking subject in the middle third horizontally. A crop that pushes a
  face to the edge reads as broken even when the audio is perfect.
- Pan smoothly or not at all. Jitter is worse than a static crop that is slightly
  off-centre; hold the crop unless the subject genuinely moves.
- When the source is a wide two-shot and both speakers matter, prefer a static crop
  containing both over a pan that chases whoever is talking.

## Caption

- Word-level timing, 2–4 words on screen at a time, highlighting the current word.
- Captions live inside the platform safe zone — clear of the top chrome and the
  bottom UI band. Overflow is a failure: shrink the text or shorten the line.
- Never a wall of text. If a line does not fit, use fewer words per line, not a
  smaller font, until the font floor is reached.

## Audio

- Normalise to the platform's loudness target; a quiet clip gets scrolled past.
- Never ship clipping. If the limiter is working hard, lower the target instead.
