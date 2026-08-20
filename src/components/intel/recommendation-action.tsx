"use client";

import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Recommendation } from "@/domain/intel/types";

type Props = {
  scanId: string;
  recommendation: Recommendation;
};

export function RecommendationAction({ scanId, recommendation }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createExperiment() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/experiments/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation: {
            scanId,
            key: recommendation.key,
            title: recommendation.title,
            action: recommendation.action,
            rationale: recommendation.rationale,
            expectedSignal: recommendation.expectedSignal,
            confidence: recommendation.confidence,
            effort: recommendation.effort,
            evidence: recommendation.evidence,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Could not create a live experiment.");
      }
      router.push("/experiments/live_current");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a live experiment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rec-action-row">
      <button
        type="button"
        className="primary-small"
        onClick={createExperiment}
        disabled={pending}
      >
        {pending ? "Creating..." : "Create live experiment"} <ArrowRight weight="bold" />
      </button>
      {error ? (
        <span className="rec-action-error" role="alert">
          <WarningCircle weight="fill" /> {error}
        </span>
      ) : null}
    </div>
  );
}
