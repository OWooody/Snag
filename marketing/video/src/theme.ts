import { Easing, interpolate } from "remotion";

export const C = {
  accent: "#5B4CF5",
  accentSoft: "#EEECFE",
  text: "#1B1B24",
  muted: "#71717A",
  surface: "#F4F3F8",
  border: "#E7E5EF",
  success: "#16A34A",
  danger: "#DC2626",
  night: "#0A0A12",
};

export const FONT = '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif';
export const MONO = '"SF Mono", "JetBrains Mono", Menlo, monospace';

export const GLASS = {
  background: "rgba(255,255,255,0.78)",
  backdropFilter: "blur(24px) saturate(180%)",
  WebkitBackdropFilter: "blur(24px) saturate(180%)",
} as const;

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Eased 0→1 (or from→to) between frames a and b, clamped on both ends. */
export function ramp(frame: number, a: number, b: number, from = 0, to = 1): number {
  return interpolate(frame, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
}

export function linear(frame: number, a: number, b: number, from = 0, to = 1): number {
  return interpolate(frame, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Fade a scene in over its first frames and out over its last. */
export function sceneFade(frame: number, duration: number, edge = 12): number {
  return Math.min(linear(frame, 0, edge), linear(frame, duration - edge, duration, 1, 0));
}
