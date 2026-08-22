"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { WorkspaceMode } from "@/domain/workspace";

export function ModeToggle({
  mode,
  locked,
}: Readonly<{
  mode: WorkspaceMode;
  locked: boolean;
}>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextMode: WorkspaceMode = mode === "live" ? "demo" : "live";

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Workspace mode could not be changed.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace mode could not be changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className={`mode-block mode-block--${mode}`}>
        <span className="mode-dot" aria-hidden="true" />
        <span>
          <strong>{mode === "live" ? "Live workspace" : "Demo workspace"}</strong>
          <small>{locked ? `Locked to ${mode}` : "Browser profile setting"}</small>
        </span>
      </div>
      <button
        className="team-button"
        type="button"
        onClick={toggle}
        disabled={pending || locked}
        aria-label={locked ? `Workspace mode locked to ${mode}` : `Switch to ${nextMode} workspace`}
      >
        <ArrowsClockwise weight="bold" aria-hidden="true" />
        {locked ? "Mode locked" : pending ? "Switching…" : `Switch to ${nextMode}`}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
