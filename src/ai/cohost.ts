import { z } from "zod";

export const turnPacketSchema = z
  .object({
    atMs: z.number().int().nonnegative(),
    streamerTranscript: z
      .object({
        id: z.string().trim().min(1).max(100),
        text: z.string().trim().min(1).max(1_000),
      })
      .optional(),
    gameplay: z
      .object({
        id: z.string().trim().min(1).max(100),
        summary: z.string().trim().min(1).max(1_000),
        imageUrl: z.string().url().optional(),
      })
      .optional(),
    chat: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          username: z.string().trim().min(1).max(40),
          text: z.string().trim().min(1).max(500),
        }),
      )
      .max(50),
    memories: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          username: z.string().trim().min(1).max(40).optional(),
          summary: z.string().trim().min(1).max(500),
          sourceSessionId: z.string().trim().min(1).max(100),
        }),
      )
      .max(20),
  })
  .refine(
    (packet) => packet.streamerTranscript || packet.gameplay || packet.chat.length > 0,
    "A turn must contain streamer speech, gameplay context, or chat.",
  );

const highlightSignalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  sourceIds: z.array(z.string().trim().min(1)).min(1),
});

const experimentSignalSchema = z.enum(["supports", "contradicts", "inconclusive"]);

const spokenDecisionSchema = z.object({
  id: z.string().trim().min(1),
  action: z.literal("speak"),
  utterance: z.string().trim().min(1).max(280),
  timingRationale: z.string().trim().min(1).max(500),
  supportingSourceIds: z.array(z.string().trim().min(1)).min(1),
  highlightSignal: highlightSignalSchema.optional(),
  experimentSignal: experimentSignalSchema.optional(),
});

const silentDecisionSchema = z.object({
  id: z.string().trim().min(1),
  action: z.literal("silent"),
  timingRationale: z.string().trim().min(1).max(500),
  supportingSourceIds: z.array(z.string().trim().min(1)),
  experimentSignal: experimentSignalSchema.optional(),
});

export const cohostDecisionSchema = z.discriminatedUnion("action", [
  spokenDecisionSchema,
  silentDecisionSchema,
]);

export type TurnPacket = z.infer<typeof turnPacketSchema>;
export type CohostDecision = z.infer<typeof cohostDecisionSchema>;

function sourceIds(packet: TurnPacket) {
  return new Set([
    packet.streamerTranscript?.id,
    packet.gameplay?.id,
    ...packet.chat.map((message) => message.id),
    ...packet.memories.map((memory) => memory.id),
  ].filter((id): id is string => Boolean(id)));
}

function validateGrounding(packet: TurnPacket, decision: CohostDecision) {
  const allowed = sourceIds(packet);
  const references = [
    ...decision.supportingSourceIds,
    ...(decision.action === "speak" ? decision.highlightSignal?.sourceIds ?? [] : []),
  ];

  if (references.some((id) => !allowed.has(id))) {
    throw new Error("The cohost decision referenced context that was not supplied in the turn.");
  }
}

export function runDemoCohostTurn(packet: TurnPacket, turnNumber: number): CohostDecision {
  const failed = /fell|failed|missed|lost|died|checkpoint/i.test(packet.gameplay?.summary ?? "");
  const setup = packet.chat.find((message) => /tutorial|jump|win rate|comeback|lost/i.test(message.text));
  const collectiveRequest = packet.chat.filter((message) =>
    /shortcut|safe path|risk it/i.test(message.text),
  );
  const reachedRouteChoice = /route fork|shortcut|moving platforms/i.test(
    packet.gameplay?.summary ?? "",
  );

  let candidate: CohostDecision;
  if (failed && setup) {
    candidate = {
        id: `riff_turn_${String(turnNumber).padStart(3, "0")}`,
        action: "speak",
        utterance:
          "Nova says the tutorial jump has a better win rate than you. You got a comeback, or are we accepting that?",
        timingRationale:
          "The gameplay fail gave chat a clean setup, and the line hands the moment back to the creator.",
        supportingSourceIds: [packet.gameplay!.id, setup.id],
        highlightSignal: {
          reason: "A clear gameplay reversal became a shared creator-and-chat comedy beat.",
          sourceIds: [packet.gameplay!.id, setup.id],
        },
        experimentSignal: packet.chat.length >= 3 ? "supports" : "inconclusive",
      };
  } else if (reachedRouteChoice && collectiveRequest.length >= 2 && packet.gameplay) {
    const supportingSourceIds = [
      packet.gameplay.id,
      ...collectiveRequest.map((message) => message.id),
    ];
    candidate = {
      id: `riff_turn_${String(turnNumber).padStart(3, "0")}`,
      action: "speak",
      utterance:
        "Chat has volunteered you for the shortcut. They brought zero skill and maximum confidence. You taking it?",
      timingRationale:
        "Several differently worded chat messages converged on the same risky choice, so Riff compressed them into one challenge.",
      supportingSourceIds,
      highlightSignal: {
        reason: "Chat converged on one risky route and Riff turned that shared intent into a live creator decision.",
        sourceIds: supportingSourceIds,
      },
      experimentSignal: collectiveRequest.length >= 3 ? "supports" : "inconclusive",
    };
  } else {
    candidate = {
        id: `riff_turn_${String(turnNumber).padStart(3, "0")}`,
        action: "silent",
        timingRationale: "Nothing here is stronger than the creator's current moment.",
        supportingSourceIds: [],
        experimentSignal: "inconclusive",
      };
  }

  const decision = cohostDecisionSchema.parse(candidate);
  validateGrounding(packet, decision);
  return decision;
}

export function runLiveCohostTurn(
  packet: TurnPacket,
  utterance: string,
  turnNumber: number,
): CohostDecision {
  const supportingSourceIds = [
    packet.gameplay?.id,
    packet.chat[0]?.id,
  ].filter((id): id is string => Boolean(id));

  const candidate: CohostDecision = {
    id: `riff_turn_${String(turnNumber).padStart(3, "0")}`,
    action: "speak",
    utterance,
    timingRationale:
      "Live Riff answered after the supplied gameplay beat and chat setup converged on the same moment.",
    supportingSourceIds,
    highlightSignal: supportingSourceIds.length
      ? {
          reason: "A live model response turned the gameplay event and chat reaction into one shared beat.",
          sourceIds: supportingSourceIds,
        }
      : undefined,
    experimentSignal: packet.chat.length >= 3 ? "supports" : "inconclusive",
  };

  const decision = cohostDecisionSchema.parse(candidate);
  validateGrounding(packet, decision);
  return decision;
}
