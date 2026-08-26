"use client";

import { useState } from "react";

/** Switch between replaying a cached run and doing the real thing.
 *
 * It lives in the top bar because the choice changes mid-demo: replay the Sidemen run
 * that already exists, then switch to Live and build memory for a channel nobody has
 * seen. Waiting on a rebuild between those two is not an option on stage.
 *
 * The label states which mode is active, not which one the button would switch to --
 * a control that reads "Live" while replaying is exactly the ambiguity to avoid here.
 */
export function DemoReplayToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    // Optimistic: the switch should feel instant on stage. A failure puts it back.
    setEnabled(next);
    try {
      const response = await fetch("/api/demo-replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error("rejected");
      // Server components read the cookie, so the pages that branch on it need a fresh
      // render rather than a client-side state change.
      window.location.reload();
    } catch {
      setEnabled(!next);
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={`replay-toggle${enabled ? " replay-toggle--replay" : ""}`}
      onClick={toggle}
      disabled={saving}
      aria-pressed={enabled}
      title={enabled
        ? "Buttons replay the newest cached run. Click to run for real."
        : "Buttons start real runs — minutes of work, and they spend credits. Click to replay instead."}
    >
      <span aria-hidden="true" />
      {enabled ? "Cached replay" : "Live runs"}
    </button>
  );
}
