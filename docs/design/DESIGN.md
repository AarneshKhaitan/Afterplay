# Product design contract

Last updated: 2026-08-05

## Design read

Reading this as a desktop-first creator operations product for gaming creators and hackathon judges, with a calm premium operational language, leaning toward a customised accessible React component foundation, precise typography, restrained motion, and creator-specific colour.

## Design dials

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 4`
- `VISUAL_DENSITY: 7`

The interface should feel operational and considered, not sparse marketing and not a cramped analytics cockpit.

## Visual system

- Graphite or cool neutral foundation with one creator-specific accent.
- One theme across the application; no arbitrary light/dark section inversion.
- Characterful but highly readable sans typography. Avoid generic system defaults.
- Phosphor icons with one shared weight and optical size.
- Consistent corner-radius and elevation rules.
- Cards only when containment or elevation communicates real hierarchy.
- Motion communicates working state, hierarchy, feedback, or state transition.
- Loading, empty, error, approval, and completed states are designed, not omitted.

## Product shell

- Persistent desktop navigation for HQ, Experiments, Studio, Audience, Memory, and Integrations.
- Creator/account switcher establishes that the platform serves more than the demo account.
- Selected creator identity personalizes colour, imagery, language, and content without changing the information architecture.
- A persistent "Talk to the team" control is secondary to structured work.

## Growth HQ hierarchy

1. Current diagnosis and active experiment.
2. Returning-audience movement.
3. Work the team is doing autonomously.
4. Decisions requiring creator authority.
5. Latest learning and next move.

## Anti-patterns

- No AI-purple glow, neon gaming shell, glass on every surface, or decorative sci-fi chrome.
- No fixture-specific navigation or bespoke metaphors that stop making sense for another creator.
- No equal-card feature dump pretending to be a platform.
- No generic fake precision without a visible sample-data label.
- No chat-first interface that hides durable decisions in a transcript.
- No dead controls or placeholder pages on the judge path.
- No decorative motion that obscures information or ignores reduced-motion preferences.

## Skill boundary

The installed `design-taste-frontend` skill explicitly excludes dashboards and multi-step product UI. Its anti-slop, typography, colour, accessibility, state, and motion checks apply here. Its landing-page layout rules do not define the Afterplay product shell.
