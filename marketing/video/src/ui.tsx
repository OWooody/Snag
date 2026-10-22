import type { CSSProperties, ReactNode } from "react";
import { interpolateColors } from "remotion";
import { C, FONT, GLASS, MONO, ramp } from "./theme";

/** Browser window placement on the 1920×1080 canvas. Content coords + CONTENT_ORIGIN = canvas coords. */
export const BROWSER = { x: 180, y: 150, w: 1560, h: 880, bar: 46 };
export const CONTENT = { w: BROWSER.w, h: BROWSER.h - BROWSER.bar };
export const CONTENT_ORIGIN = { x: BROWSER.x, y: BROWSER.y + BROWSER.bar };

export function Browser({ children, url }: { children: ReactNode; url: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: BROWSER.x,
        top: BROWSER.y,
        width: BROWSER.w,
        height: BROWSER.h,
        borderRadius: 18,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          height: BROWSER.bar,
          background: "#F1F0F5",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 8,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
        ))}
        <div
          style={{
            margin: "0 auto",
            width: 520,
            height: 28,
            borderRadius: 8,
            background: "#fff",
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT,
            fontSize: 14,
            color: C.muted,
          }}
        >
          {url}
        </div>
        <div style={{ width: 55 }} />
      </div>
      <div style={{ position: "relative", width: CONTENT.w, height: CONTENT.h, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/** Element the requester points at (the pricing subtitle), in content coords. */
export const TARGET = { x: 752, y: 100, w: 296, h: 38 };

/** Billing toggle the agent builds, in content coords. */
export const TOGGLE = { x: 780, y: 150, w: 240, h: 40 };

const PLANS = [
  { name: "Starter", price: 0, features: ["1 project", "Community support", "Basic insights"] },
  { name: "Pro", price: 29, features: ["Unlimited projects", "Priority support", "Advanced insights"] },
  { name: "Team", price: 79, features: ["Everything in Pro", "SSO & roles", "Audit log"] },
];

export function FakeApp({
  built = 0,
  yearly = 0,
  hover = 0,
  picked = false,
}: {
  built?: number;
  yearly?: number;
  hover?: number;
  picked?: boolean;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#FAFAFC", fontFamily: FONT, color: C.text }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 240,
          background: "#fff",
          borderRight: `1px solid ${C.border}`,
          padding: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 22 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#111827" }} />
          Acme
        </div>
        {["Overview", "Projects", "Pricing", "Settings"].map((item) => (
          <div
            key={item}
            style={{
              marginTop: item === "Overview" ? 36 : 8,
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              background: item === "Pricing" ? C.surface : "transparent",
              color: item === "Pricing" ? C.text : C.muted,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 240, right: 0, top: 46, textAlign: "center" }}>
        <div style={{ fontSize: 40, lineHeight: "48px", fontWeight: 800, letterSpacing: "-0.03em" }}>Choose your plan</div>
        <div style={{ marginTop: 10, fontSize: 18, lineHeight: "24px", color: C.muted }}>Simple pricing. Cancel anytime.</div>
      </div>

      <BillingToggle built={built} yearly={yearly} />

      {PLANS.map((plan, i) => {
        const left = 410 + i * 340;
        const isPro = i === 1;
        const price = Math.round(plan.price * (1 - 0.2 * yearly));
        return (
          <div
            key={plan.name}
            style={{
              position: "absolute",
              left,
              top: 210,
              width: 300,
              height: 360,
              borderRadius: 20,
              background: "#fff",
              border: `1px solid ${C.border}`,
              boxShadow: "0 4px 20px rgba(17,17,40,0.05)",
              padding: 24,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: C.muted }}>{plan.name}</div>
            <div style={{ marginTop: 8, fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}>
              ${price}
              <span style={{ fontSize: 18, fontWeight: 500, color: C.muted }}> /mo</span>
              {plan.price > 0 && yearly > 0 ? (
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 0,
                    padding: "4px 8px",
                    borderRadius: 99,
                    verticalAlign: "middle",
                    color: C.success,
                    background: "#DCFCE7",
                    opacity: yearly,
                  }}
                >
                  −20%
                </span>
              ) : null}
            </div>
            {plan.features.map((f) => (
              <div key={f} style={{ marginTop: 14, fontSize: 16, color: "#3F3F46", display: "flex", gap: 10 }}>
                <span style={{ color: C.success }}>✓</span>
                {f}
              </div>
            ))}
            <PlanButton primary={isPro} />
          </div>
        );
      })}

      {hover > 0 || picked ? (
        <div
          style={{
            position: "absolute",
            left: TARGET.x - 6,
            top: TARGET.y - 6,
            width: TARGET.w + 12,
            height: TARGET.h + 12,
            borderRadius: 14,
            border: `2.5px solid ${C.accent}`,
            background: "rgba(91,76,245,0.10)",
            opacity: picked ? 1 : hover,
          }}
        >
          {picked ? (
            <div
              style={{
                position: "absolute",
                left: -14,
                top: -14,
                width: 28,
                height: 28,
                borderRadius: 99,
                background: C.accent,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 3px #fff",
              }}
            >
              1
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanButton({ primary }: { primary: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        right: 24,
        bottom: 24,
        height: 52,
        borderRadius: 12,
        border: primary ? "none" : `1px solid ${C.border}`,
        background: primary ? C.accent : "#fff",
        color: primary ? "#fff" : C.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: 17,
      }}
    >
      Choose plan
    </div>
  );
}

function BillingToggle({ built, yearly }: { built: number; yearly: number }) {
  if (built <= 0.001) return null;
  const half = TOGGLE.w / 2;
  const segment = (on: number): CSSProperties => ({
    position: "relative",
    width: half - 4,
    height: TOGGLE.h - 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 15,
    fontWeight: 650,
    color: interpolateColors(on, [0, 1], [C.muted, C.text]),
    zIndex: 1,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: TOGGLE.x,
        top: TOGGLE.y,
        width: TOGGLE.w,
        height: TOGGLE.h,
        borderRadius: 99,
        background: "#ECEBF3",
        padding: 4,
        display: "flex",
        opacity: built,
        transform: `scale(${0.85 + 0.15 * built})`,
        boxShadow: built < 1 ? `0 0 0 ${8 * (1 - built)}px rgba(91,76,245,${0.25 * (1 - built)})` : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 4 + (half - 4) * yearly,
          width: half - 4,
          height: TOGGLE.h - 8,
          borderRadius: 99,
          background: "#fff",
          boxShadow: "0 2px 8px rgba(17,17,40,0.12)",
        }}
      />
      <div style={segment(1 - yearly)}>Monthly</div>
      <div style={segment(yearly)}>
        Yearly
        <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: C.success }}>−20%</span>
      </div>
    </div>
  );
}

export type TabMode = "idle" | "sweep" | "done";

/** The Snag tab, bottom-center of the content area. */
export function SnagTab({ peek, mode, frame }: { peek: number; mode: TabMode; frame: number }) {
  const w = 120 + 150 * peek;
  const h = 18 + 22 * peek;
  const sweepX = ((Math.sin(frame / 7) + 1) / 2) * (56 - 14);
  return (
    <div
      style={{
        position: "absolute",
        left: (CONTENT.w - w) / 2,
        bottom: 0,
        width: w,
        height: h,
        borderRadius: "16px 16px 0 0",
        ...GLASS,
        border: "1px solid rgba(17,17,40,0.10)",
        borderBottom: "none",
        boxShadow: "0 -6px 24px rgba(17,17,40,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      {peek > 0.05 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
            fontWeight: 600,
            color: C.text,
            opacity: peek,
            whiteSpace: "nowrap",
          }}
        >
          <ChatIcon />
          What's on your mind?
        </div>
      ) : null}
      {mode === "done" ? (
        <div
          style={{
            height: 20,
            padding: "0 8px",
            borderRadius: 99,
            background: C.success,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 3,
            boxShadow: "0 0 16px rgba(22,163,74,0.6)",
          }}
        >
          ✓ 1
        </div>
      ) : peek < 0.5 ? (
        <div
          style={{
            position: "relative",
            width: 56,
            height: 4,
            borderRadius: 99,
            background: "#D4D4D8",
            overflow: "hidden",
            opacity: 1 - peek * 2,
          }}
        >
          {mode === "sweep" ? (
            <div
              style={{
                position: "absolute",
                left: sweepX,
                width: 14,
                height: 4,
                borderRadius: 99,
                background: C.accent,
                boxShadow: `0 0 10px ${C.accent}`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/** Request panel geometry in content coords. */
export const PANEL = { w: 600, h: 400 };
export const PANEL_LEFT = (CONTENT.w - PANEL.w) / 2;

export function RequestPanel({
  open,
  text,
  caret,
  picked,
}: {
  open: number;
  text: string;
  caret: boolean;
  picked: boolean;
}) {
  if (open <= 0.001) return null;
  const thumbScale = 220 / CONTENT.w;
  return (
    <div
      style={{
        position: "absolute",
        left: PANEL_LEFT,
        bottom: 0,
        width: PANEL.w,
        height: PANEL.h,
        borderRadius: "22px 22px 0 0",
        ...GLASS,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(17,17,40,0.10)",
        boxShadow: "0 -20px 60px rgba(17,17,40,0.18)",
        transform: `translateY(${(1 - open) * 105}%)`,
        fontFamily: FONT,
        color: C.text,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 32 }}>
        <div style={{ fontSize: 19, fontWeight: 700 }}>New request</div>
        <div style={{ fontSize: 20, color: C.muted }}>×</div>
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        <div
          style={{
            width: 220,
            height: CONTENT.h * thumbScale,
            borderRadius: 10,
            overflow: "hidden",
            position: "relative",
            border: `1px solid ${C.border}`,
          }}
        >
          <div style={{ width: CONTENT.w, height: CONTENT.h, transform: `scale(${thumbScale})`, transformOrigin: "0 0" }}>
            <FakeApp picked={picked} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PanelChip label="Mark up" />
          <PanelChip label={picked ? "1 element selected" : "Select elements"} active={picked} />
        </div>
      </div>
      <div
        style={{
          marginTop: 20,
          height: 100,
          borderRadius: 14,
          background: "#fff",
          border: `1.5px solid ${text ? C.accent : C.border}`,
          padding: "14px 16px",
          fontSize: 18,
          lineHeight: 1.45,
          color: text ? C.text : C.muted,
        }}
      >
        {text || "Describe the change…"}
        {caret ? <span style={{ color: C.accent, fontWeight: 300 }}>|</span> : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
        <div style={{ fontSize: 14, color: C.muted, padding: "8px 12px", borderRadius: 99, background: C.surface }}>
          How you got here · /overview → /pricing
        </div>
        <div
          style={{
            width: 110,
            height: 42,
            borderRadius: 99,
            background: C.accent,
            color: "#fff",
            fontWeight: 650,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Send
        </div>
      </div>
    </div>
  );
}

function PanelChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      style={{
        width: 200,
        height: 40,
        borderRadius: 99,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : "#fff",
        color: active ? C.accent : C.text,
        fontSize: 15,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </div>
  );
}

export function PickerToolbar({ show, count }: { show: number; count: number }) {
  if (show <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: CONTENT.w - 364,
        top: 24 - (1 - show) * 30,
        width: 340,
        height: 48,
        borderRadius: 99,
        background: "rgba(27,27,36,0.92)",
        color: "#fff",
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px 0 20px",
        opacity: show,
      }}
    >
      {count ? `${count} selected` : "Click what you mean"}
      <div style={{ width: 68, height: 34, borderRadius: 99, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Done
      </div>
    </div>
  );
}

export type Phase = "planning" | "building" | "delivering" | "ready" | "live";

export const CARD = { w: 540, h: 170, bottom: 36 };

export function StatusCard({ show, phase }: { show: number; phase: Phase }) {
  if (show <= 0.001) return null;
  const steps: { key: Phase; label: string }[] = [
    { key: "planning", label: "Planning" },
    { key: "building", label: "Building" },
    { key: "delivering", label: "Delivering" },
  ];
  const order: Phase[] = ["planning", "building", "delivering", "ready", "live"];
  const idx = order.indexOf(phase);
  const finished = phase === "ready" || phase === "live";
  return (
    <div
      style={{
        position: "absolute",
        left: (CONTENT.w - CARD.w) / 2,
        bottom: CARD.bottom + (1 - show) * -40,
        width: CARD.w,
        height: CARD.h,
        borderRadius: 20,
        ...GLASS,
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(17,17,40,0.10)",
        boxShadow: "0 20px 60px rgba(17,17,40,0.18)",
        opacity: show,
        fontFamily: FONT,
        color: C.text,
        padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 650 }}>Add a Monthly / Yearly toggle…</div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "5px 10px",
            borderRadius: 99,
            color: phase === "live" ? C.success : finished ? "#B45309" : C.accent,
            background: phase === "live" ? "#DCFCE7" : finished ? "#FEF3C7" : C.accentSoft,
          }}
        >
          {phase === "live" ? "Live" : finished ? "Ready for you to check" : "In progress"}
        </div>
      </div>
      {finished ? (
        <>
          <div style={{ marginTop: 14, fontSize: 15, color: C.muted, display: "flex", gap: 10, fontFamily: MONO }}>
            <span>snag/billing-toggle</span>·<span style={{ color: C.accent }}>PR #43</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
            {phase === "live" ? (
              <div style={{ fontSize: 16, fontWeight: 650, color: C.success, height: 36, display: "flex", alignItems: "center" }}>
                ✓ Merged and live
              </div>
            ) : (
              <>
                <CardButton label="Not right" />
                <CardButton label="Open preview" />
                <CardButton label="Looks right" primary />
              </>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
          {steps.map((s, i) => {
            const state = i < idx ? "done" : i === idx ? "active" : "todo";
            return (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  background: state === "active" ? C.accentSoft : state === "done" ? "#F0FDF4" : C.surface,
                  color: state === "active" ? C.accent : state === "done" ? C.success : C.muted,
                  border: state === "active" ? `1.5px solid ${C.accent}` : "1.5px solid transparent",
                }}
              >
                {state === "done" ? "✓" : state === "active" ? "●" : "○"} {s.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardButton({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <div
      style={{
        height: 36,
        padding: "0 16px",
        borderRadius: 99,
        fontSize: 15,
        fontWeight: 650,
        display: "flex",
        alignItems: "center",
        background: primary ? C.accent : "#fff",
        color: primary ? "#fff" : C.text,
        border: primary ? "none" : `1px solid ${C.border}`,
      }}
    >
      {label}
    </div>
  );
}

export const AGENT_LINES: { at: number; text: string }[] = [
  { at: 0, text: "Reading the request and screenshot" },
  { at: 20, text: "Found src/pages/Pricing.tsx" },
  { at: 45, text: "Creating BillingToggle.tsx" },
  { at: 75, text: "Yearly price = monthly × 0.8, badge −20%" },
  { at: 105, text: "Pushed branch snag/billing-toggle" },
  { at: 125, text: "Opened PR #43 · preview deploying" },
];

export function AgentLog({ show, t }: { show: number; t: number }) {
  if (show <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        top: 568 + (1 - show) * 40,
        width: 440,
        height: 230,
        borderRadius: 18,
        background: "rgba(14,14,22,0.94)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        opacity: show,
        padding: "16px 20px",
        fontFamily: MONO,
        color: "#E4E4E7",
        fontSize: 14,
      }}
    >
      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 650, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: "#A78BFA", boxShadow: "0 0 10px #A78BFA" }} />
        Cloud agent
        <span style={{ color: "#71717A", fontWeight: 500 }}>· working on your request</span>
      </div>
      {AGENT_LINES.filter((l) => t >= l.at).map((l) => (
        <div key={l.text} style={{ marginTop: 6, opacity: ramp(t, l.at, l.at + 8), display: "flex", gap: 10 }}>
          <span style={{ color: "#A78BFA" }}>›</span>
          {l.text}
        </div>
      ))}
    </div>
  );
}

export function Cursor({ x, y, pressed }: { x: number; y: number; pressed: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - 0.18 * pressed})`, transformOrigin: "0 0", zIndex: 10 }}>
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.35))" }}>
        <path d="M4 2.5 L19.5 13 L12.4 14 L16.4 21.2 L13.6 22.5 L9.7 15.3 L4.6 20.2 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ClickRipple({ x, y, t }: { x: number; y: number; t: number }) {
  if (t < 0 || t > 16) return null;
  const r = 10 + t * 3.2;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: 999,
        border: `3px solid ${C.accent}`,
        opacity: 1 - t / 16,
        zIndex: 9,
      }}
    />
  );
}
