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
const defs = (bgA, bgB) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bgA}"/>
      <stop offset="1" stop-color="${bgB}"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-400%" width="220%" height="900%"><feGaussianBlur stdDeviation="3"/></filter>
    <radialGradient id="halo" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="#7C6CFF" stop-opacity=".75"/>
      <stop offset="1" stop-color="#7C6CFF" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="sq"><rect width="128" height="128" rx="30"/></clipPath>
  </defs>`;
const spark = (cx, cy, s, fill) =>
  `<path d="M${cx} ${cy - s} C${cx + s * 0.12} ${cy - s * 0.12} ${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} C${cx + s * 0.12} ${cy + s * 0.12} ${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} C${cx - s * 0.12} ${cy + s * 0.12} ${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} C${cx - s * 0.12} ${cy - s * 0.12} ${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s} Z" fill="${fill}"/>`;

const svg = (body, bgA, bgB) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${defs(bgA, bgB)}
  <g clip-path="url(#sq)">
  <rect width="128" height="128" fill="url(#bg)"/>${body}
  </g>
</svg>
`;

const variants = {
  "t1-flush": svg(`
  <path d="${tab}" fill="#fff"/>${line("#5B4CF5", "#7C6CFF")}`, "#7365FA", "#4232D6"),

  "t2-dark-glass": svg(`
  <rect x="0" y="40" width="128" height="88" fill="url(#halo)"/>
  <path d="${tab}" fill="#fff" fill-opacity=".94"/>${line("#6D5EF8", "#8B7DFF")}`, "#1C1B2E", "#0B0B14"),

  "t3-spark": svg(`
  <path d="${tab}" fill="#fff"/>${line("#5B4CF5", "#7C6CFF")}
  ${spark(64, 50, 20, "#fff")}`, "#7365FA", "#4232D6"),

  "t4-light": svg(`
  <path d="${tab}" fill="url(#tabfill)"/>
  <defs><linearGradient id="tabfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7365FA"/><stop offset="1" stop-color="#4E3FE6"/></linearGradient></defs>${line("#fff", "#fff")}`, "#FFFFFF", "#EEECF8"),
};

for (const [name, content] of Object.entries(variants)) {
  writeFileSync(new URL(`./${name}.svg`, import.meta.url), content);
}
console.log(Object.keys(variants).join("\n"));
