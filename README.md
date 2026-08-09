# Afterplay

**Riff makes chat part of the show. Afterplay turns what happens into memory, content, and the next growth experiment.**

Afterplay is a live-to-growth system for gaming creators. Its audible AI cohost, Riff, listens to the streamer, reads chat, receives gameplay context, and joins the show with a creator-configured personality. The useful moments do not disappear when the stream ends: Afterplay carries their sources into highlights, community memory, experiment evidence, and the next show idea.

This repository is a working prototype for the Garena AI Build Challenge 2026. The central judge path is a live Roblox obby performance with transparently simulated chat, an audible cohost, and a post-stream continuity debrief.

`accepted experiment -> live moment -> Riff intervention -> highlight and memory -> experiment evidence -> next experiment`

## What the prototype proves

- A creator can accept one stream experiment and tune Riff's personality, roast intensity, and talk frequency.
- A deterministic rehearsal mode produces two repeatable comedy beats: a fail roast and a multi-message chat pile-on.
- The desktop companion captures the selected game window, sends bounded image snapshots into an OpenAI Realtime session, listens through the microphone, plays Riff's speech, and drives the OBS HUD.
- Free conversation stays out of the evidence ledger. A Riff reply becomes highlight, memory, or experiment evidence only when it answers a supplied, source-bearing show-context packet.
- Riff can stay silent when a supplied moment has no useful setup.
- Every useful turn retains source references and can become a semantic highlight, candidate viewer memory, and experiment evidence.
- Ending the stream proposes a materially connected next experiment.
- A stable OBS-safe browser source renders Riff's permanent nameplate, stateful waveform, and live captions without Afterplay application chrome.
- Live-model failure remains visible; the application never disguises deterministic fixture output as live AI.

## Quick start

Requirements: Node.js `>=20.9.0`, npm, and a macOS demo machine. The Electron architecture is cross-platform, but this checkout has only been manually rehearsed on macOS.

```bash
npm install
npm run companion:dev
```

`companion:dev` reuses an existing Afterplay server on port `3100`, or starts one, then opens the compact Riff desktop companion. Live Riff requires `OPENAI_API_KEY` in `.env.local`. macOS will request microphone and screen-recording access the first time.

## Five-minute judge path

1. Add `http://127.0.0.1:3100/overlay/riff` to OBS once as a `1280 x 720` Browser Source. The Riff HUD stays visible for the whole stream.
2. Run `npm run companion:dev`; the compact desktop companion opens outside the Afterplay dashboard.
3. Click **Choose**, select the Roblox window, and confirm **Game vision active**.
4. Click **Start Riff**, grant microphone/screen access, and wait for **Riff is listening**.
5. Play Roblox and talk naturally. The companion sends a bounded current-frame snapshot every five seconds; Riff's returned audio plays from the companion while its state, waveform, and transcript update in OBS.
6. After the live proof, use Afterplay's debrief path to explain how source-bearing show moments become highlights, memory, and experiment evidence. Spontaneous conversation alone is deliberately not promoted into that ledger.

The complete OBS wiring and rehearsal checklist live in [docs/submission/OBS_REHEARSAL.md](docs/submission/OBS_REHEARSAL.md).

## Runtime modes

### Live AI

Set a server-only key in `.env.local`:

```text
OPENAI_API_KEY=your_server_only_key
```

Then run `npm run companion:dev`, choose a game window, and grant microphone/screen permission. The Electron renderer establishes a WebRTC session through the Afterplay server, sends microphone audio continuously, and adds a resized JPEG snapshot of only the selected game window every five seconds. Each new snapshot replaces the previous visual-context item. This is periodic image context, not raw video streaming. Automatic Twitch/YouTube chat ingestion is still pending.

### Demo rehearsal

The fallback mode is deterministic, offline, schema-validated, and audible through the browser's speech synthesizer. It is the reliable backup and automated-test path. The interface labels it **Deterministic Riff**.

## OBS sources

Use this stable URL once in OBS:

- `http://127.0.0.1:3100/overlay/riff` for the permanent transparent Riff HUD and captions.

OBS owns the Roblox capture, facecam, creator microphone, Riff application-audio capture, and final scene composition. The desktop companion handles Riff, game context, and overlay state; it is not a replacement streaming studio or an OBS plugin.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

The public suite verifies the live-session lifecycle, grounding and abstention, both comedy beats, visible mode boundaries, failure without hidden fallback, OBS-safe overlays, live-to-debrief UI path, the earlier experiment workflow, accessibility, and mobile overflow.

## Truth boundary

- The gameplay is live during a manual rehearsal; the automated browser tests do not launch Roblox or OBS.
- Chat is scripted-but-reactive and labelled **Simulated** wherever it appears.
- Demo rehearsal speech is a deterministic fixture, not model output.
- Live AI requires an external credential, network access, microphone permission, headphones, and a manual audio-routing check.
- The companion sends periodic selected-window snapshots to Realtime. Automated tests verify the image event; actual Roblox capture and model interpretation remain manual rehearsal gates.
- The desktop companion does not yet ingest Twitch/YouTube chat. The scripted chat path remains available on `/live` for deterministic rehearsal while the companion integration is built next.
- Memories remain reviewable candidates, and seeded in-process state is not durable production storage.
- Final clips may exclude Riff. Riff contributes the timestamp, context, and experiment meaning.
- No sample run proves creator growth, retention, or burnout reduction.

## Documentation map

- [Product contract](docs/product/PRODUCT.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [AI contract](docs/AI.md)
- [Accepted public test seams](docs/testing/TEST-SEAMS.md)
- [Five-minute demo contract](docs/submission/DEMO_CONTRACT.md)
- [OBS rehearsal runbook](docs/submission/OBS_REHEARSAL.md)
- [Riff architecture decision](docs/decisions/0004-riff-connects-the-live-show-to-afterplay.md)
- [Third-party and synthetic asset ledger](docs/THIRD_PARTY.md)
