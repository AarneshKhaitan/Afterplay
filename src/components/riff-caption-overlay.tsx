"use client";

import { Microphone } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type OverlaySession = {
  status: "live" | "ended";
  cohost: {
    name: string;
  };
  presence: {
    state: "listening" | "thinking" | "speaking";
    caption?: string;
  };
};

export function RiffCaptionOverlay({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<OverlaySession | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(`/api/live/sessions/${sessionId}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setSession(body.session);
      } catch {
        // A missing local session leaves the OBS source transparently empty.
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.documentElement.classList.remove("overlay-document");
    };
  }, [sessionId]);

  const presence = session?.status === "live" ? session.presence : null;
  const line = presence?.state === "speaking"
    ? presence.caption
    : null;
  const state = presence?.state ?? "listening";

  return (
    <main className="riff-overlay" aria-label="Riff caption overlay">
      <section
        className={`riff-overlay-hud riff-overlay-hud--${state}`}
        aria-label="Riff stream HUD"
        data-state={state}
      >
        <div className="riff-overlay-participant">
          <span className="riff-overlay-avatar" aria-hidden="true">R</span>
          <span className="riff-overlay-nameplate">
            <strong>{session?.cohost.name ?? "Riff"}</strong>
            <small>AI cohost</small>
          </span>
          <Microphone className="riff-overlay-microphone" aria-hidden="true" weight="fill" />
        </div>
        {line && (
          <div className="riff-overlay-caption">
            <p aria-live="polite">{line}</p>
          </div>
        )}
      </section>
    </main>
  );
}
