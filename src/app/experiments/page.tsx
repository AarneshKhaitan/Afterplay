import { redirect } from "next/navigation";


/* Runtime-dependent: the shell reports the ACTIVE creator and the real live-AI
 * state, both read from the environment. Statically prerendered, this page would
 * bake in whatever was true at build time and then report it forever — the exact
 * stale-state failure this panel exists to prevent. */
export const dynamic = "force-dynamic";

export default function ExperimentsPage() {
  redirect("/experiments/exp_one_more_rule");
}
