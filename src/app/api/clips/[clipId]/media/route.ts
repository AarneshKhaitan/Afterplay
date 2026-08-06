import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";

import { getLatestClipManifest } from "@/domain/clip-manifest";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await context.params;
  const manifest = getLatestClipManifest();
  const clip = manifest?.clips.find((item) => item.clip_id === clipId);

  if (!clip?.path || !existsSync(clip.path)) {
    return Response.json({ error: { code: "clip_not_found", message: "Clip media was not found." } }, { status: 404 });
  }

  const stat = statSync(clip.path);
  if (!stat.isFile()) {
    return Response.json({ error: { code: "clip_not_found", message: "Clip media was not found." } }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(clip.path)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Cache-Control": "no-store",
    },
  });
}
