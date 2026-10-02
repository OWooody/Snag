import type { SnagTheme } from "./theme";

export function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const digits =
    match[1].length === 3
      ? match[1].split("").map((c) => c + c).join("")
      : match[1];
  const n = parseInt(digits, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Keyframes and pseudo-class rules inline styles can't express. Rendered once
 * inside the overlay root; every selector is scoped to it.
 */
export function SnagStyles({ theme }: { theme: SnagTheme }) {
  const root = "[data-snag-overlay]";
  const css = `
${root} .snag-tab-glow { animation: snag-tab-glow 2.2s ease-in-out infinite; }
${root} .snag-tab-done-glow { animation: snag-tab-done-glow 3.4s ease-in-out infinite; }
${root} .snag-tab-sweep { animation: snag-tab-sweep 2.6s cubic-bezier(.65,0,.35,1) infinite; }
${root} .snag-shimmer {
  background: linear-gradient(90deg, rgba(15,15,25,0.07) 30%, rgba(255,255,255,0.75) 50%, rgba(15,15,25,0.07) 70%);
  background-size: 300% 100%;
  animation: snag-shimmer 1.5s ease-in-out infinite;
}
${root} .snag-focus:focus-visible,
${root} .snag-switch-input:focus-visible + .snag-switch-track {
  outline: 2px solid ${withAlpha(theme.accent, 0.55)};
  outline-offset: 2px;
}
${root} .snag-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
${root} .snag-sheet-scroll {
  scrollbar-width: none;
}
${root} .snag-sheet-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
/* Form controls keep the OS UI face unless told to inherit. Match the sheet copy. */
${root} button,
${root} input,
${root} textarea,
${root} select {
  font-family: inherit;
}
@keyframes snag-tab-glow {
  0%, 100% { box-shadow: 0 0 3px 0 ${withAlpha(theme.danger, 0.4)}; }
  50% { box-shadow: 0 0 8px 1px ${withAlpha(theme.danger, 0.7)}, 0 0 16px 3px ${withAlpha(theme.danger, 0.22)}; }
}
@keyframes snag-tab-done-glow {
  0%, 100% { box-shadow: 0 0 2px 0 ${withAlpha(theme.success, 0.3)}; }
  50% { box-shadow: 0 0 7px 1px ${withAlpha(theme.success, 0.55)}, 0 0 14px 3px ${withAlpha(theme.success, 0.16)}; }
}
@keyframes snag-tab-sweep {
  0% { transform: translateX(-14px); }
  100% { transform: translateX(32px); }
}
@keyframes snag-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  ${root} * { animation: none !important; }
  [data-snag-tab] * { transition: none !important; }
}
`;
  return <style>{css}</style>;
}
