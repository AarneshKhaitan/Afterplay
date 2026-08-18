/** Packaging feature detection.
 *
 * These are the levers a creator can actually pull on the next upload: how the title is
 * built, how long the video runs, whether it names a person or a game. Each one is
 * detected from real scraped text, then `metrics.featureLifts` measures whether it is
 * associated with better reach *for this specific channel set* — never against an
 * absolute benchmark, because a "good" CTR pattern on a 4M-sub channel and on a 400-sub
 * channel are not the same thing.
 *
 * Deliberately conservative: a feature that fires on everything measures nothing, and a
 * feature that fires on two videos cannot support a claim. `metrics` marks low-sample
 * rows unreliable rather than hiding them.
 */

export type FeatureDef = {
  id: string;
  label: string;
  /** What the creator would actually change to adopt it. Surfaced in the UI. */
  hint: string;
  test: (input: { title: string; lower: string; description: string; durationSeconds: number | null }) => boolean;
};

/** Words that signal a reaction/first-time framing across gaming content. */
const REACTION = /\b(reacts?|reaction|first time|blind|playing for the first time)\b/i;
const CHALLENGE =
  /\b(challenges?|100\s*days?|24\s*hours?|speedruns?|impossible|hardcore|nightmare)\b/i;
const EXPLICIT_CONSTRAINT =
  /\bbut\s+only\b|\bonly\s+(?:using|with|allowed)\b|\bonly\s+one\s+(?:block|life|weapon|item|chance)\b|\bwithout\s+(?:weapons?|guns?|healing|taking\s+damage|dying|jumping|building|armor|upgrades?|items?|kills?)\b|\bno\s+(?:weapons?|guns?|healing|damage|deaths?|dying|jumping|building|armor|upgrades?|items?|kills?)\b/i;
const SUPERLATIVE = /\b(best|worst|greatest|craziest|insane|epic|ultimate|perfect|fastest)\b/i;
const CURIOSITY = /\b(secret|nobody|no one|why|how|what happens|truth|mistake|actually|finally)\b/i;
const COMMON_TITLE_ACRONYMS = new Set([
  "COD",
  "CPU",
  "DLC",
  "FPS",
  "GPU",
  "GTA",
  "HUD",
  "MMO",
  "MMORPG",
  "NPC",
  "OBS",
  "PC",
  "PS5",
  "PVP",
  "PVE",
  "RAM",
  "RPG",
  "RTX",
  "UFC",
  "WWE",
]);

function hasCapsEmphasis(title: string): boolean {
  const tokens = title.match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? [];
  return tokens.some((token) => !COMMON_TITLE_ACRONYMS.has(token));
}

export const FEATURES: FeatureDef[] = [
  {
    id: "title_question",
    label: "Question in title",
    hint: "Frame the title as a question the viewer wants answered.",
    test: ({ title }) => title.includes("?"),
  },
  {
    id: "title_number",
    label: "Number in title",
    hint: "Lead with a concrete count or figure.",
    test: ({ title }) => /(^|\s|\()\d{1,4}(\s|$|\)|%|x|k|m)/i.test(title),
  },
  {
    id: "title_caps",
    label: "ALL-CAPS emphasis",
    hint: "Put one word in caps to carry the emphasis.",
    test: ({ title }) => hasCapsEmphasis(title),
  },
  {
    id: "title_bracket",
    label: "Bracketed tag",
    hint: "Add a bracketed qualifier, e.g. [FULL RUN] or (Part 2).",
    test: ({ title }) => /[[(][^\])]{2,24}[\])]/.test(title),
  },
  {
    id: "title_versus",
    label: "Versus / comparison",
    hint: "Pit two things against each other in the title.",
    test: ({ lower }) => /\bvs\.?\b|\bversus\b/.test(lower),
  },
  {
    id: "title_reaction",
    label: "Reaction / first-time framing",
    hint: "Say it is your first time, or that you are reacting.",
    test: ({ lower }) => REACTION.test(lower),
  },
  {
    id: "title_challenge",
    label: "Constraint or challenge",
    hint: "Impose a rule: 'but only…', 'no…', a time limit.",
    test: ({ lower }) => CHALLENGE.test(lower) || EXPLICIT_CONSTRAINT.test(lower),
  },
  {
    id: "title_superlative",
    label: "Superlative",
    hint: "Claim a strongest/worst/first — and then deliver it.",
    test: ({ lower }) => SUPERLATIVE.test(lower),
  },
  {
    id: "title_curiosity",
    label: "Curiosity gap",
    hint: "Withhold the payoff the title points at.",
    test: ({ lower }) => CURIOSITY.test(lower),
  },
  {
    id: "title_emoji",
    label: "Emoji in title",
    hint: "Add one emoji as a visual anchor in the results list.",
    test: ({ title }) => /\p{Extended_Pictographic}/u.test(title),
  },
  {
    id: "title_short",
    label: "Short title (≤ 40 chars)",
    hint: "Cut the title so it never truncates on mobile.",
    test: ({ title }) => title.length > 0 && title.length <= 40,
  },
  {
    id: "title_long",
    label: "Long title (> 70 chars)",
    hint: "Longer titles carry more keywords but truncate in feed.",
    test: ({ title }) => title.length > 70,
  },
  {
    id: "dur_under_5m",
    label: "Under 5 minutes",
    hint: "Keep the edit under five minutes.",
    test: ({ durationSeconds }) => durationSeconds !== null && durationSeconds > 60 && durationSeconds < 300,
  },
  {
    id: "dur_5_15m",
    label: "5–15 minutes",
    hint: "Target the 5–15 minute band.",
    test: ({ durationSeconds }) => durationSeconds !== null && durationSeconds >= 300 && durationSeconds < 900,
  },
  {
    id: "dur_15_40m",
    label: "15–40 minutes",
    hint: "Go long-form: 15–40 minutes.",
    test: ({ durationSeconds }) => durationSeconds !== null && durationSeconds >= 900 && durationSeconds < 2400,
  },
  {
    id: "dur_over_40m",
    label: "Over 40 minutes",
    hint: "Full-session uploads over 40 minutes.",
    test: ({ durationSeconds }) => durationSeconds !== null && durationSeconds >= 2400,
  },
  {
    id: "desc_links",
    label: "Links in description",
    hint: "Put your live/socials links in the description.",
    test: ({ description }) => /https?:\/\//.test(description),
  },
  {
    id: "desc_long",
    label: "Detailed description",
    hint: "Write a real description, not one line.",
    test: ({ description }) => description.trim().length > 300,
  },
];

export const FEATURE_BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

export function extractFeatures(
  title: string,
  description: string,
  durationSeconds: number | null,
): string[] {
  const input = { title, lower: title.toLowerCase(), description, durationSeconds };
  return FEATURES.filter((feature) => {
    try {
      return feature.test(input);
    } catch {
      return false;
    }
  }).map((feature) => feature.id);
}

export function featureLabel(id: string): string {
  return FEATURE_BY_ID.get(id)?.label ?? id;
}

export function featureHint(id: string): string {
  return FEATURE_BY_ID.get(id)?.hint ?? "";
}
