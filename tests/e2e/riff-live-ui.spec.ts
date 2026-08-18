import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function installFakeRealtimeBrowser(page: Page) {
  await page.addInitScript(() => {
    class FakeDataChannel extends EventTarget {
      readyState: RTCDataChannelState = "connecting";

      send() {}

      close() {
        this.readyState = "closed";
        this.dispatchEvent(new Event("close"));
      }

      emit(payload: Record<string, unknown>) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }

    class FakeTrack {
      stop() {}
    }

    class FakeMediaStream {
      private readonly track = new FakeTrack();

      getAudioTracks() {
        return [this.track];
      }

      getTracks() {
        return [this.track];
      }
    }

    class FakePeerConnection {
      connectionState: RTCPeerConnectionState = "new";
      localDescription: RTCSessionDescriptionInit | null = null;
      onconnectionstatechange: (() => void) | null = null;
      ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;

      addTrack() {}

      createDataChannel() {
        const channel = new FakeDataChannel();
        (globalThis as typeof globalThis & { __riffFakeChannel?: FakeDataChannel }).__riffFakeChannel = channel;
        window.setTimeout(() => {
          channel.readyState = "open";
          channel.dispatchEvent(new Event("open"));
          channel.emit({ type: "session.created" });
        }, 20);
        return channel;
      }

      async createOffer() {
        return { type: "offer" as const, sdp: "v=0" };
      }

      async setLocalDescription(description: RTCSessionDescriptionInit) {
        this.localDescription = description;
      }

      async setRemoteDescription() {
        this.connectionState = "connected";
        this.onconnectionstatechange?.();
      }

      close() {
        this.connectionState = "closed";
      }
    }

    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: FakePeerConnection,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => new FakeMediaStream(),
      },
    });
  });

  await page.route("**/api/realtime/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        capabilities: {
          input: "microphone",
          output: "speech",
          turnDetection: "semantic_vad",
          voice: "marin",
        },
      }),
    });
  });
  await page.route("**/api/realtime/call?*", async (route) => {
    await route.fulfill({ contentType: "application/sdp", body: "v=0" });
  });
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/demo/reset");
  expect(reset.ok()).toBe(true);
});

test("the creator can run the Riff live-to-debrief judge path", async ({ page }) => {
  await page.goto("/live");

  await page.getByRole("button", { name: "Demo rehearsal" }).click();

  await expect(page.getByRole("heading", { name: "Talk to Riff live." })).toBeVisible();
  await expect(page.getByText("Simulated chat", { exact: true })).toBeVisible();
  await expect(page.getByText("Deterministic Riff", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Experiment name")).toHaveValue("The Comeback Loop");
  await expect(page.getByLabel("Riff personality")).toContainText("quick-witted cohost");

  await page.getByRole("button", { name: "Start Riff" }).click();

  await expect(page.getByRole("heading", { name: "Riff is listening." })).toBeVisible();
  await page.getByText("OBS browser sources", { exact: false }).click();
  await expect(page.getByRole("link", { name: "Open Riff caption source" })).toHaveAttribute(
    "href",
    "/overlay/riff?session=live_demo_001",
  );
  await expect(page.getByRole("link", { name: "Open simulated chat source" })).toHaveAttribute(
    "href",
    "/overlay/chat?session=live_demo_001",
  );
  await expect(page.getByRole("region", { name: "Simulated chat" })).toBeVisible();
  await page.getByRole("button", { name: "Run the fail beat" }).click();

  await expect(page.getByText("bro lost to the tutorial jump")).toBeVisible();
  await expect(
    page.getByText(
      "Nova says the tutorial jump has a better win rate than you. You got a comeback, or are we accepting that?",
    ),
  ).toBeVisible();
  await expect(page.getByText("Highlight marked", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run the chat pile-on" }).click();
  await expect(page.getByText("take the left shortcut")).toBeVisible();
  await expect(
    page.getByText(
      "Chat has volunteered you for the shortcut. They brought zero skill and maximum confidence. You taking it?",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "End stream" }).click();

  await expect(page.getByRole("heading", { name: "What the stream created." })).toBeVisible();
  await expect(page.getByText("Nova turned the tutorial-jump fail into a shared win-rate roast.")).toBeVisible();
  await expect(page.getByText("The tutorial jump has a better win rate")).toBeVisible();
  await expect(page.getByText("Experiment supported", { exact: true })).toBeVisible();
  await expect(page.getByText("The Win-Rate Board", { exact: true })).toBeVisible();
});

test("the OBS caption source contains only Riff's live caption state", async ({ page }) => {
  await page.goto("/overlay/riff?session=live_demo_001");

  await expect(page.getByLabel("Riff caption overlay")).toBeVisible();
  await expect(page.getByText("Afterplay", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("the Riff HUD stays visible and reflects the live cohost state", async ({ page, request }) => {
  const started = await request.post("/api/live/sessions", {
    data: {
      mode: "live",
      experiment: {
        id: "exp_comeback_loop",
        name: "The Comeback Loop",
        status: "accepted",
        hypothesis:
          "If Riff surfaces chat's best setups after a fail, more viewers will join one shared bit instead of posting isolated reactions.",
        successSignal: "At least three different chatters build on a surfaced moment and the creator responds.",
      },
      cohost: {
        name: "Riff",
        personalityBrief:
          "A quick-witted cohost who sides with chat, roasts the streamer, and never explains the joke.",
        roastIntensity: 4,
        talkFrequency: 3,
      },
    },
  });
  const { session } = await started.json();

  await page.goto(`/overlay/riff?session=${session.id}`);

  const hud = page.getByRole("region", { name: "Riff stream HUD" });
  await expect(hud).toBeVisible();
  await expect(hud.getByText("Riff", { exact: true })).toBeVisible();
  await expect(hud.getByText("AI cohost", { exact: true })).toBeVisible();
  await expect(hud.getByText("Listening", { exact: true })).toHaveCount(0);
  await expect(hud).toHaveAttribute("data-state", "listening");

  const speaking = await request.put(`/api/live/sessions/${session.id}/presence`, {
    data: {
      state: "speaking",
      caption: "That jump filed a restraining order against your timing.",
    },
  });
  expect(speaking.ok()).toBe(true);

  await expect(hud.getByText("Speaking", { exact: true })).toHaveCount(0);
  await expect(hud).toHaveAttribute("data-state", "speaking");
  await expect(hud.getByText("That jump filed a restraining order against your timing.")).toBeVisible();

  const listening = await request.put(`/api/live/sessions/${session.id}/presence`, {
    data: { state: "listening" },
  });
  expect(listening.ok()).toBe(true);

  await expect(hud.getByText("Listening", { exact: true })).toHaveCount(0);
  await expect(hud).toHaveAttribute("data-state", "listening");
  await expect(hud.getByText("That jump filed a restraining order against your timing.")).toHaveCount(0);
  await expect(hud.getByText("Riff", { exact: true })).toBeVisible();
});

test("the creator can explicitly choose live AI without disguising rehearsal mode", async ({ page }) => {
  await page.route("**/api/realtime/status", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured: false }) });
  });
  await page.goto("/live");

  await expect(page.getByText("Live AI cohost", { exact: true })).toBeVisible();
  await expect(page.getByText("Deterministic Riff", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Microphone permission is requested when the session starts.")).toBeVisible();

  await page.getByRole("button", { name: "Start Riff" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Live Riff needs an OPENAI_API_KEY on the Afterplay server.",
    }),
  ).toHaveText("Live Riff needs an OPENAI_API_KEY on the Afterplay server.");
  await expect(page.getByRole("heading", { name: "Talk to Riff live." })).toBeVisible();
});

test("the realtime cohost becomes ready, hears the creator, speaks, and surfaces provider errors", async ({
  page,
  request,
}) => {
  await installFakeRealtimeBrowser(page);
  await page.goto("/live");

  await page.getByRole("button", { name: "Start Riff" }).click();

  await expect(page.getByRole("heading", { name: "Riff is ready." })).toBeVisible();
  await expect(page.getByText("Ready — talk to Riff", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get("/api/live/sessions/live_live_001");
    return (await response.json()).session.presence;
  }).toEqual({ state: "listening" });

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({ type: "input_audio_buffer.speech_started" });
  });
  await expect(page.getByText("Hearing you", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({ type: "input_audio_buffer.speech_stopped" });
  });
  await expect.poll(async () => {
    const response = await request.get("/api/live/sessions/live_live_001");
    return (await response.json()).session.presence;
  }).toEqual({ state: "thinking" });

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({ type: "response.output_audio_transcript.delta", delta: "That plan has tutorial-level confidence." });
  });
  await expect(page.getByText("That plan has tutorial-level confidence.", { exact: true })).toBeVisible();
  await expect(page.getByText("Riff is speaking", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get("/api/live/sessions/live_live_001");
    return (await response.json()).session.presence;
  }).toEqual({
    state: "speaking",
    caption: "That plan has tutorial-level confidence.",
  });

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({
      type: "response.output_audio_transcript.done",
      transcript: "That plan has tutorial-level confidence.",
    });
    channel?.emit({ type: "response.done" });
  });
  await expect(page.getByText("Ready — talk to Riff", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get("/api/live/sessions/live_live_001");
    return (await response.json()).session.presence;
  }).toEqual({ state: "listening" });

  const sessionState = await request.get("/api/live/sessions/live_live_001");
  expect(sessionState.ok()).toBe(true);
  expect(await sessionState.json()).toMatchObject({ session: { turnCount: 0 } });

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({ type: "error", error: { message: "Realtime session expired." } });
  });
  await expect(page.getByRole("alert").filter({ hasText: "Realtime session expired." })).toContainText(
    "Realtime session expired.",
  );
});

test("the OBS chat source renders a normal scrolling feed without Afterplay chrome", async ({
  page,
  request,
}) => {
  const started = await request.post("/api/live/sessions", {
    data: {
      mode: "demo",
      experiment: {
        id: "exp_comeback_loop",
        name: "The Comeback Loop",
        status: "accepted",
        hypothesis:
          "If Riff surfaces chat's best setups after a fail, more viewers will join one shared bit instead of posting isolated reactions.",
        successSignal: "At least three different chatters build on a surfaced moment and the creator responds.",
      },
      cohost: {
        name: "Riff",
        personalityBrief:
          "A quick-witted cohost who sides with chat, roasts the streamer, and never explains the joke.",
        roastIntensity: 4,
        talkFrequency: 3,
      },
    },
  });
  const { session } = await started.json();
  await request.post(`/api/live/sessions/${session.id}/turns`, {
    data: {
      atMs: 45_200,
      gameplay: { id: "gameplay_001", summary: "The creator missed the tutorial jump." },
      chat: [
        { id: "chat_nova_001", username: "Nova", text: "bro lost to the tutorial jump" },
        { id: "chat_pixel_001", username: "Pixel", text: "the jump has a better win rate" },
      ],
      memories: [],
    },
  });

  await page.goto(`/overlay/chat?session=${session.id}`);

  await expect(page.getByRole("region", { name: "Simulated chat overlay" })).toBeVisible();
  await expect(page.getByText("bro lost to the tutorial jump", { exact: true })).toBeVisible();
  await expect(page.getByText("the jump has a better win rate", { exact: true })).toBeVisible();
  await expect(page.getByText("Afterplay", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Riff", { exact: true })).toHaveCount(0);
});
