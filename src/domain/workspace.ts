export type WorkspaceMode = "demo" | "live";

export type CreatorWorkspace = {
  meta: {
    mode: WorkspaceMode;
    disclosure: "synthetic_sample_data";
    updatedAt: string;
  };
  workspace: {
    creator: {
      id: string;
      displayName: string;
      handle: string;
      category: string;
      avatarUrl: string;
      accent: string;
    };
    diagnosis: {
      title: string;
      summary: string;
      confidence: number;
      evidence: Array<{ label: string; value: string }>;
      uncertainty: string;
    };
    activeExperiment: {
      id: string;
      name: string;
      status: "awaiting_approval";
      premise: string;
      behavior: string;
      outputs: number;
      currentRevision: number;
    };
    movement: Array<{
      label: string;
      value: string;
      delta: string;
      direction: "up" | "flat";
    }>;
    teamActivity: Array<{
      role: "Strategist" | "Scout" | "Producer" | "Analyst";
      action: string;
      state: "complete" | "working" | "waiting";
      time: string;
    }>;
    decision: {
      title: string;
      summary: string;
      outputCount: number;
      risk: string;
    };
    learning: {
      title: string;
      summary: string;
      nextMove: string;
    };
  };
};

export const demoWorkspace: CreatorWorkspace = {
  meta: {
    mode: "demo",
    disclosure: "synthetic_sample_data",
    updatedAt: "2026-08-05T09:40:00.000Z",
  },
  workspace: {
    creator: {
      id: "creator_mika_rigged",
      displayName: "Mika Rao",
      handle: "mika_rigged",
      category: "Physics sandbox creator",
      avatarUrl: "/media/mika-avatar.png",
      accent: "#ff6b55",
    },
    diagnosis: {
      title: "New viewers watch, but few come back",
      summary:
        "Mika's clips get watched, then disappear into the feed. The payoff lands, but there is no repeatable format telling a new viewer what comes next.",
      confidence: 72,
      evidence: [
        { label: "Shorts median", value: "842 views" },
        { label: "Returning viewers", value: "8.2%" },
        { label: "Tracked live visits", value: "3" },
      ],
      uncertainty:
        "We cannot match the same viewer across platforms. This diagnosis uses aggregate patterns, not person-level tracking.",
    },
    activeExperiment: {
      id: "exp_one_more_rule",
      name: "One More Rule",
      status: "awaiting_approval",
      premise:
        "Turn each stream into a named recurring challenge where chat adds one constraint every ten minutes.",
      behavior: "Help a first-time viewer recognize the format and know when to return.",
      outputs: 3,
      currentRevision: 2,
    },
    movement: [
      { label: "Returning viewers", value: "13.6%", delta: "+5.4 pt", direction: "up" },
      { label: "Repeat commenters", value: "7", delta: "+5", direction: "up" },
      { label: "Live-link visits", value: "9", delta: "+6", direction: "up" },
    ],
    teamActivity: [
      { role: "Strategist", action: "Set the target: more returning viewers", state: "complete", time: "09:12" },
      { role: "Scout", action: "Reviewed three recurring-format examples", state: "complete", time: "09:18" },
      { role: "Producer", action: "Drafted three pieces for the test", state: "complete", time: "09:31" },
      { role: "Analyst", action: "Waiting for the distribution run", state: "waiting", time: "Now" },
    ],
    decision: {
      title: "Approve revision 2",
      summary: "Three pieces are ready. Approval unlocks a simulated distribution run; nothing is published.",
      outputCount: 3,
      risk: "Low · simulated external action",
    },
    learning: {
      title: "The format name is worth testing again",
      summary: "Repeat behavior improved more than reach in this sample. One run is not enough to say the format caused it.",
      nextMove: "Test whether naming viewer-submitted constraints brings the same people back.",
    },
  },
};

export function getDemoWorkspace(): CreatorWorkspace {
  return structuredClone(demoWorkspace);
}
