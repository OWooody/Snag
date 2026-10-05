import type { SnagElement, SnagScreenshot } from "./protocol";
import { loadImage } from "./stroke-utils";

const JPEG_QUALITY = 0.7;

export interface PickedElement {
  /** The live node, so the picker can reopen with the same selection. */
  element: Element;
  info: SnagElement;
  /** Box relative to `document.body` in CSS px — the screenshot's coordinate space. */
  pageBox: { x: number; y: number; width: number; height: number };
  /** `document.body` width at pick time, to map CSS px onto screenshot px. */
  pageWidth: number;
}

/** Locate `element` in the coordinate space `captureScreenshot` renders (`document.body`). */
export function pagePosition(element: Element): Pick<PickedElement, "pageBox" | "pageWidth"> {
  const rect = element.getBoundingClientRect();
  const body = document.body.getBoundingClientRect();
  // The capture keeps the body's own margin inside the image.
  const bodyStyle = window.getComputedStyle(document.body);
  const marginLeft = parseFloat(bodyStyle.marginLeft) || 0;
  const marginTop = parseFloat(bodyStyle.marginTop) || 0;
  return {
    pageBox: {
      x: rect.left - body.left + marginLeft,
      y: rect.top - body.top + marginTop,
      width: rect.width,
      height: rect.height,
    },
    pageWidth: Math.max(1, body.width),
  };
}

/**
 * Draw a numbered outline for each picked element onto the screenshot and
 * re-encode as JPEG. Numbers match the order of `elements` in the request.
 */
export async function compositeElementHighlights(
  screenshot: SnagScreenshot,
  elements: PickedElement[],
  color: string,
): Promise<SnagScreenshot> {
  if (elements.length === 0) return screenshot;
  const image = await loadImage(`data:image/jpeg;base64,${screenshot.base64}`);
  const canvas = document.createElement("canvas");
  canvas.width = screenshot.width;
  canvas.height = screenshot.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  ctx.drawImage(image, 0, 0, screenshot.width, screenshot.height);

  elements.forEach((element, index) => {
    const scale = screenshot.width / element.pageWidth;
    const pad = 3;
    const x = element.pageBox.x * scale - pad;
    const y = element.pageBox.y * scale - pad;
    const width = element.pageBox.width * scale + pad * 2;
    const height = element.pageBox.height * scale + pad * 2;

    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeRect(x, y, width, height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, width, height);

    const radius = 11;
    const cx = Math.min(Math.max(x, radius), screenshot.width - radius);
    const cy = Math.min(Math.max(y, radius), screenshot.height - radius);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), cx, cy + 0.5);
  });

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  return { base64, width: screenshot.width, height: screenshot.height };
}
