import type { WorkspaceMode } from "./creator-workspaces";

export const WORKSPACE_MODE_COOKIE = "afterplay_mode";

export type WorkspaceModeSource = "workspace" | "environment" | "default" | "lock";

export type WorkspaceModeState = {
  mode: WorkspaceMode;
  defaultMode: WorkspaceMode;
  locked: boolean;
  source: WorkspaceModeSource;
};

export function parseWorkspaceMode(value: string | null | undefined): WorkspaceMode | null {
  return value === "demo" || value === "live" ? value : null;
}

export function resolveWorkspaceMode(input: {
  workspaceMode?: string | null;
  configuredDefault?: string | null;
  lock?: string | null;
}): WorkspaceModeState {
  const workspaceMode = parseWorkspaceMode(input.workspaceMode);
  const configured = parseWorkspaceMode(input.configuredDefault);
  const defaultMode = configured ?? workspaceMode ?? "live";
  const locked = input.lock === "true";

  if (locked) {
    return {
      mode: defaultMode,
      defaultMode,
      locked: true,
      source: "lock",
    };
  }

  if (workspaceMode) {
    return {
      mode: workspaceMode,
      defaultMode,
      locked: false,
      source: "workspace",
    };
  }

  return {
    mode: defaultMode,
    defaultMode,
    locked: false,
    source: configured ? "environment" : "default",
  };
}

export async function workspaceModeState(): Promise<WorkspaceModeState> {
  // Keep the pure mode resolver loadable by Node's unit-test runner without pulling
  // Next's request-bound `cookies()` implementation into that test module.
  const { currentCreator } = await import("./creators");
  const creator = await currentCreator();
  return resolveWorkspaceMode({
    workspaceMode: creator.mode,
    configuredDefault: process.env.AFTERPLAY_MODE,
    lock: process.env.AFTERPLAY_MODE_LOCK,
  });
}

export async function workspaceMode(): Promise<WorkspaceMode> {
  return (await workspaceModeState()).mode;
}
