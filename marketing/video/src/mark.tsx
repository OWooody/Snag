import { ramp } from "./theme";

const TAB = "M24 128C30.05 128 35 123.05 35 117V102C35 94.3 41.3 88 49 88H79C86.7 88 93 94.3 93 102V117C93 123.05 97.95 128 104 128Z";
const SPARK = "M64 31C66.28 47.72 66.28 47.72 83 50C66.28 52.28 66.28 52.28 64 69C61.72 52.28 61.72 52.28 45 50C61.72 47.72 61.72 47.72 64 31Z";

/** The Snag mark, animated: the tab rises, then the spark lifts out of it into place. */
export function AnimatedMark({ frame, size }: { frame: number; size: number }) {
  const tabY = ramp(frame, 4, 18, 44, 0);
  const lift = ramp(frame, 16, 38);
  const sparkY = (1 - lift) * 54;
  const sparkScale = 0.25 + 0.75 * lift;
  const trail = Math.sin(Math.PI * lift) * 0.9;
  const glow = 0.8 + 0.2 * Math.sin(frame / 6);
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="end-bg" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#5B4CF5" />
          <stop offset="1" stopColor="#0F0D24" />
        </linearGradient>
        <radialGradient id="end-halo" cx="0.5" cy="1" r="0.6">
          <stop offset="0" stopColor="#7C6CFF" stopOpacity=".75" />
          <stop offset="1" stopColor="#7C6CFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="end-trail" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#C4B5FD" stopOpacity="0" />
          <stop offset="1" stopColor="#C4B5FD" stopOpacity=".7" />
        </linearGradient>
        <filter id="end-line-glow" x="-60%" y="-400%" width="220%" height="900%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="end-spark-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id="end-square">
          <rect width="128" height="128" rx="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#end-square)">
        <rect width="128" height="128" fill="url(#end-bg)" />
        <rect y="40" width="128" height="88" fill="url(#end-halo)" />
        <rect x="61" y={50 + sparkY} width="6" height={Math.max(0, 52 - sparkY)} rx="3" fill="url(#end-trail)" opacity={trail} />
        <g transform={`translate(0 ${tabY})`}>
          <path d={TAB} fill="#fff" fillOpacity=".95" />
          <rect x="52" y="104" width="24" height="5" rx="2.5" fill="#8B7DFF" filter="url(#end-line-glow)" opacity={glow} />
          <rect x="52" y="104" width="24" height="5" rx="2.5" fill="#6D5EF8" />
        </g>
        <g transform={`translate(64 ${50 + sparkY}) scale(${sparkScale}) translate(-64 -50)`} opacity={ramp(frame, 16, 22)}>
          <path d={SPARK} fill="#C4B5FD" opacity={0.8 * glow} filter="url(#end-spark-glow)" />
          <path d={SPARK} fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
