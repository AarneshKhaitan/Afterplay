export const riffStreamAnalytics = {
  headline: {
    title: "Riff saw the whole run.",
    summary: "Every stream is collected as a session: game state, audience energy, on-screen moments, and the memories worth carrying forward.",
  },
  selectedSession: {
    title: "Chrome Dino — cactus rematch",
    date: "Fri 21 Aug · 5:42 PM",
    duration: "03:24",
    source: "Chrome Dino · Google Chrome",
    result: "GAME OVER · 112 points",
    summary: "The run stalled at 112, chat called the late jump, and Riff turned the collision into a prediction moment.",
  },
  sessions: [
    { title: "Chrome Dino — cactus rematch", date: "Fri 21 Aug · 5:42 PM", duration: "03:24", moments: "5 moments", active: true },
    { title: "Chrome Dino — clean start", date: "Fri 21 Aug · 5:31 PM", duration: "02:08", moments: "3 moments", active: false },
    { title: "Chrome Dino — score chase", date: "Thu 14 Aug · 8:16 PM", duration: "04:11", moments: "4 moments", active: false },
  ],
  sessionMetrics: [
    { label: "Frame events", value: "18", note: "game state updates" },
    { label: "Audience messages", value: "14", note: "9 people joined" },
    { label: "Overlay moments", value: "3", note: "poll + spotlight" },
    { label: "Riff callbacks", value: "2", note: "one memory reference" },
  ],
  moments: [
    { time: "00:12", title: "Score plateau recalled", detail: "Riff matched the 112 score band to a previous Dino session.", kind: "memory" },
    { time: "00:43", title: "Audience call lands", detail: "Anonymous: “bro cannot even jump over the cacti.”", kind: "audience" },
    { time: "00:46", title: "Prediction goes live", detail: "The overlay asks whether the cactus wins in five or ten seconds.", kind: "poll" },
    { time: "00:51", title: "Collision verified", detail: "The captured game frame shows GAME OVER at 112 points.", kind: "game" },
  ],
  totals: [
    { label: "Streams observed", value: "7", note: "last 30 days" },
    { label: "Moments marked", value: "26", note: "game + audience" },
    { label: "Audience signals", value: "83", note: "messages and votes" },
    { label: "Memory links", value: "12", note: "across sessions" },
  ],
  memory: [
    { label: "High-score plateau", detail: "112 is a recurring failure band across the Dino sessions.", signal: "Repeated 3×" },
    { label: "Cactus rivalry", detail: "The cactus is the running antagonist whenever a late jump ends a run.", signal: "Session thread" },
    { label: "Audience timing", detail: "Chat gets loud immediately after a stalled score and late takeoff.", signal: "Audience pattern" },
  ],
} as const;
