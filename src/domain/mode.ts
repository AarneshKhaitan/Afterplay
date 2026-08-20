import type { WorkspaceMode } from "./workspace";

export const WORKSPACE_MODE_COOKIE = "afterplay_mode";

export type WorkspaceModeSource = "cookie" | "environment" | "default" | "lock";

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
  cookie?: string | null;
  configuredDefault?: string | null;
  lock?: string | null;
}): WorkspaceModeState {
  const configured = parseWorkspaceMode(input.configuredDefault);
  const defaultMode = configured ?? "live";
  const locked = input.lock === "true";

  if (locked) {
    return {
      mode: defaultMode,
      defaultMode,
      locked: true,
      source: "lock",
    };
  }

  const cookieMode = parseWorkspaceMode(input.cookie);
  if (cookieMode) {
    return {
      mode: cookieMode,
      defaultMode,
      locked: false,
      source: "cookie",
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
  const { cookies } = await import("next/headers");
  const store = await cookies();

  return resolveWorkspaceMode({
    cookie: store.get(WORKSPACE_MODE_COOKIE)?.value,
    configuredDefault: process.env.AFTERPLAY_MODE,
    lock: process.env.AFTERPLAY_MODE_LOCK,
  });
}

export async function workspaceMode(): Promise<WorkspaceMode> {
  return (await workspaceModeState()).mode;
}
