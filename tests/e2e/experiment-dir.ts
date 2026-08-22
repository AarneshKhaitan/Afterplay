import { tmpdir } from "node:os";
import { join } from "node:path";

/** Durable experiment state used by browser tests. Keeping it outside the repository
 * prevents reset and lifecycle tests from changing the state used in a live demo. */
export const TEST_EXPERIMENT_DIR = join(tmpdir(), "afterplay-e2e-experiment-dir");
