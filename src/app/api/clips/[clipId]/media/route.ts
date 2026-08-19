import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";

import { getLatestClipManifest } from "@/domain/clip-manifest";
import { currentCreator } from "@/domain/creators";

export const dynamic = "force-dynamic";

/** Parse a single-range `bytes=start-end` header against a known file size.
 *
 * Browsers open a <video> with `Range: bytes=0-`; answering 200 without
 * `Accept-Ranges` makes the media element treat the resource as non-seekable and
 * playback never starts. Only the single-range form is supported, which is all a
 * media element sends. */
function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid" as const;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid" as const;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix form: last N bytes
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "invalid" as const;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "invalid" as const;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, context: { params: Promise<{ clipId: string }> }) {
  const [{ clipId }, creator] = await Promise.all([context.params, currentCreator()]);
  const manifest = getLatestClipManifest(creator.id);
  const clip = manifest?.clips.find((item) => item.clip_id === clipId);

  if (!clip?.path || !existsSync(clip.path)) {
    return Response.json({ error: { code: "clip_not_found", message: "Clip media was not found." } }, { status: 404 });
  }

  const stat = statSync(clip.path);
  if (!stat.isFile()) {
    return Response.json({ error: { code: "clip_not_found", message: "Clip media was not found." } }, { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${stat.size}` },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };

  if (!range) {
    const stream = Readable.toWeb(createReadStream(clip.path)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: { ...headers, "Content-Length": String(stat.size) },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(clip.path, { start: range.start, end: range.end }),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
    },
  });
}
