"use client";

import { ChatCircleDots } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type ChatMessage = { id: string; username: string; text: string };

export function ChatFeedOverlay({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(`/api/live/sessions/${sessionId}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setMessages(body.session.recentChat ?? []);
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

  return (
    <section className="chat-overlay" role="region" aria-label="Simulated chat overlay">
      <header><ChatCircleDots aria-hidden="true" /><span>Chat</span><small>Simulated</small></header>
      <div className="chat-overlay-feed" aria-live="polite">
        {messages.map((message) => (
          <p key={message.id}><strong>{message.username}</strong><span>{message.text}</span></p>
        ))}
      </div>
    </section>
  );
}
