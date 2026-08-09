/** Server-only persistence for scans, corpus and memory.
 *
 * File-backed JSON under `.intel/`, deliberately: this has to survive a dev-server
 * restart (otherwise "memory that accumulates" is a lie the moment you edit a file),
 * and it has to be inspectable by hand during a demo. It is not a database and does not
 * pretend to be — see `docs/intel/INTELLIGENCE.md` for the durability boundary.
 *
 * Never import this from a client component: it pulls `node:fs`. Client code reads
 * through the `/api/intel/*` routes.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { IntelMemory, ScanJob } from "./types";

export function intelRoot(): string {
  return process.env.AFTERPLAY_INTEL_DIR ?? join(process.cwd(), ".intel");
}

function ensure(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

function scansDir(): string {
  return ensure(join(intelRoot(), "scans"));
}

function cacheDir(): string {
  return ensure(join(intelRoot(), "cache"));
}

function memoryPath(creatorId: string): string {
  return join(ensure(join(intelRoot(), "memory")), `${safe(creatorId)}.json`);
}

/** Filenames are derived from user input (creator ids, channel handles), so they are
 * sanitised rather than trusted. `..` in a handle must not escape `.intel/`. */
function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Atomic write via rename.
 *
 * The UI polls scan files every second while a scan runs. A plain `writeFileSync` can be
 * observed half-written, and the poller would parse that as corrupt and report the scan
 * failed. `rename` is atomic on both NTFS and POSIX, so a reader sees either the old
 * file or the new one — never a partial. */
function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  renameSync(tmp, path);
}

// ── scans ────────────────────────────────────────────────────────────────────

export function saveScan(job: ScanJob): void {
  writeJson(join(scansDir(), `${safe(job.scanId)}.json`), job);
}

export function loadScan(scanId: string): ScanJob | null {
  return readJson<ScanJob>(join(scansDir(), `${safe(scanId)}.json`));
}

export function listScans(creatorId?: string, limit = 25): ScanJob[] {
  const dir = scansDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ name }) => readJson<ScanJob>(join(dir, name)))
    .filter((scan): scan is ScanJob => Boolean(scan))
    .filter((scan) => !creatorId || scan.creatorId === creatorId)
    .slice(0, limit);
}

/** The newest scan that actually produced a corpus. The UI's default view.
 *
 * A failed or still-running scan must not replace the last good report — the same
 * "newest complete wins" rule the clipper manifest uses, and for the same reason. */
export function latestCompleteScan(creatorId?: string): ScanJob | null {
  return listScans(creatorId, 50).find((scan) => scan.status === "complete") ?? null;
}

// ── scrape cache ─────────────────────────────────────────────────────────────

/** Cache raw scrape payloads by channel + options.
 *
 * This exists for cost, not speed. The actor bills per result, so re-running the same
 * scan while iterating on the UI would spend real money for identical bytes. A demo can
 * therefore be replayed indefinitely for free once warmed.
 */
export type CacheEntry<T> = { at: string; key: string; value: T };

export function cacheKey(parts: (string | number | boolean)[]): string {
  return safe(parts.join("__"));
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  const entry = readJson<CacheEntry<T>>(join(cacheDir(), `${key}.json`));
  if (!entry) return null;
  if (Date.now() - Date.parse(entry.at) > maxAgeMs) return null;
  return entry.value;
}

export function writeCache<T>(key: string, value: T): void {
  writeJson(join(cacheDir(), `${key}.json`), { at: new Date().toISOString(), key, value });
}

export function cacheStats(): { entries: number; oldest: string | null } {
  const dir = cacheDir();
  if (!existsSync(dir)) return { entries: 0, oldest: null };
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return { entries: 0, oldest: null };
  const times = files.map((f) => statSync(join(dir, f)).mtimeMs).sort((a, b) => a - b);
  return { entries: files.length, oldest: new Date(times[0]).toISOString() };
}

// ── memory ───────────────────────────────────────────────────────────────────

export function emptyMemory(creatorId: string): IntelMemory {
  return {
    creatorId,
    beliefs: [],
    events: [],
    scans: [],
    totals: { scans: 0, videosAnalyzed: 0, transcriptsRead: 0, channelsTracked: 0 },
  };
}

export function loadMemory(creatorId: string): IntelMemory {
  return readJson<IntelMemory>(memoryPath(creatorId)) ?? emptyMemory(creatorId);
}

export function saveMemory(memory: IntelMemory): void {
  writeJson(memoryPath(memory.creatorId), memory);
}
