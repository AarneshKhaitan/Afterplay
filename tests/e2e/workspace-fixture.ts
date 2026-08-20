import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A selectable workspace for web tests, isolated from the developer's memory store. */
export const TEST_CREATOR_ID = "creator_mika_rigged";
export const TEST_MEMORY_DIR = join(tmpdir(), "afterplay-e2e-memory");

mkdirSync(join(TEST_MEMORY_DIR, TEST_CREATOR_ID), { recursive: true });
