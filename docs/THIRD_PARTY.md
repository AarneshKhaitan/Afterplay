# Third-party and synthetic asset disclosure

Last updated: 2026-08-21

This ledger must be updated whenever a library, model, API, dataset, media source, font, or generated asset enters the repository.

## Synthetic project media

The following images were generated specifically for the Afterplay prototype with OpenAI's built-in image-generation tool. They do not depict a real creator or an existing game.

| File | Purpose | SHA-256 | Disclosure |
| --- | --- | --- | --- |
| `public/media/mika-avatar.png` | Fictional sample creator avatar | `39919c3cf4ef3847ccb0ae57ba4879bef9d29c1c56f7d836e88c4e8b157850e9` | Synthetic fictional person named Mika Rao. |
| `public/media/rivetfall-one-more-rule.png` | Fictional gameplay and Studio media | `98d0f78a9ef42f0f51e4ef82e1f88426dff6a78c9cf9ab52e72339975eaaf546` | Synthetic fictional game called Rivetfall. |

Exact prompts are recorded in [`assets/IMAGE_PROMPTS.md`](assets/IMAGE_PROMPTS.md).

## Direct runtime and verification dependencies

Versions below are resolved by `package-lock.json` on 5 August 2026.

| Component | Version | Licence | Purpose |
| --- | ---: | --- | --- |
| Next.js | 16.3.0 | MIT | App Router product and public route handlers. |
| React / React DOM | 19.2.8 | MIT | Interface runtime. |
| OpenAI JavaScript SDK | 7.4.0 | Apache-2.0 | Optional server-only live strategy director. |
| Zod | 4.4.3 | MIT | Public request, model output, and domain-boundary validation. |
| Phosphor React icons | 2.1.10 | MIT | Product iconography. |
| Manrope variable font | 5.3.0 | OFL-1.1 | Self-hosted product typography (UI/body face). |
| Fraunces variable font | 5.3.0 | OFL-1.1 | Self-hosted product typography (display face). |
| Space Mono | 5.3.0 | OFL-1.1 | Self-hosted product typography (mono face). |
| Playwright Test | 1.62.1 | Apache-2.0 | Browser, HTTP, and production-mode contracts. |
| axe-core Playwright | 4.12.1 | MPL-2.0 | Automated WCAG A/AA checks. |
| TypeScript | 5.9.3 | Apache-2.0 | Static typing. |
| ESLint | 9.39.5 | MIT | Static source checks. |
| Electron | 43.3.0 | MIT | Desktop shell for the Riff companion (`electron/main.mjs`, `npm run companion`). |

Transitive packages and integrity hashes are recorded in `package-lock.json`.

## Python clipper dependencies

Versions below are minimums from `services/video-clipper/requirements.txt` and
`pyproject.toml`; exact installed versions are resolved by the operator's Python
environment.

| Component | Version | Licence | Purpose |
| --- | ---: | --- | --- |
| yt-dlp | >=2026.8.19 | Unlicense | Metadata, captions, heatmaps, and direct stream URL resolution without downloading full video. |
| OpenCV / opencv-python | >=4.9 | Apache-2.0 | Frame sampling, saliency, subject tracking, and QC measurements. |
| numpy | >=1.26 | BSD-3-Clause | Audio/frame numeric analysis and scoring support. |
| imageio-ffmpeg | >=0.5 | BSD-2-Clause | Bundled ffmpeg binary fallback when system ffmpeg is unavailable. |
| ffmpeg | system or imageio bundled | LGPL/GPL depending build | Range extraction, transcode, caption burn-in, loudness normalization, and probing. |
| OpenAI Python SDK | >=1.50 | Apache-2.0 | Optional callback thread extraction, callback judging, and embeddings. |
| pytest | >=8 | MIT | Python service regression tests. |
| faster-whisper | optional >=1.0 | MIT | Optional ASR fallback when sources have no captions. |
| Anthropic Python SDK | optional >=0.40 | MIT | Optional legacy `--llm` ranking and vision QC policy. |
| mcp Python SDK | optional >=1.2 | MIT | Optional MCP server transport. |

## Models and remote assets

| Component | Provider | Purpose | Disclosure |
| --- | --- | --- | --- |
| `text-embedding-3-small` | OpenAI | Semantic retrieval over stored creator threads. | Called only when callback memory is enabled. |
| `AFTERPLAY_CLIPPER_MODEL` | OpenAI Responses API | Thread extraction and callback/payoff judgment for the Python clipper. | Defaults to `gpt-5.6-sol`; operator-configurable. |
| `AFTERPLAY_OPENAI_MODEL` | OpenAI Responses API | Optional web app live strategy director. | Defaults to `gpt-5.6-sol`; separate from the clipper model. |
| YuNet face detection ONNX | OpenCV Zoo | Optional face-aware reframing when the model is downloaded. | Downloaded on demand from OpenCV's public model host; saliency fallback works without it. |

## External services

- OpenAI Responses API in optional live strategy mode and optional callback-memory mode.
- Apify (YouTube channel/video scrapers) in the optional competitive-intelligence engine (`/intel`); requires `APIFY_API_TOKEN` and is disabled without it. Scanned data stays in the local `.intel/` store.
- OpenAI Responses API (`AFTERPLAY_INTEL_MODEL`) for intel analysis and the grounded strategist chat.
- Simulated YouTube Shorts, TikTok, and Instagram Reels distribution adapters, available in every workspace (live included); only resetting the demo workspace stays demo-gated.
- No real social account credentials, public posting, or private creator archive leaves the judge environment by default.

## Truth rules

- Synthetic identities and media remain labelled sample data.
- Simulated platform receipts and results are not represented as live provider responses.
- The active AI mode and model are visible.
- No third-party media is added without provenance, applicable licence, and intended-use review.
