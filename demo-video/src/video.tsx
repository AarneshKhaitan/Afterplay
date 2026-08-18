import {Audio, Video} from "@remotion/media";
import type {CSSProperties} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import captions from "./riff-captions.json";

const coral = "#ff725c";
const ink = "#111316";
const text = "#f4f3ef";
const muted = "#aeb2b6";

const at = (seconds: number) => Math.round(seconds * 60);
const setupStart = 0.35;
const setupEnd = 4.14;
const roastStart = 9.23;
const roastEnd = 14.48;
const comebackStart = 14.52;
const thirdStart = 19.05;
const thirdEnd = 25.98;

const chatMessages = [
  {at: 0.2, username: "nova", color: "#ff9a88", text: "PRESS IT"},
  {at: 0.75, username: "mika.exe", color: "#8fd5ff", text: "trap him trap him"},
  {at: 1.35, username: "bytebandit", color: "#d8b4ff", text: "DO IT 😭"},
  {at: 8.55, username: "nova", color: "#ff9a88", text: "HE WALKED THROUGH 💀"},
  {at: 8.95, username: "mika.exe", color: "#8fd5ff", text: "BRO GOT EVICTED"},
  {
    at: 9.35,
    username: "bytebandit",
    color: "#d8b4ff",
    text: "the trapper became the projectile",
  },
  {at: 14.75, username: "nova", color: "#ff9a88", text: "why are WE catching strays"},
  {
    at: 15.65,
    username: "mika.exe",
    color: "#8fd5ff",
    text: "don't tell us to shut up 😭",
  },
  {at: 18.25, username: "bytebandit", color: "#d8b4ff", text: "riff, finish him"},
] as const;

function ChatPanel() {
  const frame = useCurrentFrame();
  const visibleMessages = chatMessages.filter((message) => frame >= at(message.at));

  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        right: 42,
        width: 376,
        minHeight: 486,
        overflow: "hidden",
        border: "1px solid rgba(244, 243, 239, 0.16)",
        borderRadius: 14,
        background: "rgba(12, 14, 17, 0.88)",
        boxShadow: "0 18px 46px rgba(0, 0, 0, 0.38)",
        color: text,
        fontFamily: "Manrope, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          height: 48,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 17px",
          borderBottom: "1px solid rgba(244, 243, 239, 0.11)",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 9}}>
          <span style={{width: 7, height: 7, borderRadius: 7, background: coral}} />
          <strong style={{fontSize: 14, fontWeight: 820, letterSpacing: "0.02em"}}>LIVE CHAT</strong>
        </div>
        <span style={{color: muted, fontSize: 11, fontWeight: 720, letterSpacing: "0.06em"}}>
          SIMULATED
        </span>
      </div>

      <div style={{display: "flex", flexDirection: "column", gap: 2, padding: "11px 16px 15px"}}>
        {visibleMessages.map((message) => (
          <div
            key={`${message.at}-${message.username}`}
            style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr",
              gap: 10,
              alignItems: "baseline",
              padding: "8px 2px",
              opacity: interpolate(frame, [at(message.at), at(message.at) + 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [at(message.at), at(message.at) + 10], ["0px 8px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <strong style={{color: message.color, fontSize: 13, fontWeight: 820, textAlign: "right"}}>
              {message.username}
            </strong>
            <span style={{fontSize: 15, fontWeight: 650, lineHeight: 1.25}}>{message.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Equalizer({active}: {active: boolean}) {
  const frame = useCurrentFrame();
  const heights = active
    ? [14 + (frame % 11), 24 - (frame % 9), 12 + (frame % 17), 25 - (frame % 13)]
    : [7, 7, 7, 7];
  return (
    <div style={{display: "flex", alignItems: "center", gap: 4, height: 28}}>
      <span style={{...bar, height: heights[0]}} />
      <span style={{...bar, height: heights[1]}} />
      <span style={{...bar, height: heights[2]}} />
      <span style={{...bar, height: heights[3]}} />
    </div>
  );
}

const bar: CSSProperties = {
  width: 4,
  borderRadius: 4,
  background: coral,
};

function RiffCard() {
  const frame = useCurrentFrame();
  const speaking =
    (frame >= at(setupStart) && frame < at(setupEnd)) ||
    (frame >= at(roastStart) && frame < at(roastEnd)) ||
    (frame >= at(thirdStart) && frame < at(thirdEnd));

  return (
    <div
      style={{
        position: "absolute",
        right: 50,
        bottom: 42,
        width: 318,
        height: 242,
        overflow: "hidden",
        borderRadius: 18,
        border: speaking ? `3px solid ${coral}` : "2px solid rgba(244, 243, 239, 0.18)",
        background: "rgba(17, 19, 22, 0.96)",
        boxShadow: speaking
          ? "0 18px 42px rgba(0, 0, 0, 0.42), 0 0 0 4px rgba(255, 114, 92, 0.16)"
          : "0 18px 42px rgba(0, 0, 0, 0.36)",
      }}
    >
      <Img
        src={staticFile("riff-avatar.png")}
        style={{
          position: "absolute",
          inset: "-26px 18px 16px 18px",
          width: 282,
          height: 282,
          objectFit: "contain",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "13px 16px",
          background: "rgba(8, 9, 11, 0.88)",
          color: text,
          fontFamily: "Manrope, sans-serif",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 9}}>
          <span style={{width: 8, height: 8, borderRadius: 8, background: coral}} />
          <strong style={{fontSize: 18, fontWeight: 850, letterSpacing: "-0.02em"}}>Riff</strong>
          <span style={{color: muted, fontSize: 13, fontWeight: 650}}>AI cohost</span>
        </div>
        <Equalizer active={speaking} />
      </div>
    </div>
  );
}

function RiffCaption() {
  const frame = useCurrentFrame();
  const timeMs = (frame / 60) * 1000;
  const active = captions.find((caption) => timeMs >= caption.startMs && timeMs < caption.endMs);

  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: 50,
        bottom: 306,
        width: 600,
        padding: "18px 22px 20px",
        borderRadius: 16,
        background: "rgba(17, 19, 22, 0.94)",
        boxShadow: "0 18px 42px rgba(0, 0, 0, 0.34)",
        color: text,
        fontFamily: "Manrope, sans-serif",
      }}
    >
      <div style={{marginBottom: 7, color: "#ff9a88", fontSize: 14, fontWeight: 850}}>RIFF</div>
      <div style={{fontSize: 27, fontWeight: 720, lineHeight: 1.28, letterSpacing: "-0.02em"}}>
        {active.text}
      </div>
    </div>
  );
}

function DemoDisclosure() {
  return (
    <div
      style={{
        position: "absolute",
        top: 26,
        left: 32,
        padding: "9px 12px",
        borderRadius: 10,
        background: "rgba(14, 16, 19, 0.78)",
        color: "rgba(244, 243, 239, 0.8)",
        fontFamily: "Manrope, sans-serif",
        fontSize: 13,
        fontWeight: 720,
        letterSpacing: "0.02em",
      }}
    >
      SIMULATED CHAT · SCRIPTED RIFF
    </div>
  );
}

export function AfterplayRiffDemo() {
  return (
    <AbsoluteFill style={{backgroundColor: ink}}>
      <style>{`@font-face { font-family: Manrope; src: url(${staticFile("manrope-latin-wght-normal.woff2")}) format("woff2"); font-weight: 200 800; font-display: swap; }`}</style>

      <Video
        src={staticFile("roblox_gameplay.mov")}
        volume={(frame) => (frame >= at(comebackStart) && frame < at(thirdStart) ? 1 : 0.5)}
        durationInFrames={1594}
      />

      <Sequence from={at(setupStart)} durationInFrames={at(setupEnd - setupStart)}>
        <Audio src={staticFile("riff-setup.mp3")} volume={1} />
      </Sequence>
      <Sequence from={at(roastStart)} durationInFrames={at(roastEnd - roastStart)}>
        <Audio src={staticFile("riff-roast.mp3")} volume={1} />
      </Sequence>
      <Sequence from={at(thirdStart)} durationInFrames={at(thirdEnd - thirdStart)}>
        <Audio src={staticFile("riff-third.mp3")} volume={1} />
      </Sequence>

      <DemoDisclosure />
      <ChatPanel />
      <RiffCaption />
      <RiffCard />
    </AbsoluteFill>
  );
}
