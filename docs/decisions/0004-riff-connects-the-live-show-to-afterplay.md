# ADR 0004: Riff connects the live show to Afterplay

Date: 2026-08-09

Status: accepted; supersedes the dashboard-first demo emphasis in ADR 0001 and the two-stage director emphasis in ADR 0003.

## Context

The original prototype made a growth experiment the central object but demonstrated it mainly through dashboard navigation, prepared cards, simulated distribution, and sample results. That workflow did not create a sufficiently consequential or visibly AI-native hackathon moment.

The creator's harder job spans the live show and everything that normally disappears afterwards: playing, performing, following chat, remembering viewers, deliberately testing a format, and recovering the moments worth reusing.

## Decision

Afterplay will retain one accepted growth experiment per stream, but Riff becomes its live execution and observation arm.

Riff is an audible, configurable AI cohost. The primary desktop path receives live streamer speech, periodic snapshots from the creator-selected game window, and the accepted experiment. The existing deterministic path also receives simulated chat and explicit gameplay observations. Riff chooses whether to speak, improvises short cohost lines, and contributes source-grounded show moments to Afterplay's memory, highlight, and experiment workflow.

OBS remains the streaming and composition layer. The MVP has no animated avatar, special chat callouts, trouble tokens, direct game control, or per-line approval flow.

## Consequences

- The canonical demo becomes a live-to-debrief transformation, not a dashboard tour.
- Runtime model timing, voice, context synthesis, and silence become the primary AI proof.
- The growth experiment remains useful because Riff actively exercises it during the stream.
- Existing approval and provenance contracts remain for external actions and long-term records.
- Realtime voice, image snapshots, OBS routing, simulated-chat disclosure, and post-stream evidence become first-class build and rehearsal concerns.
- The prototype does not claim that one demo proves creator growth or burnout reduction.
