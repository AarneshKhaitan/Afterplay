"use client";

import { CaretDown, Check } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type CreatorOption = {
  id: string;
  displayName: string;
  handle: string;
  initials: string;
  threads: number;
  streams: number;
};

export function CreatorSwitcher({
  active,
  creators,
}: Readonly<{ active: CreatorOption; creators: CreatorOption[] }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function select(id: string) {
    if (id === active.id) { setOpen(false); return; }
    setPending(id);
    try {
      await fetch("/api/creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setOpen(false);
      // Server components read the cookie, so the whole workspace re-renders for the
      // newly selected creator rather than only this control changing.
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="creator-menu">
      <button type="button" className="creator-switcher" aria-label="Creator workspace"
        aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((v) => !v)}>
        <span className="creator-avatar-mark">{active.initials}</span>
        <span className="creator-copy">
          <strong>{active.displayName}</strong>
          <small>{active.threads} {active.threads === 1 ? "thread" : "threads"} remembered</small>
        </span>
        <CaretDown aria-hidden="true" />
      </button>

      {open ? (
        <div className="creator-popover">
          <p>Creator workspaces</p>
          {/* Only options may live inside a listbox, so the heading and the note sit
              outside it rather than tripping aria-required-children. */}
          <div role="listbox" aria-label="Creator workspaces" className="creator-option-list">
            {creators.map((creator) => (
              <button key={creator.id} type="button" role="option"
                aria-selected={creator.id === active.id}
                className={creator.id === active.id ? "account-row account-row--active" : "account-row"}
                onClick={() => select(creator.id)} disabled={pending !== null}>
                <span className="account-avatar">{creator.initials}</span>
                <span>
                  <strong>{creator.displayName}</strong>
                  <small>
                    {creator.threads > 0
                      ? `${creator.threads} threads from ${creator.streams} ${creator.streams === 1 ? "stream" : "streams"}`
                      : "No memory yet · cold start"}
                  </small>
                </span>
                {creator.id === active.id ? <Check weight="bold" /> : null}
              </button>
            ))}
          </div>
          <p className="creator-popover-note">
            Memory is per creator. Switching changes which history the clipper searches
            and which results feed back into ranking.
          </p>
        </div>
      ) : null}
    </div>
  );
}
