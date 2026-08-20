import { join } from "node:path";

import {
  readVersionedJson,
  writeVersionedJson,
  type VersionedJsonSchema,
} from "./persist-core";

const CREATOR_ID = /^[a-z0-9_]{1,60}$/;
const RESERVED_IDS = new Set(["guest"]);
export type WorkspaceMode = "demo" | "live";

export type CreatorWorkspace = Readonly<{
  id: string;
  channelId: string;
  displayName: string;
  handle: string;
  mode: WorkspaceMode;
}>;

type CreatorWorkspaceRegistry = Readonly<{
  workspaces: CreatorWorkspace[];
}>;

export type CreatorWorkspaceErrorCode =
  | "creator_id_collision"
  | "invalid_creator_id"
  | "invalid_workspace"
  | "reserved_creator_id"
  | "workspace_not_found";

export class CreatorWorkspaceError extends Error {
  readonly code: CreatorWorkspaceErrorCode;

  constructor(code: CreatorWorkspaceErrorCode, message: string) {
    super(message);
    this.name = "CreatorWorkspaceError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspace(value: unknown): value is CreatorWorkspace {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isValidCreatorId(value.id) &&
    !RESERVED_IDS.has(value.id) &&
    typeof value.channelId === "string" &&
    value.channelId.trim().length > 0 &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    typeof value.handle === "string" &&
    (value.mode === "demo" || value.mode === "live" || value.mode === undefined)
  );
}

const registrySchema: VersionedJsonSchema<CreatorWorkspaceRegistry> = {
  name: "creator.workspaces",
  version: 1,
  acceptLegacy: false,
  accepts: (value): value is CreatorWorkspaceRegistry => {
    if (!isRecord(value) || !Array.isArray(value.workspaces)) return false;
    if (!value.workspaces.every(isWorkspace)) return false;
    return new Set(value.workspaces.map((workspace) => workspace.id)).size === value.workspaces.length;
  },
};

export function memoryRoot(): string {
  const configured = process.env.AFTERPLAY_MEMORY;
  if (configured) {
    return configured.startsWith("/") || /^[A-Za-z]:/.test(configured)
      ? configured
      : join(process.cwd(), configured);
  }
  return join(process.cwd(), "services", "video-clipper", ".memory");
}

function registryPath(): string {
  return join(memoryRoot(), "workspaces.json");
}

export function isValidCreatorId(id: string): boolean {
  return CREATOR_ID.test(id);
}

function assertMutableCreatorId(id: string): void {
  if (!isValidCreatorId(id)) {
    throw new CreatorWorkspaceError(
      "invalid_creator_id",
      "Creator ids must contain only lowercase letters, numbers, and underscores (maximum 60).",
    );
  }
  if (RESERVED_IDS.has(id)) {
    throw new CreatorWorkspaceError(
      "reserved_creator_id",
      `The creator id ${id} is reserved.`,
    );
  }
}

function normalizedWorkspace(workspace: CreatorWorkspace): CreatorWorkspace {
  return {
    id: workspace.id,
    channelId: workspace.channelId.trim(),
    displayName: workspace.displayName.trim(),
    handle: workspace.handle.trim(),
    mode: workspace.mode,
  };
}

function writeRegistry(workspaces: CreatorWorkspace[]): void {
  writeVersionedJson(registryPath(), registrySchema, { workspaces });
}

export function listWorkspaces(): CreatorWorkspace[] {
  return (readVersionedJson(registryPath(), registrySchema)?.workspaces ?? []).map((workspace) => ({
    id: workspace.id,
    channelId: workspace.channelId,
    displayName: workspace.displayName,
    handle: workspace.handle,
    mode: workspace.mode ?? "live",
  }));
}

export function upsertWorkspace(workspace: CreatorWorkspace): CreatorWorkspace {
  assertMutableCreatorId(workspace.id);
  const next = normalizedWorkspace(workspace);
  if (!next.channelId) {
    throw new CreatorWorkspaceError("invalid_workspace", "A channel id is required.");
  }
  if (!next.displayName) {
    throw new CreatorWorkspaceError("invalid_workspace", "A display name is required.");
  }

  const workspaces = listWorkspaces();
  const existing = workspaces.find((candidate) => candidate.id === next.id);
  if (existing && existing.channelId !== next.channelId) {
    throw new CreatorWorkspaceError(
      "creator_id_collision",
      `Creator id ${next.id} is already bound to a different channel.`,
    );
  }

  const updated = existing
    ? workspaces.map((candidate) => candidate.id === next.id ? next : candidate)
    : [...workspaces, next];
  updated.sort((a, b) => a.id.localeCompare(b.id));
  writeRegistry(updated);
  return next;
}

export function renameWorkspace(id: string, displayName: string): CreatorWorkspace {
  assertMutableCreatorId(id);
  const normalizedName = displayName.trim();
  if (!normalizedName) {
    throw new CreatorWorkspaceError("invalid_workspace", "A display name is required.");
  }
  const workspaces = listWorkspaces();
  const existing = workspaces.find((workspace) => workspace.id === id);
  if (!existing) {
    throw new CreatorWorkspaceError("workspace_not_found", `Creator workspace ${id} was not found.`);
  }

  const renamed = { ...existing, displayName: normalizedName };
  writeRegistry(workspaces.map((workspace) => workspace.id === id ? renamed : workspace));
  return renamed;
}
