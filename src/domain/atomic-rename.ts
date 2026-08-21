import { renameSync } from "node:fs";

/** Rename a temp file over its target, retrying the Windows-only failures.
 *
 * POSIX replaces an open destination happily. Windows does not: `rename` fails with
 * EPERM or EBUSY whenever *anything* holds a handle on the destination, and on a
 * developer machine plenty does -- Defender scanning a file we just wrote, Search
 * indexing the workspace, or a status poller that opened the same JSON a millisecond
 * earlier. The handle is transient, so the operation succeeds on a later attempt.
 *
 * This was a real failure, not a theoretical one: a channel backfill died with
 *
 *   EPERM: operation not permitted, rename
 *   '...\\.work\\channel_1e5573540ad2\\status.json.<pid>-<uuid>.tmp'
 *   -> '...\\.work\\channel_1e5573540ad2\\status.json'
 *
 * and took the whole memory build down with it, because that write path had no retry
 * at all while two sibling paths each had their own single-shot copy. One helper now
 * serves all three, so the behaviour cannot drift apart again.
 *
 * Retries are bounded and total roughly 300ms (10, 20, 40, 80, 160). That is long
 * enough to outlast a scanner holding a small JSON file and short enough that a
 * genuinely stuck rename still fails fast rather than hanging a job. A non-Windows
 * error code is rethrown immediately: only EPERM and EBUSY are worth waiting on.
 */

const RETRY_DELAYS_MS = [10, 20, 40, 80, 160] as const;

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "EPERM" || error.code === "EBUSY")
  );
}

/** Block the thread briefly. These writers are synchronous by design -- a status file
 * has to be on disk before the next step reads it -- so this cannot be an await. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `rename` and `sleep` are injectable so callers that already own a test seam --
 * `persist-core`'s `PersistenceRuntime` does -- keep it instead of growing a second one. */
export function renameWithRetry(
  from: string,
  to: string,
  rename: (a: string, b: string) => void = renameSync,
  sleep: (ms: number) => void = pause,
): void {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      // Out of attempts, or an error no amount of waiting will clear.
      if (attempt === RETRY_DELAYS_MS.length || !isRetryable(error)) throw error;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
