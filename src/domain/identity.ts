/** Who the workspace is actually for, and what the server is actually configured to do.
 *
 * Both were previously hardcoded in the markup: the UI said "Mika Rao" in nine places
 * regardless of configuration, and Integrations claimed live AI was "Not configured"
 * while the server had a key and `AFTERPLAY_ENABLE_LIVE_AI=true`. A panel that reports
 * the opposite of the truth is worse than no panel, so both now read the environment.
 *
 * Server-only in practice — it reads `process.env` — but it touches no `node:` modules,
 * so it is safe to import from a server component that also renders client children. */

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
