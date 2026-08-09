import { _electron as electron, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

async function installCompanionRuntime(page: Page) {
  await page.addInitScript(() => {
    const roblox = {
      id: "window:roblox:0",
      name: "Roblox",
      thumbnail: "data:image/png;base64,iVBORw0KGgo=",
      appIcon: null,
    };
    Object.defineProperty(window, "afterplayDesktop", {
      configurable: true,
      value: {
        isDesktop: true,
        platform: "darwin",
        listCaptureSources: async () => [roblox],
        selectCaptureSource: async () => roblox,
        getScreenPermission: async () => "granted",
      },
    });

    class FakeDataChannel extends EventTarget {
      readyState: RTCDataChannelState = "connecting";
      send(payload: string) {
        const global = globalThis as typeof globalThis & { __riffSentEvents?: Array<Record<string, unknown>> };
        global.__riffSentEvents = [...(global.__riffSentEvents ?? []), JSON.parse(payload)];
      }
      close() { this.readyState = "closed"; }
      emit(payload: Record<string, unknown>) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }
    class FakeTrack { stop() {} }
    class FakeAudioMediaStream {
      private readonly track = new FakeTrack();
      getAudioTracks() { return [this.track]; }
      getTracks() { return [this.track]; }
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
      async createOffer() { return { type: "offer" as const, sdp: "v=0" }; }
      async setLocalDescription(description: RTCSessionDescriptionInit) { this.localDescription = description; }
      async setRemoteDescription() { this.connectionState = "connected"; this.onconnectionstatechange?.(); }
      close() { this.connectionState = "closed"; }
    }
    Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: FakePeerConnection });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    Object.defineProperty(CanvasRenderingContext2D.prototype, "drawImage", { configurable: true, value: () => undefined });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => new MediaStream(),
        getUserMedia: async () => new FakeAudioMediaStream(),
      },
    });
  });
  await page.route("**/api/realtime/status", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured: true }) });
  });
  await page.route("**/api/realtime/call?*", async (route) => {
    await route.fulfill({ contentType: "application/sdp", body: "v=0" });
  });
}

test("the creator can select a game window for Riff to watch", async ({ page }) => {
  await page.addInitScript(() => {
    const roblox = {
      id: "window:roblox:0",
      name: "Roblox",
      thumbnail: "data:image/png;base64,iVBORw0KGgo=",
      appIcon: null,
    };
    Object.defineProperty(window, "afterplayDesktop", {
      configurable: true,
      value: {
        isDesktop: true,
        platform: "darwin",
        listCaptureSources: async () => [roblox],
        selectCaptureSource: async () => roblox,
        getScreenPermission: async () => "granted",
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: async () => new MediaStream(),
      },
    });
  });

  await page.goto("/companion");
  await page.getByRole("button", { name: "Choose game window" }).click();

  await expect(page.getByRole("dialog", { name: "Choose the game Riff watches" })).toBeVisible();
  await page.getByRole("button", { name: "Watch Roblox" }).click();

  await expect(page.getByText("Roblox", { exact: true })).toBeVisible();
  await expect(page.getByText("Game vision active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Riff" })).toBeEnabled();
});

test("the desktop companion starts live Riff and drives the stream HUD", async ({ page, request }) => {
  await installCompanionRuntime(page);
  await page.goto("/companion");
  await page.getByRole("button", { name: "Choose game window" }).click();
  await page.getByRole("button", { name: "Watch Roblox" }).click();
  await page.getByRole("button", { name: "Start Riff" }).click();

  await expect(page.getByText("Riff is listening", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const events = (globalThis as typeof globalThis & {
      __riffSentEvents?: Array<{ type?: string; item?: { content?: Array<{ type?: string }> } }>;
    }).__riffSentEvents ?? [];
    return events.some((event) =>
      event.type === "conversation.item.create"
      && event.item?.content?.some((content) => content.type === "input_image"),
    );
  })).toBe(true);

  await page.evaluate(() => {
    const channel = (globalThis as typeof globalThis & {
      __riffFakeChannel?: { emit: (payload: Record<string, unknown>) => void };
    }).__riffFakeChannel;
    channel?.emit({ type: "response.output_audio_transcript.delta", delta: "Roblox called. It wants its tutorial back." });
  });

  await expect(page.getByText("Riff is speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Roblox called. It wants its tutorial back.", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get("/api/live/sessions/active");
    return (await response.json()).session.presence;
  }).toEqual({ state: "speaking", caption: "Roblox called. It wants its tutorial back." });
});

test("the desktop app opens the compact Riff companion instead of the Afterplay dashboard", async () => {
  const electronApp = await electron.launch({
    args: [path.join(process.cwd(), "electron/main.mjs")],
    env: {
      ...process.env,
      AFTERPLAY_BASE_URL: "http://127.0.0.1:3100",
      NODE_ENV: "test",
    },
  });

  try {
    const companionWindow = await electronApp.firstWindow();
    await expect(companionWindow.getByRole("main", { name: "Riff desktop companion" })).toBeVisible();
    await expect(companionWindow.getByText("Growth HQ", { exact: true })).toHaveCount(0);
    await expect(companionWindow.getByRole("button", { name: "Choose game window" })).toBeVisible();
    await expect(companionWindow.getByRole("button", { name: "Start Riff" })).toBeVisible();
    await expect(companionWindow.getByText("http://127.0.0.1:3100/overlay/riff", { exact: true })).toBeVisible();
    await expect.poll(() => companionWindow.evaluate(() => Boolean(window.afterplayDesktop?.isDesktop))).toBe(true);
  } finally {
    await electronApp.close();
  }
});
