import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AFTERPLAY_RIFF_CONTRACT_VERSION,
  validateAfterplayRiffPacket,
} from "../../src/domain/evidence-packet.ts";
import {
  buildStrategyEvidence,
  strategyDirectorInputSchema,
  strategyProductAction,
} from "../../src/domain/strategy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(
  join(here, "..", "..", "docs", "finals", "fixtures", name),
  "utf-8",
));

test("both handoff tracks validate against contract version 1", () => {
  const outbound = validateAfterplayRiffPacket(fixture("afterplay-to-riff.v1.json"));
  const inbound = validateAfterplayRiffPacket(fixture("riff-to-afterplay.v1.json"));

  assert.equal(AFTERPLAY_RIFF_CONTRACT_VERSION, 1);
  assert.equal(outbound.success, true);
  assert.equal(inbound.success, true);
});

test("completed sessions reject dangling evidence and invalid time ranges", () => {
  const packet = fixture("riff-to-afterplay.v1.json");
  packet.decisions[0].evidenceRefs = ["evidence:missing"];
  packet.highlights[0].endSeconds = packet.highlights[0].startSeconds;

  const parsed = validateAfterplayRiffPacket(packet);
  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.error?.issues), /Unknown evidence reference/);
  assert.match(JSON.stringify(parsed.error?.issues), /Highlight end must follow/);
});

test("unknown versions and fields fail closed", () => {
  const packet = fixture("afterplay-to-riff.v1.json");
  packet.version = 2;
  packet.uncontracted = true;

  assert.equal(validateAfterplayRiffPacket(packet).success, false);
});

test("every strategy brief maps to an existing review surface", () => {
  assert.deepEqual(strategyProductAction("premise_cut"), {
    href: "/studio",
    label: "Review premise cut",
  });
  assert.equal(strategyProductAction("community_cut").href, "/studio");
  assert.equal(strategyProductAction("return_prompt").href, "/experiments");
});

test("strategy evidence carries belief meaning and verified thread provenance", () => {
  const evidence = buildStrategyEvidence([{
    key: "repeatable-format",
    scope: "own",
    statement: "A repeatable format is emerging",
    detail: "Two scans associated the named format with a stronger view floor.",
    confidence: 0.72,
    observations: 2,
    firstSeen: "2026-08-19T00:00:00.000Z",
    lastConfirmed: "2026-08-20T00:00:00.000Z",
    lastScanId: "scan_two",
    status: "confirmed",
    evidence: ["video_one"],
    lastDelta: 0.1,
    history: [],
  }], [{
    id: "promise-payoff",
    kind: "promise payoff",
    label: "Subscriber promise",
    summary: "The creator pays off an earlier promise.",
    status: "resolved",
    streamId: "stream_one",
    t: 42,
    quote: "This is the promise.",
    mentions: 1,
  }]);

  assert.equal(evidence[0].kind, "belief");
  assert.equal(evidence[0].detail.includes("Two scans"), true);
  assert.deepEqual(evidence[1].provenance, {
    streamId: "stream_one",
    timestampSeconds: 42,
    quote: "This is the promise.",
    verified: true,
  });
  assert.equal(strategyDirectorInputSchema.safeParse({
    creatorId: "creator_one",
    objective: "Increase returning viewers with a measurable format test.",
    evidence,
  }).success, true);
  assert.equal(strategyDirectorInputSchema.safeParse({
    creatorId: "creator_one",
    objective: "Increase returning viewers with a measurable format test.",
    evidenceRefs: ["opaque-id-only"],
  }).success, false);
});
