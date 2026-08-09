# OBS, Roblox, and Riff rehearsal

Use this runbook for the live judge demo. Riff runs in the desktop companion. OBS remains the compositor and receives one stable transparent HUD source plus Riff's application audio.

## Scene layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Roblox game capture                                  facecam │
│                                                              │
│                                                              │
│  ┌ RIFF  ▂▅▃▇▂  LISTENING ────────────────────────────────┐  │
│  │ Live captions appear here while Riff is speaking.       │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

The Riff nameplate and calm waveform stay visible. The waveform animates and captions expand below it while Riff speaks. Do not capture the desktop-companion control window or Afterplay dashboard in the broadcast scene.

## One-time OBS setup

1. Create a scene named **Afterplay judge demo**.
2. Add Roblox using Game Capture or the platform-appropriate window capture.
3. Add the camera as a small corner Video Capture Device.
4. Add the creator microphone and verify its meter before Riff starts.
5. Add a Browser Source at `1280 x 720` using `http://127.0.0.1:3100/overlay/riff`. Keep it above the game source. This URL remains stable across sessions.
6. Capture audio from **Riff by Afterplay** using OBS Application Audio Capture when available. Otherwise capture desktop audio and verify that game/Riff levels remain separable enough for the demo.
7. Wear headphones so Riff's voice does not loop into the creator microphone.

## Start the companion

1. Put `OPENAI_API_KEY` in `.env.local`.
2. From the repository root, run:

   ```bash
   npm run companion:dev
   ```

3. In the compact Riff window, click **Choose**, select **Roblox**, and confirm **Game vision active**.
4. Click **Start Riff** and grant macOS microphone and screen-recording access if requested.
5. Wait for **Riff is listening**. Speak once and confirm audible model speech, a speaking waveform, and captions in OBS.
6. Balance levels: creator voice first, Riff slightly below, game beneath both.

The companion sends a resized current-game snapshot every five seconds. This is periodic image context, not continuous video. The automated suite verifies that an `input_image` event crosses the Realtime data channel; it does not prove Roblox capture quality or the model's visual interpretation on this machine.

## Judge sequence

1. Start in OBS with the permanent Riff HUD already visible.
2. Briefly show the compact companion—not the Afterplay dashboard—selecting Roblox and starting Riff.
3. Return to OBS and play. Talk naturally about what is happening so Riff has both microphone and current-frame context.
4. Miss a jump, pause, and answer Riff's roast. Let the exchange feel like a live cohost, not a command demo.
5. Show that the OBS HUD changes from listening to thinking to speaking and captions the returned line.
6. Close the live proof by explaining the existing Afterplay handoff: source-bearing show moments become highlight candidates, memory, and experiment evidence. Do not claim that spontaneous conversation has already entered that ledger.

Simulated chat is not yet connected to the desktop companion. The older `/live` path still contains the visibly labelled scripted-chat rehearsal, but the primary desktop demo currently proves microphone, selected-game frames, live GPT Realtime audio, and the OBS HUD.

## Recovery

- No windows listed: open Roblox first. On macOS, enable Screen & System Audio Recording for Electron/Riff, then restart the companion.
- No microphone: enable Microphone access for Electron/Riff, then restart.
- No Riff audio: confirm the companion is not muted and OBS captures the Riff application or desktop audio.
- No HUD: confirm the Browser Source URL is exactly `http://127.0.0.1:3100/overlay/riff`, the local service is running on port `3100`, and refresh the source cache.
- Riff does not start: use the visible error, then check the server key, network, microphone permission, and app restart.
- Roblox changes too quickly: remember that the MVP samples every five seconds; narrate the current moment so audio and the latest frame reinforce each other.
