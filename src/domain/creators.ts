import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cookies } from "next/headers";
import { join } from "node:path";

import { listWorkspaces, memoryRoot } from "./creator-workspaces";

/** Server-only. Discovers real creator workspaces from channel memory on disk.
 *
 * The workspace identity used to be a hardcoded fixture ("Mika Rao") in nine places, and
 * the only way to change it was an env var that the UI ignored. Creators are now real
 * things: a creator exists because a channel memory directory exists for it, and the
 * thread count shown is the number of threads actually extracted from that channel. */

const COOKIE = "afterplay_creator";

export type CreatorProfile = {
  /** The id the Python clipper keys memory on: AFTERPLAY_MEMORY/<id>/threads.json */
  id: string;
  displayName: string;
  handle: string;
  initials: string;
  /** Threads actually extracted from this channel's history. 0 is a real answer. */
  threads: number;
  /** Streams this creator's memory was built from. */
  streams: number;
  /** Where the display name came from, so nothing implies more setup than exists. */
  known: boolean;
  /** Whether this workspace has a memory directory on disk yet. */
  hasMemory: boolean;
};

/** Display names for creators we have actually backfilled. Everything else is derived
 * from the id, so a new backfill shows up without a code change. */
const KNOWN: Record<string, { displayName: string; handle: string }> = {
  // The backfilled videos are MoreSidemen uploads (KSI appears in them, but the channel
  // is not his). Labelling this workspace "KSI" would misattribute someone else's
  // content, which is the same class of error as claiming rights we do not have.
  probe_ksi: { displayName: "Sidemen", handle: "Sidemen" },
  demo_live: { displayName: "Demo Live", handle: "demo_live" },
  e2e_demo: { displayName: "E2E Demo", handle: "e2e_demo" },
};

function titleCase(id: string): string {
  return id.replace(/[_-]+/g, " ").split(" ").filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

type StoredMention = {
  stream_id?: string;
  t?: number;
  quote?: string;
  verified?: boolean;
};

function verifiedMentions(thread: Record<string, unknown>): StoredMention[] {
  const candidates = [
    thread.first_seen,
    ...(Array.isArray(thread.mentions) ? thread.mentions : []),
  ];
  const seen = new Set<string>();
  const verified: StoredMention[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const mention = candidate as StoredMention;
    if (mention.verified !== true) continue;
    const key = `${mention.stream_id ?? ""}|${mention.t ?? ""}|${mention.quote ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(mention);
  }
  return verified;
}

function readThreads(dir: string): { threads: number; streams: number } {
  try {
    const raw = readFileSync(join(dir, "threads.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { threads: 0, streams: 0 };
    const streams = new Set<string>();
    let threads = 0;
    for (const thread of parsed as Array<Record<string, unknown>>) {
      const mentions = verifiedMentions(thread);
      if (!mentions.length) continue;
      threads += 1;
      for (const mention of mentions) {
        if (mention.stream_id) streams.add(mention.stream_id);
      }
    }
    return { threads, streams: streams.size };
  } catch {
    return { threads: 0, streams: 0 };
  }
}

export function listCreators(): CreatorProfile[] {
  const root = memoryRoot();
  const registry = new Map(listWorkspaces().map((workspace) => [workspace.id, workspace]));
  const directoryIds = new Set<string>();

  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      directoryIds.add(entry.name);
    }
  }

  const creatorIds = new Set([...directoryIds, ...registry.keys()]);
  const found = [...creatorIds].map((id): CreatorProfile => {
    const workspace = registry.get(id);
    const known = KNOWN[id];
    const displayName = workspace?.displayName ?? known?.displayName ?? titleCase(id);
    const hasMemory = directoryIds.has(id);
    const { threads, streams } = hasMemory
      ? readThreads(join(root, id))
      : { threads: 0, streams: 0 };
    return {
      id,
      displayName,
      handle: workspace?.handle || known?.handle || id,
      initials: initialsOf(displayName),
      threads,
      streams,
      known: Boolean(workspace || known),
      hasMemory,
    };
  });

  // Richest memory first: the creator with real history is the one worth demoing.
  found.sort((a, b) => b.threads - a.threads || a.id.localeCompare(b.id));
  return found;
}

/** A creator with no memory yet. Selecting it proves the cold-start path is honest
 * rather than hidden: no threads, so no callback can be claimed. */
export const GUEST: CreatorProfile = {
  id: "guest",
  displayName: "Guest",
  handle: "guest",
  initials: "GU",
  threads: 0,
  streams: 0,
  known: true,
  hasMemory: false,
};

export function defaultCreatorId(): string {
  const configured = process.env.AFTERPLAY_CREATOR_ID?.trim();
  if (configured) return configured;
  const first = listCreators()[0];
  return first?.id ?? GUEST.id;
}

/** The creator this request is for: cookie selection, else configured default. */
export async function currentCreator(): Promise<CreatorProfile> {
  const store = await cookies();
  const selected = store.get(COOKIE)?.value;
  const all = [...listCreators(), GUEST];

  if (selected) {
    const match = all.find((creator) => creator.id === selected);
    if (match) return match;
  }
  const fallbackId = defaultCreatorId();
  const configured = all.find((creator) => creator.id === fallbackId);
  if (configured) return configured;

  // A configured creator with no memory directory yet is a real, honest state: a channel
  // nobody has backfilled. Show it as cold start rather than silently swapping in a
  // different creator, which would make the workspace describe someone else's history.
  const known = KNOWN[fallbackId];
  const displayName = known?.displayName ?? titleCase(fallbackId);
  return {
    id: fallbackId,
    displayName,
    handle: known?.handle ?? fallbackId,
    initials: initialsOf(displayName),
    threads: 0,
    streams: 0,
    known: Boolean(known),
    hasMemory: false,
  };
}

export function creatorCookieName(): string {
  return COOKIE;
}

/** Valid selections only — the cookie value is used to look up an entry that was
 * independently discovered, never to build a path. */
export function isSelectableCreator(id: string): boolean {
  return id === GUEST.id || listCreators().some((creator) => creator.id === id);
}

export type ChannelThread = {
  id: string;
  kind: string;
  label: string;
  summary: string;
  status: string;
  streamId: string;
  t: number;
  quote: string;
  mentions: number;
};

/** The threads actually extracted from this creator's history.
 *
 * This is the real product artifact — what the memory pass found in past streams and
 * what a callback is later matched against. The Memory page previously showed only
 * authored fixtures, so the one genuinely novel thing the system does was invisible.
 */
export function loadThreads(creatorId: string): ChannelThread[] {
  try {
    const raw = readFileSync(join(memoryRoot(), creatorId, "threads.json"), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Array<Record<string, unknown>>).flatMap((thread, index) => {
      const mentions = verifiedMentions(thread);
      const seen = mentions[0];
      if (!seen) return [];
      return {
        id: String(thread.id ?? `thread_${index}`),
        kind: String(thread.kind ?? "thread").replaceAll("_", " "),
        label: String(thread.label ?? "Untitled thread"),
        summary: String(thread.summary ?? ""),
        status: String(thread.status ?? "open"),
        streamId: String(seen.stream_id ?? "unknown"),
        t: Number(seen.t ?? 0),
        quote: String(seen.quote ?? ""),
        mentions: mentions.length,
      };
    });
  } catch {
    return [];
  }
}
