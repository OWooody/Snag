/**
 * Turn local files into relay attachments.
 * Size limits match supabase/functions/_shared/attachments.ts.
 */

import type { SnagReferenceFile, SnagReferenceImage } from "./protocol";

export const MAX_REFERENCE_IMAGES = 3;
export const MAX_REFERENCE_FILES = 3;
export const MAX_REFERENCE_IMAGE_BASE64 = 400_000;
export const MAX_REFERENCE_FILE_CHARS = 20_000;
export const MAX_REFERENCE_NAME = 120;
export const MAX_TOTAL_IMAGE_BASE64 = 4_000_000;
const MAX_RAW_BYTES = 8 * 1024 * 1024;

export const ATTACHMENT_ONLY_MESSAGE = "See the attached reference.";

export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.json,.svg,.log,.yml,.yaml,.xml";

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "svg",
  "log",
  "yml",
  "yaml",
  "xml",
]);

export interface LocalAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  previewUrl?: string;
  image?: SnagReferenceImage;
  file?: SnagReferenceFile;
}

export function safeAttachmentName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f`]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_REFERENCE_NAME) || "file";
}

export function attachmentFields(items: LocalAttachment[]): {
  images?: SnagReferenceImage[];
  files?: SnagReferenceFile[];
} {
  const images = items.flatMap((item) => (item.image ? [item.image] : []));
  const files = items.flatMap((item) => (item.file ? [item.file] : []));
  return {
    ...(images.length > 0 ? { images } : {}),
    ...(files.length > 0 ? { files } : {}),
  };
}

/** Written reply, or a short note when the requester attached something and wrote nothing. */
export function messageWithAttachments(
  text: string,
  items: LocalAttachment[],
  maxLength: number,
): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed.slice(0, maxLength);
  if (items.length > 0) return ATTACHMENT_ONLY_MESSAGE;
  return "";
}

export function attachmentsExceedBudget(
  screenshotBase64Length: number,
  items: LocalAttachment[],
): boolean {
  const extra = items.reduce((sum, item) => sum + (item.image?.base64.length ?? 0), 0);
  return screenshotBase64Length + extra > MAX_TOTAL_IMAGE_BASE64;
}

function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === name.toLowerCase() ? "" : ext;
}

function kindFor(file: File): "image" | "file" | null {
  const ext = extensionOf(file.name);
  if (IMAGE_TYPES.has(file.type) || IMAGE_EXTENSIONS.has(ext)) return "image";
  if (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return "file";
  }
  return null;
}

async function encodeImage(file: File): Promise<{ base64: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 1280;
    let quality = 0.7;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not read that image.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      if (base64.length <= MAX_REFERENCE_IMAGE_BASE64) return { base64, width, height };
      if (quality > 0.45) quality = Math.round((quality - 0.1) * 100) / 100;
      else maxEdge = Math.round(maxEdge * 0.75);
    }
    throw new Error("too-large");
  } finally {
    bitmap.close();
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Read a selection of files into attachments, skipping ones that do not fit
 * the remaining slots. Returns the first problem so the picker can explain it.
 */
export async function readAttachments(
  files: File[],
  existing: LocalAttachment[],
): Promise<{ added: LocalAttachment[]; error: string | null }> {
  let imageCount = existing.filter((item) => item.kind === "image").length;
  let fileCount = existing.filter((item) => item.kind === "file").length;
  const added: LocalAttachment[] = [];
  let error: string | null = null;

  for (const file of files) {
    const name = safeAttachmentName(file.name);
    if (file.size > MAX_RAW_BYTES) {
      error ??= `${name} is too large.`;
      continue;
    }
    const kind = kindFor(file);
    if (!kind) {
      error ??= `${name} isn't supported. Use a PNG, JPEG, WebP, GIF, or a text file.`;
      continue;
    }
    if (kind === "image") {
      if (imageCount >= MAX_REFERENCE_IMAGES) {
        error ??= `You can attach up to ${MAX_REFERENCE_IMAGES} images.`;
        continue;
      }
      try {
        const image = await encodeImage(file);
        const named = { ...image, name };
        added.push({
          id: newId(),
          kind: "image",
          name,
          previewUrl: `data:image/jpeg;base64,${image.base64}`,
          image: named,
        });
        imageCount += 1;
      } catch (failure) {
        error ??=
          failure instanceof Error && failure.message === "too-large"
            ? `${name} is too large. Try a smaller image.`
            : `Couldn't read ${name}.`;
      }
      continue;
    }
    if (fileCount >= MAX_REFERENCE_FILES) {
      error ??= `You can attach up to ${MAX_REFERENCE_FILES} text files.`;
      continue;
    }
    const text = (await file.text()).replace(/\u0000/g, "");
    if (!text.trim()) {
      error ??= `${name} is empty.`;
      continue;
    }
    if (text.length > MAX_REFERENCE_FILE_CHARS) {
      error ??= `${name} is too long. Keep text files under ${MAX_REFERENCE_FILE_CHARS.toLocaleString()} characters.`;
      continue;
    }
    added.push({
      id: newId(),
      kind: "file",
      name,
      file: { name, text },
    });
    fileCount += 1;
  }

  return { added, error };
}
