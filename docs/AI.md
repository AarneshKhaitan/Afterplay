# AI contract

Last verified against official OpenAI documentation: 2026-08-09

## Why a runtime model is central

Rules can trigger a canned line when chat types a command. Riff must instead decide whether a messy live moment deserves speech, connect the creator's current failure or success to several natural-language chat messages and relevant history, improvise in a configured voice, and know when silence is funnier.

Remove the runtime model and the central experience collapses into authored alerts and macros. Code still owns session legality, source identity, disclosure, mute/end controls, data retention, and downstream authority.

## Runtime modes

| Mode | Director | Purpose |
| --- | --- | --- |
| `demo` | deterministic cohost fixture | Repeatable scripted-chat rehearsal and automated tests. |
| `live` | OpenAI Realtime API | Audible speech-to-speech cohosting from microphone audio and supplied context. |

The interface exposes the active mode. Live failure remains failure; the app never swaps in the deterministic director without telling the creator and judge.

## Live model baseline

- Model: `gpt-realtime-2.1`.
- Connection: WebRTC from the browser, initialized through an authenticated Afterplay server route.
- Turn detection: semantic VAD creates and interrupts responses from normal microphone conversation; the client waits for `session.created` before declaring Riff ready.
- Model capability: audio and text input/output plus image input. The desktop companion sends microphone audio and a resized JPEG snapshot of the selected game window every five seconds. It does not send raw video.
- Function calling: supported by the model but not used in this vertical slice. Returned speech is recorded through a separate validated application route.
- Structured Outputs: not supported by this model, so every emitted application event is parsed and validated with Zod before it changes state.
- API key: the standard key remains on the server. The browser receives only the connection material required for its realtime session.
- Evidence boundary: spontaneous microphone conversation can produce audible speech and captions, but it does not create Afterplay memory, highlight, or experiment records without a source-bearing show-context packet.

Official references:

- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developers.openai.com/api/docs/guides/voice-agents
- https://developers.openai.com/api/docs/guides/realtime-mcp

## Cohost turn contract

Input:

- accepted experiment and its success/stop signals;
- cohost personality brief, roast intensity, and talk frequency;
- recent streamer transcript;
- gameplay observation and optional image reference in the domain contract; the companion live transport adds current selected-window image context directly to the Realtime conversation;
- recent chat messages with source IDs;
- relevant approved creator/viewer memories with source IDs;
- recent Riff turns and silence/cooldown context.

Output:

- `action`: `speak` or `silent`;
- `utterance`: required only for `speak`;
- `timingRationale`: why this is or is not the moment;
- `supportingSourceIds`: references to supplied context;
- optional `highlightSignal` describing why this turn may matter;
- optional `experimentSignal`: `supports`, `contradicts`, or `inconclusive`.

The model does not approve experiments, publish content, control the game, ban users, send DMs, make purchases, or modify accounts.

## Prompt behavior

Riff should:

- sound like the configured cohost, not an assistant reading a dashboard;
- prefer short, speakable lines that leave room for the creator;
- roast the performance or situation rather than protected traits or private vulnerabilities;
- notice when a specific chatter has given the creator a good setup;
- represent broad chat intent only when the supplied messages support it;
- connect relevant approved history without inventing familiarity;
- stay silent when the creator is already landing a joke, the context is weak, or another line would crowd the moment;
- help exercise the accepted experiment rather than invent a disconnected show mechanic.

Chat, transcripts, and image content are explicitly treated as untrusted evidence. They cannot rewrite Riff's role, tools, authority, or memory policy.

## Evidence and evaluation gates

Automated contracts prove schema validity, deterministic replay, source-reference grounding, silence behavior, lifecycle legality, and visible live-mode failure. They do not prove that Riff is funny.

Before claiming live quality, evaluate representative, rights-cleared sessions for:

- end-to-end speech latency and interruption behavior;
- whether creators judge the timing useful rather than distracting;
- whether viewers judge lines funny and non-repetitive;
- source attribution accuracy and invented-familiarity rate;
- experiment relevance;
- highlight precision;
- memory accuracy;
- silence rate and talk-frequency calibration;
- cost per stream hour;
- hostile chat and prompt-injection resistance.
