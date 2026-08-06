"use client";

import { ArrowClockwise } from "@phosphor-icons/react";
import { useState } from "react";

export function ResetDemoButton() {
  const [state, setState] = useState<"idle" | "pending" | "complete" | "error">("idle");

  async function reset() {
    setState("pending");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("reset_failed");
      setState("complete");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="reset-control" aria-live="polite">
      <button type="button" onClick={reset} disabled={state === "pending"}>
        <ArrowClockwise weight="bold" />
        {state === "pending" ? "Resetting…" : "Reset demo workspace"}
      </button>
      {state === "complete" ? <span>Demo workspace reset</span> : null}
      {state === "error" ? <span className="form-error" role="alert">Reset failed. No state was changed.</span> : null}
    </div>
  );
}
