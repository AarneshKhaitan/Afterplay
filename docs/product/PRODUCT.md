# Product contract

Last updated: 2026-08-09

## Promise

Afterplay gives gaming creators an audible AI cohost that can follow the streamer, gameplay, chat, community history, and one accepted experiment at the same time. Riff helps create the live moment; Afterplay preserves what the moment taught the creator.

## Canonical demo creator

The prototype opens in a creator workspace prepared for a live Roblox obby stream. The creator has chat energy but cannot play, perform, read every message, remember previous viewers, execute a deliberate show experiment, and mine the stream for follow-up work simultaneously.

The chat is a scripted-but-reactive simulation so the demo is reliable and visibly disclosed. The gameplay, creator performance, and live cohost are real during the rehearsal path.

## Central workflow

1. Afterplay proposes one falsifiable stream experiment.
2. The creator accepts or edits the experiment and tunes Riff's personality, roast intensity, and talk frequency.
3. The creator opens the lightweight desktop companion, selects the game window, and starts a live session with that accepted experiment in context.
4. Riff hears the streamer, receives periodic frames from only the selected game window, and decides when speaking would improve the show. Simulated chat remains a separate deterministic input path until it is connected to the companion.
5. Riff can roast the creator, surface the audience's request, recall a relevant prior contribution, or stay silent.
6. Afterplay records the evidence behind each useful live turn and identifies semantic highlight candidates.
7. The stream ends in a short debrief: new memories, highlight candidates, experiment evidence, and a proposed next experiment or callback.

## Canonical judge path

`Experiment check-in -> live session -> audible Riff intervention -> visible highlight capture -> continuity debrief`

Within the first 20 seconds, the judge must understand:

- Riff is an audible AI cohost, not another dashboard assistant;
- Riff has simultaneous context from the streamer, gameplay, chat, memory, and accepted experiment;
- the chat is simulated and the AI status is visible;
- the stream will produce reusable memory and evidence rather than evaporating when it ends.

## Product surfaces

1. **Check-in**: the proposed experiment and compact cohost configuration in Afterplay.
2. **Desktop companion**: selected-game preview, microphone/Realtime state, Riff output, and start/stop control outside the dashboard.
3. **OBS overlay**: one stable transparent browser-source page with a permanent Riff nameplate, stateful waveform, and captions. OBS remains the broadcaster.
4. **Debrief**: memories, highlights, experiment evidence, and next experiment.
5. **History**: prior experiments and creator/community memory. It supports the core loop but is not the demo climax.

## Prototype boundary

- One preloaded creator workspace and one Roblox-obstacle-course demo are used.
- Simulated chat is deterministic but reacts to known live beats.
- Demo mode uses a deterministic cohost director and returns the same validated decision shape as live mode.
- Live mode uses an OpenAI realtime voice model and fails visibly if it is unavailable.
- Gameplay context is sampled from the selected desktop window every five seconds and sent as bounded image input; continuous video is not claimed.
- Roblox broadcast capture, facecam, creator-microphone routing, Riff application audio, and final composition are configured in OBS and verified manually.
- The product emits captions/speaking state for an OBS browser source; it does not recreate OBS.
- Seeded in-process state is acceptable for the prototype and is not represented as durable production storage.
- Final clips may exclude Riff. Riff contributes timestamps, context, memory, and experiment evidence.

## Deliberate exclusions

- Real Twitch or YouTube chat ingestion.
- An animated Riff avatar.
- Special chat-message callout graphics.
- Direct game control, modifiers, trouble tokens, or chat-triggered commands.
- Autonomous moderation sanctions, DMs, purchases, public posting, or sponsor claims.
- Sensitive individual fan profiles.
- Claims that simulated chat or one demo proves retention, burnout reduction, or creator growth.
