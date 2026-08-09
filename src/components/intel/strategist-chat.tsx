"use client";

import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { SUGGESTED_QUESTIONS } from "@/domain/intel/suggestions";
import type { IntelMemory, ScanJob, VideoRecord } from "@/domain/intel/types";

type Turn = {
  role: "user" | "assistant";
  content: string;
  citedVideoIds?: string[];
  pending?: boolean;
};

/** The strategist.
 *
 * A chat surface is a real risk in a product like this: it is the easiest place for a
 * model to sound authoritative about numbers it does not have. Two things keep it
 * honest — the server grounds every answer in the actual corpus and memory, and any video
 * the answer cites is rendered here as a real link with real figures. An answer with no
 * citations looks visibly different from one with them.
 */
/** Render the model's inline formatting as React nodes.
 *
 * The model emits `**bold**` for the numbers that carry its argument and `[videoId]` for
 * citations. Rendered raw, the asterisks show literally and the ids read as noise — which
 * is exactly how a demo audience decides an answer is machine output rather than advice.
 *
 * Built as nodes rather than `dangerouslySetInnerHTML`: this string is model output
 * derived from scraped titles, so it is untrusted, and injecting it as HTML would make a
 * video title a script vector.
 */
function renderRich(text: string, byId: Map<string, VideoRecord>): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // One pass over both patterns so their positions cannot disagree.
  const pattern = /\*\*(.+?)\*\*|\[([A-Za-z0-9_-]{6,20})\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));

    if (match[1] !== undefined) {
      nodes.push(<strong key={`b${key++}`}>{match[1]}</strong>);
    } else {
      const id = match[2];
      const video = byId.get(id);
      // An id we cannot resolve is left as plain text rather than linked — a citation
      // that goes nowhere is worse than one that is visibly just a string.
      nodes.push(
        video ? (
          <a
            key={`c${key++}`}
            className="chat-inline-cite"
            href={video.url}
            target="_blank"
            rel="noreferrer"
            title={video.title}
          >
            {video.channelName}
          </a>
        ) : (
          <span key={`c${key++}`}>{match[0]}</span>
        ),
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function StrategistChat({
  creatorId,
  scan,
  memory,
}: {
  creatorId: string;
  scan: ScanJob | null;
  memory: IntelMemory;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const byId = new Map((scan?.channels ?? []).flatMap((c) => c.videos).map((v) => [v.id, v]));

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setError(null);
    setInput("");
    const history = turns.filter((t) => !t.pending).map(({ role, content }) => ({ role, content }));
    setTurns((current) => [
      ...current,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", pending: true },
    ]);
    setPending(true);

    try {
      const response = await fetch("/api/intel/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, question: trimmed, scanId: scan?.scanId, history }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The strategist could not answer.");
      setTurns((current) => [
        ...current.slice(0, -1),
        { role: "assistant", content: body.answer, citedVideoIds: body.citedVideoIds ?? [] },
      ]);
    } catch (caught) {
      setTurns((current) => current.slice(0, -1));
      setError(caught instanceof Error ? caught.message : "The strategist could not answer.");
    } finally {
      setPending(false);
    }
  }

  const videosInContext = scan?.channels.reduce((sum, c) => sum + c.videos.length, 0) ?? 0;

  return (
    <div className="strategist">
      <header className="strategist-id">
        <span className="strategist-avatar" aria-hidden="true">
          <Sparkle weight="fill" />
        </span>
        <div>
          <strong>Afterplay Strategist</strong>
          <span>
            Reading {videosInContext} scraped videos · recalling {memory.beliefs.length} beliefs
            across {memory.totals.scans} {memory.totals.scans === 1 ? "scan" : "scans"}
          </span>
        </div>
        <span className="strategist-live" aria-hidden="true">
          <i />
          grounded
        </span>
      </header>

      <div className="strategist-thread">
        {turns.length === 0 ? (
          <div className="strategist-empty">
            <h3>Ask it anything about your position</h3>
            <p>
              It has read every scraped video — titles, descriptions and transcripts — and it
              remembers what it concluded last time. Where the data cannot answer, it says so
              instead of guessing.
            </p>
            <ul className="suggestion-list">
              {SUGGESTED_QUESTIONS.map((question, index) => (
                <li key={question} style={{ animationDelay: `${index * 45}ms` }}>
                  <button type="button" onClick={() => void ask(question)} disabled={pending}>
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          turns.map((turn, index) => (
            <article key={index} className={`chat-turn chat-turn--${turn.role}`}>
              {turn.pending ? (
                <div className="chat-working" aria-live="polite">
                  <span className="chat-thinking" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="chat-working-text">
                    Reading {videosInContext} videos and {memory.beliefs.length} standing beliefs…
                  </span>
                </div>
              ) : (
                <>
                  <div className="chat-content">
                    {turn.content.split(/\n{2,}/).map((para, i) => (
                      <p key={i}>{renderRich(para, byId)}</p>
                    ))}
                  </div>
                  {turn.citedVideoIds && turn.citedVideoIds.length > 0 ? (
                    <ul className="chat-citations">
                      {turn.citedVideoIds.map((id) => {
                        const video = byId.get(id);
                        if (!video) return null;
                        return (
                          <li key={id}>
                            <a href={video.url} target="_blank" rel="noreferrer">
                              {video.title.length > 46 ? `${video.title.slice(0, 43)}…` : video.title}
                              <em>{video.outlierMultiple.toFixed(1)}x</em>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </>
              )}
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Keep the prompts reachable after the first answer. Hiding them the moment the
          conversation starts is the most common way a chat surface goes cold: the person
          who did not know what to ask still does not, and now has no affordance. */}
      {turns.length > 0 ? (
        <ul className="quick-asks">
          {SUGGESTED_QUESTIONS.filter(
            (question) => !turns.some((turn) => turn.content === question),
          )
            .slice(0, 3)
            .map((question) => (
              <li key={question}>
                <button type="button" onClick={() => void ask(question)} disabled={pending}>
                  {question}
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      <form
        className="strategist-input"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={pending ? "Thinking…" : "Ask about your channel, a competitor, or what to do next…"}
          aria-label="Ask the strategist"
          disabled={pending}
        />
        <button type="submit" className="primary-small" disabled={pending || !input.trim()}>
          <ArrowUp weight="bold" />
          <span className="visually-hidden">Send</span>
        </button>
      </form>
    </div>
  );
}
