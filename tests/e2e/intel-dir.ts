import { tmpdir } from "node:os";
import { join } from "node:path";

/** Intel store the browser tests point the server at.
 *
 * The intelligence store must NOT be the real `.intel/`: the console renders the newest
 * complete scan and the accumulated belief memory, so a test fixture written there
 * becomes the report and the memory a demo recorded afterwards would show — and unlike a
 * scan, memory is cumulative, so the pollution compounds with every test run rather than
 * being overwritten.
 *
 * Same reasoning as `clipper-workdir.ts`; see PRD FIX-8 for the bug that produced that
 * rule the first time.
 */
export const TEST_INTEL_DIR = join(tmpdir(), "afterplay-e2e-intel-dir");
