const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  throw new Error("ELEVENLABS_API_KEY is missing.");
}

const response = await fetch(
  "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true",
  {headers: {"xi-api-key": apiKey}},
);

if (!response.ok) {
  throw new Error(`Could not list ElevenLabs voices (${response.status}): ${await response.text()}`);
}

const result = await response.json();
for (const voice of result.voices ?? []) {
  process.stdout.write(
    `${voice.name}\t${voice.voice_id}\t${voice.category ?? "unknown"}\t${voice.sharing?.status ?? "private"}\n`,
  );
}
