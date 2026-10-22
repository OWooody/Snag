import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedMark } from "./mark";
import { C, FONT, MONO, linear, ramp, sceneFade } from "./theme";
import {
  AgentLog,
  Browser,
  ClickRipple,
  Cursor,
  FakeApp,
  PickerToolbar,
  RequestPanel,
  SnagTab,
  StatusCard,
  type Phase,
  type TabMode,
} from "./ui";

export type SnagVideoProps = Record<string, never>;

const SCENES = {
  title: { from: 0, dur: 75 },
  demo: { from: 75, dur: 700 },
  everyone: { from: 775, dur: 165 },
  steps: { from: 940, dur: 120 },
  code: { from: 1060, dur: 120 },
  end: { from: 1180, dur: 135 },
};

export const TOTAL_FRAMES = SCENES.end.from + SCENES.end.dur;

export function SnagVideo() {
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop />
      <Sequence from={SCENES.title.from} durationInFrames={SCENES.title.dur}>
        <TitleScene dur={SCENES.title.dur} />
      </Sequence>
      <Sequence from={SCENES.demo.from} durationInFrames={SCENES.demo.dur}>
        <DemoScene dur={SCENES.demo.dur} />
      </Sequence>
      <Sequence from={SCENES.everyone.from} durationInFrames={SCENES.everyone.dur}>
        <EveryoneScene dur={SCENES.everyone.dur} />
      </Sequence>
      <Sequence from={SCENES.steps.from} durationInFrames={SCENES.steps.dur}>
        <StepsScene dur={SCENES.steps.dur} />
      </Sequence>
      <Sequence from={SCENES.code.from} durationInFrames={SCENES.code.dur}>
        <CodeScene dur={SCENES.code.dur} />
      </Sequence>
      <Sequence from={SCENES.end.from} durationInFrames={SCENES.end.dur}>
        <EndScene />
      </Sequence>
    </AbsoluteFill>
  );
}

function Backdrop() {
  const f = useCurrentFrame();
  const x = 30 + 10 * Math.sin(f / 90);
  const y = 20 + 8 * Math.cos(f / 110);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1100px 700px at ${x}% ${y}%, rgba(91,76,245,0.38), transparent 60%),
          radial-gradient(900px 600px at ${100 - x}% ${100 - y}%, rgba(56,189,248,0.14), transparent 60%),
          ${C.night}`,
      }}
    />
  );
}

const gradientText = {
  background: "linear-gradient(90deg, #A99BFF, #7C6CFF 45%, #5EEAD4)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
} as const;

function TitleScene({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: sceneFade(f, dur), color: "#fff" }}>
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.04em", opacity: ramp(f, 0, 18), transform: `translateY(${ramp(f, 0, 18, 30, 0)}px)` }}>
        Everyone at your company has ideas.
      </div>
      <div
        style={{
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          marginTop: 8,
          opacity: ramp(f, 18, 36),
          transform: `translateY(${ramp(f, 18, 36, 30, 0)}px)`,
          ...gradientText,
        }}
      >
        Now they can build them.
      </div>
    </AbsoluteFill>
  );
}

const TYPED = "Add a Monthly / Yearly toggle here. Yearly saves 20%.";

type Key = { t: number; x: number; y: number };
const CURSOR_PATH: Key[] = [
  { t: 20, x: 1500, y: 520 },
  { t: 55, x: 1180, y: 380 },
  { t: 68, x: 1210, y: 366 },
  { t: 80, x: 1182, y: 382 },
  { t: 112, x: 962, y: 1016 },
  { t: 160, x: 962, y: 1016 },
  { t: 170, x: 1028, y: 772 },
  { t: 190, x: 1028, y: 772 },
  { t: 216, x: 1084, y: 318 },
  { t: 240, x: 1084, y: 318 },
  { t: 254, x: 1674, y: 246 },
  { t: 266, x: 1674, y: 246 },
  { t: 290, x: 1330, y: 900 },
  { t: 382, x: 1330, y: 900 },
  { t: 396, x: 1181, y: 1004 },
  { t: 420, x: 1181, y: 1004 },
  { t: 445, x: 1520, y: 780 },
  { t: 580, x: 1520, y: 780 },
  { t: 600, x: 1150, y: 946 },
  { t: 616, x: 1150, y: 946 },
  { t: 642, x: 1142, y: 368 },
];
const CLICKS = [
  { t: 122, x: 962, y: 1016 },
  { t: 174, x: 1028, y: 772 },
  { t: 232, x: 1084, y: 318 },
  { t: 258, x: 1674, y: 246 },
  { t: 400, x: 1181, y: 1004 },
  { t: 606, x: 1150, y: 946 },
  { t: 648, x: 1142, y: 368 },
];

function cursorAt(t: number): { x: number; y: number } {
  if (t <= CURSOR_PATH[0].t) return CURSOR_PATH[0];
  for (let i = 0; i < CURSOR_PATH.length - 1; i++) {
    const a = CURSOR_PATH[i];
    const b = CURSOR_PATH[i + 1];
    if (t <= b.t) return { x: ramp(t, a.t, b.t, a.x, b.x), y: ramp(t, a.t, b.t, a.y, b.y) };
  }
  return CURSOR_PATH[CURSOR_PATH.length - 1];
}

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 0, to: 105, text: "Got an idea?" },
  { from: 105, to: 180, text: "Tap the tab." },
  { from: 180, to: 264, text: "Point at where it goes." },
  { from: 264, to: 405, text: "Describe what you want." },
  { from: 405, to: 562, text: "An AI agent builds it." },
  { from: 562, to: 700, text: "Check it. Ship it." },
];

function DemoScene({ dur }: { dur: number }) {
  const t = useCurrentFrame();

  const panelOpen = t < 200 ? ramp(t, 124, 142) * (1 - ramp(t, 176, 190)) : ramp(t, 258, 276) * (1 - ramp(t, 402, 416));
  const peek = ramp(t, 106, 116) * (1 - ramp(t, 124, 132));
  const tabMode: TabMode = t < 404 ? "idle" : t < 560 ? "sweep" : "done";
  const picked = t >= 232;
  const hover = t >= 205 && t < 232 ? ramp(t, 208, 214) : 0;
  const toolbar = ramp(t, 186, 198) * (1 - ramp(t, 258, 266));
  const typed = TYPED.slice(0, Math.floor(linear(t, 282, 372, 0, TYPED.length)));
  const caret = t >= 276 && t < 402 && (t < 372 || Math.floor(t / 8) % 2 === 0);
  const phase: Phase = t < 455 ? "planning" : t < 515 ? "building" : t < 560 ? "delivering" : t < 612 ? "ready" : "live";
  const card = ramp(t, 410, 425);
  const agent = ramp(t, 414, 428) * (1 - ramp(t, 598, 612));
  const built = ramp(t, 612, 634);
  const yearly = ramp(t, 650, 664);

  const intro = ramp(t, 0, 24);
  const cursor = cursorAt(t);
  const lastClick = [...CLICKS].reverse().find((c) => t >= c.t);
  const pressed = lastClick ? Math.max(0, 1 - Math.abs(t - lastClick.t - 2) / 4) : 0;

  return (
    <AbsoluteFill style={{ opacity: sceneFade(t, dur) }}>
      <Captions t={t} />
      <AbsoluteFill style={{ opacity: intro, transform: `translateY(${(1 - intro) * 40}px) scale(${0.97 + 0.03 * intro})` }}>
        <Browser url="staging.acme.app/pricing">
          <FakeApp built={built} yearly={yearly} hover={hover} picked={picked && t < 612} />
          <PickerToolbar show={toolbar} count={picked ? 1 : 0} />
          <AgentLog show={agent} t={t - 418} />
          <StatusCard show={card} phase={phase} />
          <SnagTab peek={peek} mode={tabMode} frame={t} />
          <RequestPanel open={panelOpen} text={typed} caret={caret} picked={picked} />
        </Browser>
      </AbsoluteFill>
      {CLICKS.map((c) => (
        <ClickRipple key={c.t} x={c.x} y={c.y} t={t - c.t} />
      ))}
      <div style={{ opacity: linear(t, 18, 26) }}>
        <Cursor x={cursor.x} y={cursor.y} pressed={pressed} />
      </div>
    </AbsoluteFill>
  );
}

function Captions({ t }: { t: number }) {
  return (
    <>
      {CAPTIONS.map((c) => {
        const o = Math.min(ramp(t, c.from, c.from + 10), 1 - ramp(t, c.to - 8, c.to));
        if (o <= 0) return null;
        return (
          <div
            key={c.text}
            style={{
              position: "absolute",
              top: 46,
              left: 0,
              right: 0,
              textAlign: "center",
              color: "#fff",
              fontSize: 54,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              opacity: o,
              transform: `translateY(${(1 - o) * 14}px)`,
            }}
          >
            {c.text}
          </div>
        );
      })}
    </>
  );
}

const REQUESTS: { team: string; color: string; text: string; status: "Shipped" | "Building" | "Ready to check"; bug?: boolean }[] = [
  { team: "Sales", color: "#F59E0B", text: "Add a CSV export to the leads table", status: "Shipped" },
  { team: "Ops", color: "#10B981", text: "Build a refund approvals queue", status: "Building" },
  { team: "Support", color: "#3B82F6", text: "Show the customer's plan on every ticket", status: "Shipped" },
  { team: "Marketing", color: "#EC4899", text: "New landing page for the spring launch", status: "Ready to check" },
  { team: "Product", color: "#8B5CF6", text: "Onboarding checklist module for new teams", status: "Building" },
  { team: "QA", color: "#EF4444", text: "Date picker breaks on Safari", status: "Shipped", bug: true },
];

const STATUS_STYLE = {
  Shipped: { color: "#4ADE80", background: "rgba(74,222,128,0.12)" },
  Building: { color: "#A99BFF", background: "rgba(124,108,255,0.16)" },
  "Ready to check": { color: "#FCD34D", background: "rgba(252,211,77,0.12)" },
};

function EveryoneScene({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: sceneFade(f, dur), color: "#fff" }}>
      <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.04em", opacity: ramp(f, 0, 14), transform: `translateY(${ramp(f, 0, 14, 20, 0)}px)` }}>
        Not just bug reports.
      </div>
      <div style={{ marginTop: 14, fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em", opacity: ramp(f, 14, 30), ...gradientText }}>
        Your whole company builds with Snag.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 500px)", gap: 24, marginTop: 64 }}>
        {REQUESTS.map((r, i) => {
          const o = ramp(f, 30 + i * 7, 48 + i * 7);
          return (
            <div
              key={r.text}
              style={{
                height: 170,
                borderRadius: 22,
                padding: "22px 26px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                opacity: o,
                transform: `translateY(${(1 - o) * 30}px) scale(${0.96 + 0.04 * o})`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 650, color: "#D4D4D8" }}>
                <div style={{ width: 30, height: 30, borderRadius: 99, background: r.color, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.team[0]}
                </div>
                {r.team}
                {r.bug ? <span style={{ fontSize: 13, fontWeight: 700, color: "#FCA5A5", padding: "3px 8px", borderRadius: 99, background: "rgba(239,68,68,0.15)" }}>Bug</span> : null}
              </div>
              <div style={{ fontSize: 25, fontWeight: 650, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{r.text}</div>
              <div style={{ alignSelf: "flex-start", fontSize: 15, fontWeight: 700, padding: "5px 12px", borderRadius: 99, ...STATUS_STYLE[r.status] }}>
                {r.status === "Shipped" ? "✓ " : r.status === "Building" ? "● " : ""}
                {r.status}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function StepsScene({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const steps = [
    { n: "1", title: "Tap", body: "A slim tab sits on every internal and staging screen.", icon: <TabIcon /> },
    { n: "2", title: "Describe", body: "Ask for a feature, a whole module, or a fix. Point at where it goes.", icon: <BubbleIcon /> },
    { n: "3", title: "Shipped", body: "An AI agent opens a PR. Check the preview, tap Looks right.", icon: <CheckIcon /> },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: sceneFade(f, dur), color: "#fff" }}>
      <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: "-0.04em", opacity: ramp(f, 0, 15) }}>
        Tap. Describe. <span style={gradientText}>Shipped.</span>
      </div>
      <div style={{ display: "flex", gap: 36, marginTop: 70 }}>
        {steps.map((s, i) => {
          const o = ramp(f, 12 + i * 10, 30 + i * 10);
          return (
            <div
              key={s.n}
              style={{
                width: 440,
                height: 280,
                borderRadius: 28,
                padding: 36,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                opacity: o,
                transform: `translateY(${(1 - o) * 40}px)`,
              }}
            >
              {s.icon}
              <div style={{ marginTop: 26, fontSize: 36, fontWeight: 750, letterSpacing: "-0.02em" }}>{s.title}</div>
              <div style={{ marginTop: 12, fontSize: 21, lineHeight: 1.45, color: "#A1A1AA" }}>{s.body}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

const iconBox = {
  width: 64,
  height: 64,
  borderRadius: 18,
  background: C.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 10px 30px rgba(91,76,245,0.45)",
} as const;

function TabIcon() {
  return (
    <div style={iconBox}>
      <div style={{ width: 36, height: 14, borderRadius: "8px 8px 0 0", background: "#fff", marginTop: 20, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: 18, height: 3, borderRadius: 9, background: C.accent }} />
      </div>
    </div>
  );
}

function BubbleIcon() {
  return (
    <div style={iconBox}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
    </div>
  );
}

function CheckIcon() {
  return (
    <div style={{ ...iconBox, background: C.success, boxShadow: "0 10px 30px rgba(22,163,74,0.45)" }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </div>
  );
}

function CodeScene({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const kw = { color: "#C4B5FD" };
  const fn = { color: "#5EEAD4" };
  const str = { color: "#FCD34D" };
  const dim = { color: "#71717A" };
  const line = (i: number) => ({ opacity: ramp(f, 16 + i * 7, 28 + i * 7), transform: `translateX(${ramp(f, 16 + i * 7, 28 + i * 7, -16, 0)}px)` });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: sceneFade(f, dur), color: "#fff" }}>
      <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.04em", opacity: ramp(f, 0, 14) }}>
        Two lines in your app.
      </div>
      <div
        style={{
          marginTop: 56,
          width: 1100,
          borderRadius: 24,
          background: "rgba(10,10,18,0.85)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.5)",
          padding: "34px 44px",
          fontFamily: MONO,
          fontSize: 30,
          lineHeight: 1.7,
          opacity: ramp(f, 8, 20),
        }}
      >
        <div style={line(0)}>
          <span style={dim}>$ </span>npm install <span style={str}>@snag-tech/react</span>
        </div>
        <div style={{ height: 22 }} />
        <div style={line(1)}>
          <span style={fn}>initSnag</span>({"{ "}endpoint, projectKey{" }"});
        </div>
        <div style={line(2)}>
          <span style={kw}>&lt;SnagOverlay /&gt;</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 40, opacity: ramp(f, 40, 55) }}>
        {["React", "iOS · SnagKit", "Cursor Cloud Agents", "Off in production"].map((chip) => (
          <div
            key={chip}
            style={{
              padding: "12px 22px",
              borderRadius: 99,
              fontSize: 22,
              fontWeight: 600,
              color: "#D4D4D8",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {chip}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function EndScene() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 13, stiffness: 120 } });
  const word = ramp(f, 10, 28);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: "#fff", opacity: linear(f, 0, 10) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <div style={{ transform: `scale(${pop})`, filter: "drop-shadow(0 20px 60px rgba(91,76,245,0.6))" }}>
          <AnimatedMark frame={f} size={210} />
        </div>
        <div style={{ fontSize: 190, fontWeight: 850, letterSpacing: "-0.055em", opacity: word, transform: `translateX(${(1 - word) * -30}px)` }}>
          snag
        </div>
      </div>
      <div style={{ marginTop: 26, fontSize: 46, fontWeight: 650, letterSpacing: "-0.02em", opacity: ramp(f, 26, 42), ...gradientText }}>
        Tap the screen, it gets fixed.
      </div>
      <div style={{ marginTop: 40, fontSize: 28, fontFamily: MONO, color: "#A1A1AA", opacity: ramp(f, 40, 56) }}>
        github.com/OWooody/Snag
      </div>
    </AbsoluteFill>
  );
}
