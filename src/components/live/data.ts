import "server-only";

import { getLatestClipManifest } from "@/domain/clip-manifest";
import type { CreatorProfile } from "@/domain/creators";
import { listScans } from "@/domain/intel/store";

export type LiveWorkspaceCounts = {
  threads: number;
  streams: number;
  completeScans: number;
  usableClips: number;
};

export function loadLiveWorkspaceCounts(creator: CreatorProfile): LiveWorkspaceCounts {
  const latestManifest = getLatestClipManifest(creator.id);

  return {
    threads: creator.threads,
    streams: creator.streams,
    completeScans: listScans(creator.id).filter((scan) => scan.status === "complete").length,
    usableClips: latestManifest?.clips.filter((clip) => clip.ok).length ?? 0,
  };
}
