import { toCanvas } from "html-to-image";

import type { SnagScreenshot } from "./protocol";

const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.7;

/**
 * Capture the current page, downscaled to at most MAX_WIDTH and compressed
 * to JPEG. Must be called BEFORE the request panel mounts so the panel never
 * appears in its own screenshot. Returns null on failure — a missing
 * screenshot should never block filing a request.
 */
export async function captureScreenshot(): Promise<SnagScreenshot | null> {
  try {
    const canvas = await toCanvas(document.body, {
      cacheBust: true,
      pixelRatio: 1,
      filter: (node) => {
        // Exclude the Snag overlay portal from the capture.
        if (node instanceof HTMLElement && node.dataset.snagOverlay === "true") {
          return false;
        }
        return true;
      },
    });

    const scale = Math.min(1, MAX_WIDTH / Math.max(1, canvas.width));
    const width = Math.round(canvas.width * scale);
    const height = Math.round(canvas.height * scale);

    const output =
      scale < 1
        ? (() => {
            const scaled = document.createElement("canvas");
            scaled.width = width;
            scaled.height = height;
            const ctx = scaled.getContext("2d");
            if (!ctx) throw new Error("canvas context unavailable");
            ctx.drawImage(canvas, 0, 0, width, height);
            return scaled;
          })()
        : canvas;

    const dataUrl = output.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    return { base64, width, height };
  } catch (error) {
    console.warn("[snag] screenshot capture failed:", error);
    return null;
  }
}
