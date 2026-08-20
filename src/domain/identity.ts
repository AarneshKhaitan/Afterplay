import { defaultCreatorId, listCreators } from "./creators";

/** Who the workspace is actually for, and what the server is actually configured to do.
 *
 * Both were previously hardcoded in the markup: the UI said "Mika Rao" in nine places
 * regardless of configuration, and Integrations claimed live AI was "Not configured"
 * while the server had a key and `AFTERPLAY_ENABLE_LIVE_AI=true`. A panel that reports
 * the opposite of the truth is worse than no panel, so both now read the environment.
 *
 * Server-only in practice — it reads `process.env` — but it touches no `node:` modules,
 * so it is safe to import from a server component that also renders client children. */

export type ActiveCreator = {
  /** Creator id the Python clipper uses for channel memory (`AFTERPLAY_MEMORY/<id>`). */
  clipperCreatorId: string;
  displayName: string;
  initials: string;
  /** Where the identity came from, so the UI never implies configuration that is absent. */
  source: "configured" | "workspace" | "cold start";
};

function titleCase(id: string): string {
  return id
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function activeCreator(): ActiveCreator {
  const creatorId = defaultCreatorId();
  const creator = listCreators().find((candidate) => candidate.id === creatorId);
  const displayName = creator?.displayName ?? titleCase(creatorId);
  return {
    clipperCreatorId: creatorId,
    displayName,
    initials: displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
    source: process.env.AFTERPLAY_CREATOR_ID?.trim()
      ? "configured"
      : creator
        ? "workspace"
        : "cold start",
  };
}

export type LiveAiState = {
  /** The flag the server actually runs on. */
  enabled: boolean;
  /** Whether a key is present. Never the key itself. */
  keyPresent: boolean;
  model: string;
  /** True only when a live request can actually succeed. */
  usable: boolean;
  reason: string;
};

export function liveAiState(): LiveAiState {
  const enabled = process.env.AFTERPLAY_ENABLE_LIVE_AI === "true";
  const keyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());
  const model = process.env.AFTERPLAY_OPENAI_MODEL?.trim() || "gpt-5.6-sol";
  const usable = enabled && keyPresent;

  const reason = usable
    ? "Live planning will call the model and validate the response."
    : !enabled && !keyPresent
      ? "AFTERPLAY_ENABLE_LIVE_AI is not true and no OPENAI_API_KEY is set."
      : !enabled
        ? "A key is present, but AFTERPLAY_ENABLE_LIVE_AI is not true."
        : "Live AI is enabled, but no OPENAI_API_KEY is set — live requests will fail visibly.";

  return { enabled, keyPresent, model, usable, reason };
}
