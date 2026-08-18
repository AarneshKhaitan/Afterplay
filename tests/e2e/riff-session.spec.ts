import { expect, test } from "@playwright/test";

const acceptedExperiment = {
  id: "exp_comeback_loop",
  name: "The Comeback Loop",
  status: "accepted",
  hypothesis:
    "If Riff surfaces chat's best setups after a fail, more viewers will join one shared bit instead of posting isolated reactions.",
  successSignal: "At least three different chatters build on a surfaced moment and the creator responds.",
};

const cohost = {
  name: "Riff",
  personalityBrief:
    "A quick-witted cohost who sides with chat, roasts the streamer, and never explains the joke.",
  roastIntensity: 4,
  talkFrequency: 3,
};

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("the realtime preflight exposes the actual microphone-to-speech contract", async ({ request }) => {
  const response = await request.get("/api/realtime/status");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    configured: expect.any(Boolean),
    capabilities: {
      input: "microphone",
      output: "speech",
      turnDetection: "semantic_vad",
      voice: "marin",
    },
    meta: {
      mode: "live",
      model: "gpt-realtime-2.1",
      fallbackUsed: false,
    },
  });
});

test("a creator starts a disclosed live session with an accepted experiment and configured Riff", async ({
  request,
}) => {
  const response = await request.post("/api/live/sessions", {
    data: { mode: "demo", experiment: acceptedExperiment, cohost },
  });

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    meta: {
      mode: "demo",
      chat: "simulated",
      model: "deterministic_fixture",
      fallbackUsed: false,
    },
    session: {
      id: "live_demo_001",
      status: "live",
      experiment: acceptedExperiment,
      cohost,
      muted: false,
      turnCount: 0,
    },
  });
});

test("a live session cannot start before its experiment is accepted", async ({ request }) => {
  const response = await request.post("/api/live/sessions", {
    data: {
      mode: "demo",
      experiment: { ...acceptedExperiment, status: "proposed" },
      cohost,
    },
  });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: {
      code: "invalid_request",
      message: "The stream experiment must be accepted before the session starts.",
    },
  });
});

test("Riff turns a gameplay fail and chat setup into a grounded cohost line", async ({ request }) => {
  const started = await request.post("/api/live/sessions", {
    data: { mode: "demo", experiment: acceptedExperiment, cohost },
  });
  expect(started.ok()).toBe(true);
  const { session } = await started.json();

  const response = await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 45_200,
      streamerTranscript: {
        id: "streamer_001",
        text: "That jump is actually impossible.",
      },
      gameplay: {
        id: "gameplay_001",
        summary: "The creator missed the tutorial jump and fell back to the checkpoint.",
      },
      chat: [
        { id: "chat_nova_001", username: "Nova", text: "bro lost to the tutorial jump" },
        { id: "chat_pixel_001", username: "Pixel", text: "the jump has a better win rate" },
        { id: "chat_ace_001", username: "Ace", text: "we need a comeback for that" },
      ],
      memories: [],
    },
  });

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    meta: { mode: "demo", model: "deterministic_fixture", fallbackUsed: false },
    session: { id: session.id, status: "live", turnCount: 1 },
    decision: {
      id: "riff_turn_001",
      action: "speak",
      utterance:
        "Nova says the tutorial jump has a better win rate than you. You got a comeback, or are we accepting that?",
      timingRationale: expect.any(String),
      supportingSourceIds: ["gameplay_001", "chat_nova_001"],
      highlightSignal: {
        reason: expect.any(String),
        sourceIds: ["gameplay_001", "chat_nova_001"],
      },
      experimentSignal: "supports",
    },
  });
});

test("Riff synthesizes differently worded chat requests into one live challenge", async ({ request }) => {
  const started = await request.post("/api/live/sessions", {
    data: { mode: "demo", experiment: acceptedExperiment, cohost },
  });
  expect(started.ok()).toBe(true);
  const { session } = await started.json();

  const response = await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 112_000,
      streamerTranscript: {
        id: "streamer_002",
        text: "Do I take the safe route here?",
      },
      gameplay: {
        id: "gameplay_002",
        summary: "The creator reached a route fork with a difficult shortcut over moving platforms.",
      },
      chat: [
        { id: "chat_dex_002", username: "Dex", text: "take the left shortcut" },
        { id: "chat_mira_002", username: "Mira", text: "skip the safe path" },
        { id: "chat_nova_002", username: "Nova", text: "risk it for chat" },
      ],
      memories: [],
    },
  });

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    session: {
      turnCount: 1,
      recentChat: [
        { id: "chat_dex_002" },
        { id: "chat_mira_002" },
        { id: "chat_nova_002" },
      ],
    },
    decision: {
      action: "speak",
      utterance:
        "Chat has volunteered you for the shortcut. They brought zero skill and maximum confidence. You taking it?",
      supportingSourceIds: [
        "gameplay_002",
        "chat_dex_002",
        "chat_mira_002",
        "chat_nova_002",
      ],
      experimentSignal: "supports",
    },
  });
});

test("Riff stays silent when the moment has no useful setup", async ({ request }) => {
  const started = await request.post("/api/live/sessions", {
    data: { mode: "demo", experiment: acceptedExperiment, cohost },
  });
  expect(started.ok()).toBe(true);
  const { session } = await started.json();

  const response = await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 12_000,
      streamerTranscript: { id: "streamer_quiet", text: "One second, loading in." },
      gameplay: { id: "gameplay_spawn", summary: "The creator is waiting at spawn." },
      chat: [{ id: "chat_hello", username: "Pixel", text: "nice view" }],
      memories: [],
    },
  });

  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body).toMatchObject({
    decision: {
      id: "riff_turn_001",
      action: "silent",
      timingRationale: "Nothing here is stronger than the creator's current moment.",
      supportingSourceIds: [],
    },
  });
  expect(body.decision).not.toHaveProperty("utterance");
});

test("ending the stream turns the live beat into memory, a highlight, and experiment evidence", async ({
  request,
}) => {
  const started = await request.post("/api/live/sessions", {
    data: { mode: "demo", experiment: acceptedExperiment, cohost },
  });
  expect(started.ok()).toBe(true);
  const { session } = await started.json();

  const turn = await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 45_200,
      streamerTranscript: {
        id: "streamer_001",
        text: "That jump is actually impossible.",
      },
      gameplay: {
        id: "gameplay_001",
        summary: "The creator missed the tutorial jump and fell back to the checkpoint.",
      },
      chat: [
        { id: "chat_nova_001", username: "Nova", text: "bro lost to the tutorial jump" },
        { id: "chat_pixel_001", username: "Pixel", text: "the jump has a better win rate" },
        { id: "chat_ace_001", username: "Ace", text: "we need a comeback for that" },
      ],
      memories: [],
    },
  });
  expect(turn.ok()).toBe(true);

  const ended = await request.post(`/api/live/sessions/${session.id}/end`);
  expect(ended.ok()).toBe(true);
  const body = await ended.json();

  expect(body).toMatchObject({
    session: { id: session.id, status: "ended", turnCount: 1 },
    debrief: {
      memories: [
        {
          id: "memory_nova_tutorial_jump",
          status: "candidate",
          scope: "viewer_public",
          username: "Nova",
          summary: "Nova turned the tutorial-jump fail into a shared win-rate roast.",
          sourceTurnIds: ["riff_turn_001"],
          sourceIds: ["gameplay_001", "chat_nova_001"],
        },
      ],
      highlights: [
        {
          id: "highlight_001",
          atMs: 45_200,
          title: "The tutorial jump has a better win rate",
          context: expect.any(String),
          sourceTurnIds: ["riff_turn_001"],
          sourceIds: ["gameplay_001", "chat_nova_001"],
          riffRequiredInClip: false,
        },
      ],
      experimentEvidence: {
        experimentId: "exp_comeback_loop",
        verdict: "supports",
        summary: expect.any(String),
        sourceTurnIds: ["riff_turn_001"],
      },
      nextExperiment: {
        id: "exp_win_rate_board",
        name: "The Win-Rate Board",
        status: "proposed",
        hypothesis: expect.any(String),
      },
    },
  });

  const duplicateEnd = await request.post(`/api/live/sessions/${session.id}/end`);
  expect(duplicateEnd.ok()).toBe(true);
  expect((await duplicateEnd.json()).debrief).toEqual(body.debrief);
});

test("a realtime preflight failure stays visible and never becomes fixture success", async ({
  request,
}) => {
  const preflight = await request.get("/api/realtime/status");
  const { configured } = await preflight.json();
  const response = await request.post("/api/realtime/call?session=live_demo_missing", {
    headers: { "Content-Type": "application/sdp" },
    data: "v=0\r\n",
  });

  const body = await response.json();
  if (configured) {
    expect(response.status()).toBe(404);
    expect(body).toMatchObject({
      error: { code: "live_session_not_found", message: "Live session not found." },
    });
  } else {
    expect(response.status()).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: "realtime_not_configured",
        message: "Live Riff needs an OPENAI_API_KEY on the Afterplay server.",
      },
      meta: {
        mode: "live",
        model: "gpt-realtime-2.1",
        fallbackUsed: false,
      },
    });
  }
  expect(body).not.toHaveProperty("decision");
});

test("a realtime utterance is validated and grounded through the same live-session contract", async ({
  request,
}) => {
  const started = await request.post("/api/live/sessions", {
    data: { mode: "live", experiment: acceptedExperiment, cohost },
  });
  expect(started.ok()).toBe(true);
  const { session } = await started.json();

  const response = await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 45_200,
      streamerTranscript: {
        id: "streamer_001",
        text: "That jump is actually impossible.",
      },
      gameplay: {
        id: "gameplay_001",
        summary: "The creator missed the tutorial jump and fell back to the checkpoint.",
      },
      chat: [
        { id: "chat_nova_001", username: "Nova", text: "bro lost to the tutorial jump" },
        { id: "chat_pixel_001", username: "Pixel", text: "the jump has a better win rate" },
        { id: "chat_ace_001", username: "Ace", text: "we need a comeback for that" },
      ],
      memories: [],
      liveUtterance: "That tutorial jump is farming you. Chat, do we let him run it back?",
    },
  });

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    meta: { mode: "live", model: "gpt-realtime-2.1", fallbackUsed: false },
    decision: {
      action: "speak",
      utterance: "That tutorial jump is farming you. Chat, do we let him run it back?",
      supportingSourceIds: ["gameplay_001", "chat_nova_001"],
      experimentSignal: "supports",
    },
  });
});
