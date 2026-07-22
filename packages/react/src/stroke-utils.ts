import { getStroke } from "perfect-freehand";

import type { SnagScreenshot } from "./protocol";

export type StrokeTool = "pen" | "highlighter";

/** Point in screenshot-native coordinates: [x, y, pressure]. */
export type StrokePoint = [number, number, number];

export interface Stroke {
  tool: StrokeTool;
  points: StrokePoint[];
}

const JPEG_QUALITY = 0.7;

const STROKE_OPTIONS: Record<StrokeTool, Parameters<typeof getStroke>[1]> = {
  pen: {
    size: 6,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  },
  highlighter: {
    size: 28,
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
  },
};

const STROKE_FILL: Record<StrokeTool, string> = {
  pen: "#DC2626",
  highlighter: "rgba(250, 204, 21, 0.4)",
};

export function getStrokeOptions(tool: StrokeTool) {
  return STROKE_OPTIONS[tool];
}

export function getStrokeFill(tool: StrokeTool) {
  return STROKE_FILL[tool];
}

/** Convert perfect-freehand outline points into a filled Path2D. */
export function outlineToPath2D(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1]);
  }
  path.closePath();
  return path;
}

export function strokeToPath2D(stroke: Stroke): Path2D {
  const outline = getStroke(stroke.points, {
    ...getStrokeOptions(stroke.tool),
    last: true,
  });
  return outlineToPath2D(outline);
}

export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  options?: { last?: boolean },
): void {
  if (stroke.points.length === 0) return;
  const outline = getStroke(stroke.points, {
    ...getStrokeOptions(stroke.tool),
    last: options?.last ?? true,
  });
  if (outline.length === 0) return;
  ctx.fillStyle = getStrokeFill(stroke.tool);
  ctx.fill(outlineToPath2D(outline));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load screenshot for annotation"));
    image.src = src;
  });
}

/**
 * Bake vector strokes onto the original screenshot at native resolution and
 * re-encode as JPEG. Returns a new SnagScreenshot for submit.
 */
export async function compositeAnnotatedScreenshot(
  original: SnagScreenshot,
  strokes: Stroke[],
): Promise<SnagScreenshot> {
  const image = await loadImage(`data:image/jpeg;base64,${original.base64}`);
  const canvas = document.createElement("canvas");
  canvas.width = original.width;
  canvas.height = original.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  ctx.drawImage(image, 0, 0, original.width, original.height);
  for (const stroke of strokes) {
    paintStroke(ctx, stroke, { last: true });
  }

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  return { base64, width: original.width, height: original.height };
}
