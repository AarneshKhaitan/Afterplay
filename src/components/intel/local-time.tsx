"use client";

import { useSyncExternalStore } from "react";

/** Subscribe/snapshot pair for "are we on the client yet".
 *
 * `useSyncExternalStore` is the supported way to render one thing on the server and
 * another after hydration: React uses the server snapshot for the hydrating pass, so the
 * trees match, then re-renders with the client snapshot. Doing this with
 * `useState` + `useEffect` produces the same result but is a setState-in-effect, which
 * the lint rule rejects for good reason.
 *
 * Defined at module scope so the identities are stable across renders. */
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** A timestamp that does not break hydration.
 *
 * `toLocaleString()` resolves against the *renderer's* locale and timezone. On the server
 * that is the host's; in the browser it is the visitor's. React compares the two and
 * reports a hydration mismatch, then throws away and re-renders the tree — which is both
 * a real console error and a visible flash on a dense page.
 *
 * So: render a stable, timezone-free string on the server and during the first client
 * pass, then upgrade to the visitor's local formatting in an effect, which runs only
 * after hydration has already matched.
 */
export function LocalTime({
  value,
  mode = "datetime",
  className,
}: {
  value: string;
  mode?: "datetime" | "time" | "date";
  className?: string;
}) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  const parsed = new Date(value);
  const valid = !Number.isNaN(parsed.getTime());

  const text =
    hydrated && valid
      ? mode === "time"
        ? parsed.toLocaleTimeString()
        : mode === "date"
          ? parsed.toLocaleDateString()
          : parsed.toLocaleString()
      : stableFormat(value, mode);

  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}

/** Deterministic UTC formatting — identical on every machine, so the first paint always
 * matches whatever the server sent. */
function stableFormat(value: string, mode: "datetime" | "time" | "date"): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const iso = parsed.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  if (mode === "date") return date;
  if (mode === "time") return `${time} UTC`;
  return `${date} ${time} UTC`;
}
