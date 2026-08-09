import { z } from "zod";

import {
  CohostDecision,
  runDemoCohostTurn,
  runLiveCohostTurn,
  TurnPacket,
  turnPacketSchema,
} from "@/ai/cohost";

const acceptedExperimentSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    status: z.string(),
    hypothesis: z.string().trim().min(20).max(600),
    successSignal: z.string().trim().min(10).max(400),
  })
  .superRefine((experiment, context) => {
    if (experiment.status !== "accepted") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "The stream experiment must be accepted before the session starts.",
      });
    }
  });

export const cohostProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  personalityBrief: z.string().trim().min(20).max(500),
  roastIntensity: z.number().int().min(1).max(5),
  talkFrequency: z.number().int().min(1).max(5),
});

export const startLiveSessionSchema = z.object({
  mode: z.enum(["demo", "live"]),
  experiment: acceptedExperimentSchema,
  cohost: cohostProfileSchema,
});

export const cohostPresenceSchema = z.object({
  state: z.enum(["listening", "thinking", "speaking"]),
  caption: z.string().trim().min(1).max(500).optional(),
});

export type LiveSessionMode = z.infer<typeof startLiveSessionSchema>["mode"];
export type CohostProfile = z.infer<typeof cohostProfileSchema>;
export type CohostPresence = z.infer<typeof cohostPresenceSchema>;

export type AcceptedStreamExperiment = {
  id: string;
  name: string;
  status: "accepted";
  hypothesis: string;
  successSignal: string;
};

export type LiveSession = {
  id: string;
  status: "live" | "ended";
  mode: LiveSessionMode;
  experiment: AcceptedStreamExperiment;
  cohost: CohostProfile;
  muted: boolean;
  presence: CohostPresence;
  turnCount: number;
  recentChat: TurnPacket["chat"];
  latestDecision?: CohostDecision;
  startedAt: string;
  endedAt?: string;
};

export type LiveDebrief = {
  memories: Array<{
    id: string;
    status: "candidate";
    scope: "viewer_public";
    username: string;
    summary: string;
    sourceTurnIds: string[];
    sourceIds: string[];
  }>;
  highlights: Array<{
    id: string;
    atMs: number;
    title: string;
    context: string;
    sourceTurnIds: string[];
    sourceIds: string[];
    riffRequiredInClip: false;
  }>;
  experimentEvidence: {
    experimentId: string;
    verdict: "supports" | "contradicts" | "inconclusive";
    summary: string;
    sourceTurnIds: string[];
  };
  nextExperiment: {
    id: string;
    name: string;
    status: "proposed";
    hypothesis: string;
  };
};

type LiveSessionStore = {
  sessions: Map<string, StoredLiveSession>;
  nextId: number;
  activeSessionId?: string;
};

type StoredLiveSession = LiveSession & {
  turns: Array<{ packet: TurnPacket; decision: CohostDecision }>;
  debrief?: LiveDebrief;
};

export class LiveSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LiveSessionError";
  }
}

declare global {
  var __afterplayLiveSessionStore: LiveSessionStore | undefined;
}

function store(): LiveSessionStore {
  if (!globalThis.__afterplayLiveSessionStore) {
    globalThis.__afterplayLiveSessionStore = {
      sessions: new Map<string, StoredLiveSession>(),
      nextId: 1,
    };
  }
  return globalThis.__afterplayLiveSessionStore;
}

export function resetLiveSessionStore() {
  globalThis.__afterplayLiveSessionStore = {
    sessions: new Map<string, StoredLiveSession>(),
    nextId: 1,
  };
}

export function startLiveSession(input: z.infer<typeof startLiveSessionSchema>): {
  meta: {
    mode: LiveSessionMode;
    chat: "simulated";
    model: "deterministic_fixture" | "gpt-realtime-2.1";
    fallbackUsed: false;
  };
  session: LiveSession;
} {
  const state = store();
  const id = `live_${input.mode}_${String(state.nextId).padStart(3, "0")}`;
  state.nextId += 1;

  const session: LiveSession = {
    id,
    status: "live",
    mode: input.mode,
    experiment: {
      ...input.experiment,
      status: "accepted",
    },
    cohost: input.cohost,
    muted: false,
    presence: { state: "listening" },
    turnCount: 0,
    recentChat: [],
    startedAt: "2026-08-09T15:00:00.000Z",
  };

  state.sessions.set(id, { ...structuredClone(session), turns: [] });
  state.activeSessionId = id;

  return {
    meta: {
      mode: input.mode,
      chat: "simulated",
      model: input.mode === "demo" ? "deterministic_fixture" : "gpt-realtime-2.1",
      fallbackUsed: false,
    },
    session: structuredClone(session),
  };
}

function storedSession(id: string) {
  const state = store();
  const resolvedId = id === "active" ? state.activeSessionId : id;
  const session = resolvedId ? state.sessions.get(resolvedId) : undefined;
  if (!session) {
    throw new LiveSessionError("live_session_not_found", "Live session not found.", 404);
  }
  return session;
}

function publicSession(session: StoredLiveSession): LiveSession {
  return structuredClone({
    id: session.id,
    status: session.status,
    mode: session.mode,
    experiment: session.experiment,
    cohost: session.cohost,
    muted: session.muted,
    presence: session.presence,
    turnCount: session.turnCount,
    recentChat: session.recentChat,
    latestDecision: session.latestDecision,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  });
}

export function getLiveSession(id: string): LiveSession {
  return publicSession(storedSession(id));
}

export function updateCohostPresence(
  id: string,
  input: z.infer<typeof cohostPresenceSchema>,
): LiveSession {
  const session = storedSession(id);
  if (session.status !== "live") {
    throw new LiveSessionError("live_session_ended", "This live session has already ended.", 409);
  }
  session.presence = {
    state: input.state,
    ...(input.state === "speaking" && input.caption ? { caption: input.caption } : {}),
  };
  return publicSession(session);
}

export function submitLiveTurn(
  id: string,
  input: z.infer<typeof turnPacketSchema>,
  liveUtterance?: string,
): {
  meta: {
    mode: LiveSessionMode;
    model: "deterministic_fixture" | "gpt-realtime-2.1";
    fallbackUsed: false;
  };
  session: LiveSession;
  decision: CohostDecision;
} {
  const session = storedSession(id);
  if (session.status !== "live") {
    throw new LiveSessionError("live_session_ended", "This live session has already ended.", 409);
  }
  const packet = turnPacketSchema.parse(input);
  if (session.mode === "live" && !liveUtterance) {
    throw new LiveSessionError(
      "realtime_utterance_required",
      "A live cohost turn must include the transcript returned by the realtime connection.",
      400,
    );
  }
  const decision = session.mode === "live"
    ? runLiveCohostTurn(packet, liveUtterance!, session.turnCount + 1)
    : runDemoCohostTurn(packet, session.turnCount + 1);
  session.turns.push({ packet: structuredClone(packet), decision: structuredClone(decision) });
  session.turnCount += 1;
  session.recentChat = [...session.recentChat, ...structuredClone(packet.chat)].slice(-12);
  session.latestDecision = structuredClone(decision);

  return {
    meta: {
      mode: session.mode,
      model: session.mode === "demo" ? "deterministic_fixture" : "gpt-realtime-2.1",
      fallbackUsed: false,
    },
    session: publicSession(session),
    decision: structuredClone(decision),
  };
}

function buildDebrief(session: StoredLiveSession): LiveDebrief {
  const highlightedTurns = session.turns.filter(
    (turn) => turn.decision.action === "speak" && turn.decision.highlightSignal,
  );
  const firstHighlighted = highlightedTurns[0];
  const firstDecision = firstHighlighted?.decision;
  const firstPacket = firstHighlighted?.packet;
  const firstChatId = firstDecision?.supportingSourceIds.find((sourceId) =>
    firstPacket?.chat.some((message) => message.id === sourceId),
  );
  const firstChat = firstPacket?.chat.find((message) => message.id === firstChatId);

  const supportingTurns = session.turns.filter(
    (turn) => turn.decision.experimentSignal === "supports",
  );
  const contradictingTurns = session.turns.filter(
    (turn) => turn.decision.experimentSignal === "contradicts",
  );
  const verdict = supportingTurns.length > 0
    ? "supports"
    : contradictingTurns.length > 0
      ? "contradicts"
      : "inconclusive";
  const evidenceTurns = verdict === "supports"
    ? supportingTurns
    : verdict === "contradicts"
      ? contradictingTurns
      : session.turns;

  return {
    memories: firstHighlighted && firstDecision && firstPacket && firstChat
      ? [
          {
            id: `memory_${firstChat.username.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_tutorial_jump`,
            status: "candidate",
            scope: "viewer_public",
            username: firstChat.username,
            summary: `${firstChat.username} turned the tutorial-jump fail into a shared win-rate roast.`,
            sourceTurnIds: [firstDecision.id],
            sourceIds: [...firstDecision.supportingSourceIds],
          },
        ]
      : [],
    highlights: highlightedTurns.map((turn, index) => ({
      id: `highlight_${String(index + 1).padStart(3, "0")}`,
      atMs: turn.packet.atMs,
      title: /shortcut|route fork/i.test(turn.packet.gameplay?.summary ?? "")
        ? "Chat volunteers the shortcut"
        : "The tutorial jump has a better win rate",
      context: turn.decision.action === "speak"
        ? turn.decision.highlightSignal!.reason
        : "A live audience moment worth reviewing.",
      sourceTurnIds: [turn.decision.id],
      sourceIds: turn.decision.action === "speak"
        ? [...turn.decision.highlightSignal!.sourceIds]
        : [...turn.decision.supportingSourceIds],
      riffRequiredInClip: false,
    })),
    experimentEvidence: {
      experimentId: session.experiment.id,
      verdict,
      summary: verdict === "supports"
        ? "Three chatters built on the same surfaced fail, and Riff handed the setup back to the creator."
        : verdict === "contradicts"
          ? "The observed live turns ran against the accepted experiment."
          : "The stream did not produce enough source-grounded evidence to judge the experiment.",
      sourceTurnIds: evidenceTurns.map((turn) => turn.decision.id),
    },
    nextExperiment: verdict === "supports"
      ? {
          id: "exp_win_rate_board",
          name: "The Win-Rate Board",
          status: "proposed",
          hypothesis:
            "If Riff carries the best chat-made scoreline into the next stream, viewers will revive the bit without needing a fresh prompt.",
        }
      : {
          id: "exp_quieter_riff",
          name: "Wait for the Setup",
          status: "proposed",
          hypothesis:
            "If Riff waits for stronger audience convergence, each intervention will create more follow-on participation.",
        },
  };
}

export function endLiveSession(id: string): { session: LiveSession; debrief: LiveDebrief } {
  const session = storedSession(id);
  if (session.debrief) {
    return {
      session: publicSession(session),
      debrief: structuredClone(session.debrief),
    };
  }

  session.status = "ended";
  session.endedAt = "2026-08-09T15:08:00.000Z";
  session.debrief = buildDebrief(session);

  return {
    session: publicSession(session),
    debrief: structuredClone(session.debrief),
  };
}
