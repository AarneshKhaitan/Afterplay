import { ArrowRight, CheckCircle, LockSimple, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ChannelConsole } from "@/components/ingest/channel-console";
import { WorkspaceShell } from "@/components/workspace-shell";
import { currentCreator } from "@/domain/creators";
import { workspaceModeState } from "@/domain/mode";

export const dynamic = "force-dynamic";

type StepState = "done" | "current" | "locked";

function stepClass(state: StepState): string {
  return `setup-step setup-step--${state}`;
}

export default async function SetupPage() {
  const [creator, modeState] = await Promise.all([currentCreator(), workspaceModeState()]);
  const currentStep = creator.hasMemory ? 2 : 1;
  const steps: Array<{
    index: number;
    title: string;
    summary: string;
    detail: string;
    href: string;
    label: string;
  }> = [
    {
      index: 1,
      title: "Your channel",
      summary: "@handle -> preview -> create workspace -> build memory",
      detail: "Three videos by default, captions only, and the rights attestation is visible inline before the run starts.",
      href: "/ingest",
      label: "Open channel console",
    },
    {
      index: 2,
      title: "Your competitors",
      summary: "Up to five handles -> run the intelligence scan",
      detail: "Needs APIFY_API_TOKEN. The page says so before you click it.",
      href: "/intel",
      label: "Open Intel",
    },
    {
      index: 3,
      title: "Clip a stream",
      summary: "Pick a source -> run -> review clips with callback evidence",
      detail: "This only becomes meaningful after step 1 builds the memory the callback judge needs.",
      href: "/ingest",
      label: "Open Ingest",
    },
    {
      index: 4,
      title: "Audience",
      summary: "Cold state until something is published",
      detail: "No audience result is invented for an empty workspace.",
      href: "/audience",
      label: "Open Audience",
    },
  ];

  return (
    <WorkspaceShell
      active="Setup"
      pageName="Setup"
      modeState={modeState}
      badge={creator.hasMemory ? "Existing workspace" : "First-run path"}
      dataNote={creator.hasMemory
        ? "This workspace already has memory. Setup is still available for review and follow-on actions."
        : "This workspace has no memory yet. Setup shows the exact path to build one."}
    >
      <div className="surface setup-surface">
        <section className="page-hero setup-hero">
          <div>
            <h1>Setup</h1>
            <p>Start from a channel, build memory, scan competitors, then clip and review the stream with the evidence visible at each step.</p>
            <div className="hero-meta">
              <span className={`status-chip status-chip--${creator.hasMemory ? "review" : "safe"}`}>
                {creator.hasMemory ? "Workspace already warmed" : "First-run setup"}
              </span>
              <span>{creator.displayName}</span>
              <span>{creator.mode === "demo" ? "Demo workspace" : "Live workspace"}</span>
            </div>
          </div>
        </section>

        <section className="setup-steps" aria-labelledby="setup-steps-title">
          <div className="memory-section-heading">
            <h2 id="setup-steps-title">The path</h2>
            <span>{creator.hasMemory ? "Existing workspace" : "Nothing is assumed"}</span>
          </div>
          <div className="setup-grid">
            {steps.map((step) => {
              const state: StepState = step.index < currentStep ? "done" : step.index === currentStep ? "current" : "locked";
              return (
                <article key={step.title} className={stepClass(state)}>
                  <div className="setup-step-top">
                    <span className="setup-step-index">{String(step.index).padStart(2, "0")}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.summary}</p>
                    </div>
                    <span className={`setup-step-state setup-step-state--${state}`}>
                      {state === "done" ? <CheckCircle weight="fill" /> : state === "current" ? <PlayCircle weight="fill" /> : <LockSimple weight="bold" />}
                      {state}
                    </span>
                  </div>
                  <p>{step.detail}</p>
                  <Link className="primary-small" href={step.href}>
                    {step.label} <ArrowRight weight="bold" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="setup-console" aria-labelledby="setup-console-title">
          <div className="memory-section-heading">
            <h2 id="setup-console-title">Build the channel memory</h2>
            <span>Step 1 is the critical path</span>
          </div>
          <ChannelConsole />
        </section>
      </div>
    </WorkspaceShell>
  );
}
