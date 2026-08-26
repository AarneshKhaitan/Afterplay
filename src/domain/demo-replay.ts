import { cookies } from "next/headers";

/** Whether the slow buttons replay a cached run instead of starting a real one.
 *
 * This exists for the stage: a real memory build or clip run takes minutes and spends
 * money, which no demo slot survives. But it has to be switchable *during* the demo --
 * a new channel has no cached run to replay, and the whole point of showing the real
 * thing is being able to show the real thing.
 *
 * So the cookie wins over the environment. `AFTERPLAY_DEMO_REPLAY` sets what a fresh
 * browser gets; the toggle in the top bar changes it from then on, with no rebuild and
 * no restart. Same shape as the creator cookie: a local operator preference, never an
 * authentication or authorisation signal.
 */

export const DEMO_REPLAY_COOKIE = "afterplay_demo_replay";

export function parseDemoReplay(value: string | null | undefined): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

/** What the environment says a fresh browser should start with. */
export function configuredDemoReplay(): boolean {
  return process.env.AFTERPLAY_DEMO_REPLAY === "true";
}

export async function demoReplayEnabled(): Promise<boolean> {
  const store = await cookies();
  return parseDemoReplay(store.get(DEMO_REPLAY_COOKIE)?.value) ?? configuredDemoReplay();
}
