import { tmpdir } from "node:os";
import { join } from "node:path";

/** Workdir the browser tests point the server at.
 *
 * The callback fixture must NOT be written into `services/video-clipper/.work`:
 * `getLatestClipManifest(creatorId)` picks the newest owned `manifest.json`, so a test fixture
 * there silently becomes the manifest Studio serves — and its clip file is a
 * placeholder that cannot play. That state survives the test run and breaks a
 * demo recorded afterwards.
 */
export const TEST_CLIPPER_WORKDIR = join(tmpdir(), "afterplay-e2e-clipper-workdir");
