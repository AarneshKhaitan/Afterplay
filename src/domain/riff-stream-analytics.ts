/** The Riff board's session record.
 *
 * A live session exists only while it runs, so this is the shape of the record a
 * finished session leaves behind: what the capture saw, what the room said, what the
 * director chose to do about it, and what carried forward to the next run.
 */
export const riffStreamAnalytics = {
  headline: {
    title: "Riff saw the whole run.",
    summary:
      "Every stream is collected as a session: game state, audience energy, on-screen moments, and the memories worth carrying forward.",
  },

  selectedSession: {
    title: "Chrome Dino — cactus rematch",
    date: "Fri 21 Aug · 5:42 PM",
    duration: "03:24",
    source: "Chrome Dino · Google Chrome",
    result: "GAME OVER · 112 points",
    summary:
      "The run stalled at 112, chat called the late jump, and Riff turned the collision into a prediction moment.",
  },

  sessions: [
    { title: "Chrome Dino — cactus rematch", date: "Fri 21 Aug · 5:42 PM", duration: "03:24", moments: "6 moments", peak: 112, active: true },
    { title: "Chrome Dino — clean start", date: "Fri 21 Aug · 5:31 PM", duration: "02:08", moments: "3 moments", peak: 94, active: false },
    { title: "Chrome Dino — night mode", date: "Thu 14 Aug · 8:41 PM", duration: "05:02", moments: "7 moments", peak: 118, active: false },
    { title: "Chrome Dino — score chase", date: "Thu 14 Aug · 8:16 PM", duration: "04:11", moments: "4 moments", peak: 107, active: false },
    { title: "Chrome Dino — first contact", date: "Tue 12 Aug · 7:03 PM", duration: "01:47", moments: "2 moments", peak: 61, active: false },
  ],

  sessionMetrics: [
    { label: "Frame events", value: "18", note: "one capture every 5s" },
    { label: "Audience messages", value: "14", note: "9 people in the room" },
    { label: "Overlay moments", value: "3", note: "1 spotlight · 1 poll" },
    { label: "Riff callbacks", value: "2", note: "both cited a past run" },
  ],

  /** Score sampled from the captured frames. `end` marks the collision.
   *
   * Every point carries the flag, including the false ones: under `as const` each entry
   * becomes its own literal type, and a flag present on only one of them is not
   * addressable on the union the array widens to. */
  scoreTrail: [
    { t: "00:00", score: 0, end: false },
    { t: "00:12", score: 24, end: false },
    { t: "00:24", score: 41, end: false },
    { t: "00:36", score: 58, end: false },
    { t: "00:43", score: 71, end: false },
    { t: "00:46", score: 86, end: false },
    { t: "00:49", score: 104, end: false },
    { t: "00:51", score: 112, end: true },
  ],

  /** What the director actually decided across the session. Silence is the common case. */
  decisions: [
    { kind: "spotlight", label: "Spotlight", count: 1, note: "one comment, exact" },
    { kind: "synthesize", label: "Synthesize", count: 2, note: "≥ 2 messages cited" },
    { kind: "silent", label: "Silent", count: 11, note: "declined to speak" },
  ],

  moments: [
    { time: "00:12", title: "Score plateau recalled", detail: "Riff matched the 112 score band to a previous Dino session.", kind: "memory" },
    { time: "00:38", title: "Room warms up", detail: "Four messages land inside eight seconds as the score passes 58.", kind: "audience" },
    { time: "00:43", title: "Audience call lands", detail: "Anonymous: “bro cannot even jump over the cacti.”", kind: "audience" },
    { time: "00:46", title: "Prediction goes live", detail: "The overlay asks whether the cactus wins in five or ten seconds.", kind: "poll" },
    { time: "00:49", title: "Riff stays quiet", detail: "Six messages arrive mid-jump. The director returns silent rather than talk over the run.", kind: "silent" },
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
    { label: "Night mode tell", detail: "Runs after 8 PM last longer and draw more messages per minute.", signal: "Repeated 2×" },
  ],
} as const;
