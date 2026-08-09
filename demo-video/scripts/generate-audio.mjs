import {mkdir, writeFile} from "node:fs/promises";
import OpenAI from "../../node_modules/openai/index.mjs";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from the parent .env.local file.");
}

const client = new OpenAI({apiKey});
await mkdir(new URL("../public/", import.meta.url), {recursive: true});

const performances = [
  {
    filename: "riff-setup.mp3",
    input: "Chat says hit the button. Go on, mastermind. This definitely ends well.",
    instructions:
      "Speak like a quick-witted male-presenting gaming cohost in his twenties talking in Discord. Dry, amused, and conversational. Medium-low pitch, brisk natural pace. Tease the streamer, never sound like an announcer or advertisement. Put a little sarcastic emphasis on mastermind and definitely.",
  },
  {
    filename: "riff-roast.mp3",
    input:
      "Nice trap. You pressed the button, he escaped, and then he used you as the projectile.",
    instructions:
      "Speak like a quick-witted male-presenting gaming cohost in his twenties talking in Discord. Start with delighted disbelief, then deliver the final word projectile as a dry punchline. Medium-low pitch and natural pace. Do not sound like an announcer or advertisement.",
  },
];

for (const performance of performances) {
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    response_format: "mp3",
    speed: 1.08,
    input: performance.input,
    instructions: performance.instructions,
  });
  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(`../public/${performance.filename}`, import.meta.url), audio);
  process.stdout.write(`wrote ${performance.filename} (${audio.byteLength} bytes)\n`);
}
