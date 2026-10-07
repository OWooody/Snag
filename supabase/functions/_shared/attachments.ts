/**
 * Requester-attached images and text files.
 *
 * Images are forwarded to the agent as visual reference (after the page
 * screenshot, when one is included). Text files are inlined into the prompt.
 * Keep the size limits in sync with packages/react/src/attachments.ts.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const MAX_REFERENCE_IMAGES = 3;
export const MAX_REFERENCE_FILES = 3;
export const MAX_REFERENCE_IMAGE_BASE64 = 400_000;
export const MAX_REFERENCE_FILE_CHARS = 20_000;
export const MAX_REFERENCE_NAME = 120;
/** Full page screenshot plus the maximum set of uploaded reference images. */
export const MAX_TOTAL_IMAGE_BASE64 = 4_000_000;

/** Sent when a reply or preview note has attachments and no written text. */
export const ATTACHMENT_ONLY_REPLY = "See the attached reference.";

export const referenceImageSchema = z.object({
  name: z.string().trim().min(1).max(MAX_REFERENCE_NAME),
  base64: z.string().min(1).max(MAX_REFERENCE_IMAGE_BASE64),
  width: z.number().int().positive().max(4000),
  height: z.number().int().positive().max(4000),
});

export const referenceFileSchema = z.object({
  name: z.string().trim().min(1).max(MAX_REFERENCE_NAME),
  text: z.string().min(1).max(MAX_REFERENCE_FILE_CHARS),
});

export const referenceImagesField = z
  .array(referenceImageSchema)
  .max(MAX_REFERENCE_IMAGES)
  .optional();

export const referenceFilesField = z
  .array(referenceFileSchema)
  .max(MAX_REFERENCE_FILES)
  .optional();

export type ReferenceImage = z.infer<typeof referenceImageSchema>;
export type ReferenceFile = z.infer<typeof referenceFileSchema>;

export function attachmentsTooLarge(
  screenshotBase64Length: number,
  images: { base64: string }[] | undefined,
): boolean {
  const extra = (images ?? []).reduce((sum, image) => sum + image.base64.length, 0);
  return screenshotBase64Length + extra > MAX_TOTAL_IMAGE_BASE64;
}

export function replyOrAttachmentNote(reply: string, hasAttachment: boolean): string {
  const trimmed = reply.trim();
  if (trimmed) return trimmed;
  if (hasAttachment) return ATTACHMENT_ONLY_REPLY;
  return "";
}

/** Display name safe to drop into a prompt: no newlines, no backticks. */
export function safeAttachmentName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f`]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_REFERENCE_NAME) || "file";
}

function fence(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((length, run) => Math.max(length, run.length), 0);
  const tick = "`".repeat(Math.max(3, longest + 1));
  return `${tick}\n${text}\n${tick}`;
}

export interface ReferenceContextInput {
  /** True when image 1 in the agent payload is the page screenshot. */
  screenshotIncluded: boolean;
  images?: { name: string }[];
  files?: { name: string; text: string }[];
}

/**
 * Prompt section that tells the agent which picture is the automatic page
 * screenshot and which pictures the requester uploaded for the request text.
 */
export function formatReferenceContext(input: ReferenceContextInput): string | null {
  const images = input.images ?? [];
  const files = input.files ?? [];
  if (images.length === 0 && files.length === 0) return null;

  const lines: string[] = [];
  if (images.length > 0) {
    lines.push("## How to read the images");
    lines.push(
      "The page screenshot and the images the requester uploaded are different. Do not mix them up.",
    );
    if (input.screenshotIncluded) {
      lines.push(
        "The page screenshot is an automatic capture of the screen they were looking at. Use it only to see the current UI and any numbered boxes on elements they picked. It is not a file to put in the product. Words in the request such as \"this image\", \"the attached image\", or \"the picture\" do not mean that screenshot.",
      );
    } else {
      lines.push(
        "This message has no page screenshot. Every image here was uploaded by the requester.",
      );
    }
    lines.push(
      "An uploaded image is the asset or example the request is talking about. If they wrote \"add this image to the background\", \"use the attached picture\", or similar, use the uploaded image — not the page screenshot, and not a picked element.",
    );
    lines.push(
      "Do not ask which image they mean, and do not offer the page screenshot as that image. The upload is already the answer.",
    );
    lines.push(
      "Those uploaded images are attached to this message. Do not ask the requester to re-share them, and do not say an upload did not come through.",
    );
    lines.push("Images are attached in this order:");
    let index = 1;
    if (input.screenshotIncluded) {
      lines.push(`${index}. Page screenshot of the current screen only. Not the image named in the request.`);
      index += 1;
    }
    images.forEach((image, imageIndex) => {
      const name = safeAttachmentName(image.name);
      const which =
        images.length === 1
          ? "This is the image the request means by \"this image\"."
          : imageIndex === 0
          ? "If the request does not name a file, \"this image\" means this first upload."
          : "Another upload. Use it when the request names this file or refers to the next image.";
      lines.push(`${index}. Uploaded reference "${name}". ${which}`);
      index += 1;
    });
    lines.push("");
  }
  if (files.length > 0) {
    lines.push("## Reference files");
    lines.push("The requester attached these files. Use their contents as reference for the change.");
    lines.push("");
    for (const file of files) {
      lines.push(`### ${safeAttachmentName(file.name)}`);
      lines.push(fence(file.text));
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}

export function appendReferenceContext(text: string, input: ReferenceContextInput): string {
  const section = formatReferenceContext(input);
  return section ? `${text}\n\n${section}` : text;
}

export function toAgentImages(
  screenshot: { base64: string; width: number; height: number } | undefined,
  images: { base64: string; width: number; height: number }[] | undefined,
): { base64: string; width: number; height: number }[] {
  return [
    ...(screenshot
      ? [{ base64: screenshot.base64, width: screenshot.width, height: screenshot.height }]
      : []),
    ...(images ?? []).map((image) => ({
      base64: image.base64,
      width: image.width,
      height: image.height,
    })),
  ];
}
