import { z } from "zod";

export const AFTERPLAY_RIFF_CONTRACT = "afterplay.riff.handoff" as const;
export const AFTERPLAY_RIFF_CONTRACT_VERSION = 1 as const;

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const timestamp = z.string().datetime({ offset: true });

const common = {
  schema: z.literal(AFTERPLAY_RIFF_CONTRACT),
  version: z.literal(AFTERPLAY_RIFF_CONTRACT_VERSION),
  idempotencyKey: identifier,
  creatorId: identifier,
  createdAt: timestamp,
};

/** Track one: the approved experiment context Afterplay can offer to Riff. */
export const afterplayToRiffPacketSchema = z.object({
  ...common,
  direction: z.literal("afterplay_to_riff"),
  experiment: z.object({
    id: identifier,
    title: z.string().min(1).max(160),
    hypothesis: z.string().min(10).max(1_000),
    proposedMetric: z.string().min(3).max(300),
    evidenceRefs: z.array(identifier).min(1).max(30),
    approvedAt: timestamp,
  }),
  permissions: z.object({
    approvalRequired: z.literal(true),
    allowedActions: z.array(z.enum(["speak", "stay_silent", "mark_highlight"])).min(1),
    prohibitedActions: z.array(z.enum(["publish", "contact", "spend", "change_account"])).length(4),
  }),
}).strict();

const riffEvidenceSchema = z.object({
  id: identifier,
  kind: z.enum(["creator_audio", "game_frame", "chat_message", "memory", "experiment"]),
  capturedAt: timestamp,
  summary: z.string().min(1).max(1_000),
  sourceRef: z.string().min(1).max(500),
}).strict();

/** Track two: the completed-session evidence Riff can return for Afterplay to validate. */
export const riffToAfterplayPacketSchema = z.object({
  ...common,
  direction: z.literal("riff_to_afterplay"),
  session: z.object({
    id: identifier,
    startedAt: timestamp,
    endedAt: timestamp,
  }).strict(),
  evidence: z.array(riffEvidenceSchema).min(1).max(500),
  decisions: z.array(z.object({
    id: identifier,
    at: timestamp,
    action: z.enum(["spoke", "stayed_silent", "marked_highlight"]),
    rationale: z.string().min(1).max(1_000),
    evidenceRefs: z.array(identifier).min(1).max(30),
  }).strict()).max(500),
  highlights: z.array(z.object({
    id: identifier,
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
    summary: z.string().min(1).max(1_000),
    evidenceRefs: z.array(identifier).min(1).max(30),
  }).strict()).max(100),
  proposedNextExperiment: z.object({
    title: z.string().min(1).max(160),
    hypothesis: z.string().min(10).max(1_000),
    proposedMetric: z.string().min(3).max(300),
    evidenceRefs: z.array(identifier).min(1).max(30),
  }).strict().nullable(),
}).strict().superRefine((packet, context) => {
  if (Date.parse(packet.session.endedAt) < Date.parse(packet.session.startedAt)) {
    context.addIssue({ code: "custom", path: ["session", "endedAt"], message: "Session end must follow its start." });
  }

  const evidenceIds = new Set(packet.evidence.map((item) => item.id));
  const checkRefs = (refs: string[], path: (string | number)[]) => {
    refs.forEach((ref, index) => {
      if (!evidenceIds.has(ref)) {
        context.addIssue({ code: "custom", path: [...path, index], message: `Unknown evidence reference: ${ref}.` });
      }
    });
  };

  packet.decisions.forEach((decision, index) => checkRefs(decision.evidenceRefs, ["decisions", index, "evidenceRefs"]));
  packet.highlights.forEach((highlight, index) => {
    if (highlight.endSeconds <= highlight.startSeconds) {
      context.addIssue({ code: "custom", path: ["highlights", index, "endSeconds"], message: "Highlight end must follow its start." });
    }
    checkRefs(highlight.evidenceRefs, ["highlights", index, "evidenceRefs"]);
  });
  if (packet.proposedNextExperiment) {
    checkRefs(packet.proposedNextExperiment.evidenceRefs, ["proposedNextExperiment", "evidenceRefs"]);
  }
});

export const afterplayRiffPacketSchema = z.union([
  afterplayToRiffPacketSchema,
  riffToAfterplayPacketSchema,
]);

export type AfterplayToRiffPacket = z.infer<typeof afterplayToRiffPacketSchema>;
export type RiffToAfterplayPacket = z.infer<typeof riffToAfterplayPacketSchema>;
export type AfterplayRiffPacket = z.infer<typeof afterplayRiffPacketSchema>;

export function validateAfterplayRiffPacket(value: unknown) {
  return afterplayRiffPacketSchema.safeParse(value);
}
