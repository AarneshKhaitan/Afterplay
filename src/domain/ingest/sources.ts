import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Server-only. Holds `node:fs`; never import from a client component. */

export type CachedSource = {
  id: string;
  /** Caption file resolved from `.demo-cache/<id>/`. */
  vttPath: string;
  /** Local media, when a file for this id exists in the media dir. */
  mediaPath?: string;
  infoJsonPath?: string;
  title?: string;
  /**
   * `local` runs entirely from disk — no YouTube request at all.
   * `replay` has captions and metadata cached but no media file, so the render stage
   * still has to fetch video bytes. The UI must say which, because the difference is
   * whether the demo can survive YouTube's anti-bot throttle.
   */
  mode: "local" | "replay";
};

const MEDIA_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".m4v"];

export function clipperRoot(): string {
  return resolve(process.cwd(), "services", "video-clipper");
}

function demoCacheDir(): string {
  return process.env.AFTERPLAY_DEMO_CACHE ?? join(clipperRoot(), ".demo-cache");
}

function mediaDir(): string | null {
  const dir = process.env.AFTERPLAY_MEDIA_DIR;
  return dir && existsSync(dir) ? dir : null;
}

function findVtt(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".vtt"));
  // Prefer manual English captions over auto-generated, mirroring resolve._pick_vtt.
  const preferred = files.find((f) => f.includes(".en.") && !f.includes("orig"))
    ?? files.find((f) => f.includes(".en"))
    ?? files[0];
  return preferred ? join(dir, preferred) : null;
}

function findMedia(id: string): string | null {
  const dir = mediaDir();
  if (!dir) return null;
  for (const entry of readdirSync(dir)) {
    const ext = entry.slice(entry.lastIndexOf("."));
    if (!MEDIA_EXTENSIONS.includes(ext.toLowerCase())) continue;
    if (entry.startsWith(id)) return join(dir, entry);
  }
  return null;
}

function readTitle(infoJsonPath: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require("node:fs").readFileSync(infoJsonPath, "utf-8") as string;
    const parsed = JSON.parse(raw) as { title?: string };
    return typeof parsed.title === "string" ? parsed.title : undefined;
  } catch {
    return undefined;
  }
}

/** Sources already on disk, so a demo needs no network for ingestion. */
export function listCachedSources(): CachedSource[] {
  const cache = demoCacheDir();
  if (!existsSync(cache)) return [];

  const out: CachedSource[] = [];
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(cache, entry.name);
    const vttPath = findVtt(dir);
    if (!vttPath) continue;                 // no captions -> nothing to reason over

    const infoJson = join(dir, "source.info.json");
    const mediaPath = findMedia(entry.name);
    out.push({
      id: entry.name,
      vttPath,
      mediaPath: mediaPath ?? undefined,
      infoJsonPath: existsSync(infoJson) ? infoJson : undefined,
      title: existsSync(infoJson) ? readTitle(infoJson) : undefined,
      mode: mediaPath ? "local" : "replay",
    });
  }
  return out.sort((a, b) => {
    // Fully-local sources first: those are the ones safe to demo.
    if (a.mode !== b.mode) return a.mode === "local" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** Resolve an id the client sent back to a real cached source.
 *
 * Never build a path by concatenating the client's string: the id is used only to look
 * up an entry that was independently discovered on disk, so a traversal attempt matches
 * nothing rather than escaping the cache directory. */
export function findCachedSource(id: string): CachedSource | null {
  return listCachedSources().find((source) => source.id === id) ?? null;
}

export function mediaDirConfigured(): boolean {
  return mediaDir() !== null;
}

export function statMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
