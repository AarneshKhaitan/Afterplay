import {mkdir, writeFile} from "node:fs/promises";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  throw new Error(
    "ELEVENLABS_API_KEY is missing. Add it to the parent .env.local file, then run npm run audio:elevenlabs.",
  );
}

// Mark is a relaxed, conversational ElevenLabs voice. Override this in
// .env.local if the voice is not available in your account.
const voiceId =
  process.env.ELEVENLABS_VOICE_ID ?? process.env.voice_id ?? "1SM7GgM6IMuvQlz2BwM3";
const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

await mkdir(new URL("../public/", import.meta.url), {recursive: true});

const performances = [
  {
    filename: "riff-setup.mp3",
    text: "[mischievously] Yo, chat says hit the button. Do it—ruin this man's whole afternoon.",
  },
  {
    filename: "riff-roast.mp3",
    text: "[laughs] Bro! He walked through it and slapped you into a different server. [sarcastic] That trap had one victim: you.",
  },
];

for (const performance of performances) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: performance.text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.75,
        style: 0.55,
        use_speaker_boost: true,
        speed: 1.05,
      },
      seed: 2808,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `ElevenLabs failed for ${performance.filename} (${response.status}): ${detail}\n` +
        "If the default Mark voice is unavailable, copy a voice ID from My Voices and set ELEVENLABS_VOICE_ID in .env.local.",
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(`../public/${performance.filename}`, import.meta.url), audio);
  process.stdout.write(`wrote ${performance.filename} (${audio.byteLength} bytes)\n`);
}
