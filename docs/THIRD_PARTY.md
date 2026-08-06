# Third-party and synthetic asset disclosure

Last updated: 2026-08-05

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
| Manrope variable font | 5.3.0 | OFL-1.1 | Self-hosted product typography. |
| Playwright Test | 1.62.1 | Apache-2.0 | Browser, HTTP, and production-mode contracts. |
| axe-core Playwright | 4.12.1 | MPL-2.0 | Automated WCAG A/AA checks. |
| TypeScript | 5.9.3 | Apache-2.0 | Static typing. |
| ESLint | 9.39.5 | MIT | Static source checks. |

Transitive packages and integrity hashes are recorded in `package-lock.json`.

## External services

- OpenAI Responses API in optional live mode.
- Simulated YouTube Shorts, TikTok, and Instagram Reels distribution adapters in demo mode.
- No real social account credentials, public posting, or private creator archive leaves the judge environment by default.

## Truth rules

- Synthetic identities and media remain labelled sample data.
- Simulated platform receipts and results are not represented as live provider responses.
- The active AI mode and model are visible.
- No third-party media is added without provenance, applicable licence, and intended-use review.
