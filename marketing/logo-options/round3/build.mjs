import { writeFileSync } from "node:fs";

function tabPath({ w, h, f, r }, x, y) {
  const k = 0.55;
  const total = w + 2 * (f + r);
  const right = x + total - f;
  const left = x + f;
  const bottom = y + h;
  return [
    `M${x} ${bottom}`,
    `C${x + f * k} ${bottom} ${left} ${bottom - f * (1 - k)} ${left} ${bottom - f}`,
    `L${left} ${y + r}`,
    `C${left} ${y + r * (1 - k)} ${left + r * (1 - k)} ${y} ${left + r} ${y}`,
    `L${right - r} ${y}`,
    `C${right - r * (1 - k)} ${y} ${right} ${y + r * (1 - k)} ${right} ${y + r}`,
    `L${right} ${bottom - f}`,
    `C${right} ${bottom - f * (1 - k)} ${x + total - f * k} ${bottom} ${x + total} ${bottom}`,
    "Z",
  ].join(" ");
}

const shape = { w: 30, h: 40, f: 11, r: 14 };
const total = shape.w + 2 * (shape.f + shape.r);
const tab = tabPath(shape, (128 - total) / 2, 128 - shape.h);

const line = (color, glow) => `
  <rect x="52" y="104" width="24" height="5" rx="2.5" fill="${glow}" filter="url(#glow)"/>
  <rect x="52" y="104" width="24" height="5" rx="2.5" fill="${color}"/>`;

const spark = (cx, cy, s, fill, extra = "") => {
  const p = s * 0.12;
  return `<path ${extra} d="M${cx} ${cy - s} C${cx + p} ${cy - p} ${cx + p} ${cy - p} ${cx + s} ${cy} C${cx + p} ${cy + p} ${cx + p} ${cy + p} ${cx} ${cy + s} C${cx - p} ${cy + p} ${cx - p} ${cy + p} ${cx - s} ${cy} C${cx - p} ${cy - p} ${cx - p} ${cy - p} ${cx} ${cy - s} Z" fill="${fill}"/>`;
};
const glowSpark = (cx, cy, s, fill, glow) => `${spark(cx, cy, s, glow, 'filter="url(#sglow)" opacity=".8"')}${spark(cx, cy, s, fill)}`;

const svg = (bgA, bgB, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${bgA}"/>
      <stop offset="1" stop-color="${bgB}"/>
    </linearGradient>
    <linearGradient id="sparkgrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#D6CCFF"/>
      <stop offset=".5" stop-color="#8B7DFF"/>
      <stop offset="1" stop-color="#5EEAD4"/>
    </linearGradient>
    <linearGradient id="tabgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8576FF"/>
      <stop offset="1" stop-color="#4E3FE6"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="#7C6CFF" stop-opacity=".75"/>
      <stop offset="1" stop-color="#7C6CFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="column" cx="0.5" cy="0.62" r="0.32">
      <stop offset="0" stop-color="#8B7DFF" stop-opacity=".55"/>
      <stop offset="1" stop-color="#8B7DFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-400%" width="220%" height="900%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="sglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
    <clipPath id="sq"><rect width="128" height="128" rx="30"/></clipPath>
  </defs>
  <g clip-path="url(#sq)">
  <rect width="128" height="128" fill="url(#bg)"/>${body}
  </g>
</svg>
`;

const DARK = ["#1C1B2E", "#0B0B14"];
const PURPLE = ["#7365FA", "#4232D6"];

const variants = {
  "d1-dark-spark": svg(...DARK, `
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="#fff" fill-opacity=".94"/>${line("#6D5EF8", "#8B7DFF")}
  ${glowSpark(64, 50, 19, "#fff", "#8B7DFF")}`),

  "d2-dark-gradient-spark": svg(...DARK, `
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="#fff" fill-opacity=".94"/>${line("#6D5EF8", "#8B7DFF")}
  ${glowSpark(64, 50, 21, "url(#sparkgrad)", "#7C6CFF")}`),

  "d3-dark-rising": svg(...DARK, `
  <rect width="128" height="128" fill="url(#column)"/>
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="#fff" fill-opacity=".94"/>${line("#6D5EF8", "#8B7DFF")}
  ${glowSpark(64, 64, 12, "#fff", "#A99BFF")}
  ${spark(84, 40, 5, "#fff", 'opacity=".7"')}
  ${spark(46, 34, 3.5, "#fff", 'opacity=".5"')}`),

  "d4-dark-purple-tab": svg(...DARK, `
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="url(#tabgrad)"/>${line("#fff", "#fff")}
  ${glowSpark(64, 50, 19, "#fff", "#8B7DFF")}`),

  "p1-purple-cluster": svg(...PURPLE, `
  <path d="${tab}" fill="#fff"/>${line("#5B4CF5", "#7C6CFF")}
  ${spark(58, 54, 19, "#fff")}
  ${spark(86, 32, 8, "#fff", 'opacity=".85"')}`),

  "p2-purple-offset": svg("#6A5BF8", "#2A1F9E", `
  <path d="${tab}" fill="#fff"/>${line("#5B4CF5", "#7C6CFF")}
  ${glowSpark(84, 42, 22, "#fff", "#C4B5FD")}`),

  "p3-twilight": svg("#5B4CF5", "#0F0D24", `
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="#fff" fill-opacity=".95"/>${line("#6D5EF8", "#8B7DFF")}
  ${glowSpark(64, 50, 19, "#fff", "#C4B5FD")}`),
};

for (const [name, content] of Object.entries(variants)) {
  writeFileSync(new URL(`./${name}.svg`, import.meta.url), content);
}
console.log(Object.keys(variants).join("\n"));
