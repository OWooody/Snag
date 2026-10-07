import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attachmentsTooLarge,
  formatReferenceContext,
  MAX_REFERENCE_IMAGES,
  MAX_TOTAL_IMAGE_BASE64,
  referenceImagesField,
  replyOrAttachmentNote,
} from "./attachments.ts";

Deno.test("formatReferenceContext is empty when nothing was attached", () => {
  assertEquals(formatReferenceContext({ screenshotIncluded: true }), null);
  assertEquals(formatReferenceContext({ screenshotIncluded: false, images: [], files: [] }), null);
});

Deno.test("formatReferenceContext keeps the page screenshot separate from the uploaded image", () => {
  const text = formatReferenceContext({
    screenshotIncluded: true,
    images: [{ name: "mock up.png" }],
  });
  assert(text);
  assertStringIncludes(text, "## How to read the images");
  assertStringIncludes(text, "1. Page screenshot of the current screen only.");
  assertStringIncludes(text, '2. Uploaded reference "mock up.png".');
  assertStringIncludes(text, "do not mean that screenshot");
  assertStringIncludes(text, "add this image to the background");
  assertStringIncludes(text, "Do not ask which image they mean");
  assertStringIncludes(text, "did not come through");
});

Deno.test("formatReferenceContext treats reply images as the image named in the text", () => {
  const text = formatReferenceContext({
    screenshotIncluded: false,
    images: [{ name: "icon.png" }],
  });
  assert(text);
  assertStringIncludes(text, "1. Uploaded reference \"icon.png\".");
  assertStringIncludes(text, "This message has no page screenshot.");
  assert(!text.includes("1. Page screenshot"));
});

Deno.test("formatReferenceContext fences file text and strips newlines from names", () => {
  const text = formatReferenceContext({
    screenshotIncluded: false,
    files: [{ name: "notes\n.md", text: "use ```this```" }],
  });
  assert(text);
  assertStringIncludes(text, "### notes .md");
  assertStringIncludes(text, "````\nuse ```this```\n````");
  assert(!text.includes("notes\n.md"));
});

Deno.test("replyOrAttachmentNote keeps written text and fills image-only replies", () => {
  assertEquals(replyOrAttachmentNote("  Make it blue  ", true), "Make it blue");
  assertEquals(replyOrAttachmentNote("   ", true), "See the attached reference.");
  assertEquals(replyOrAttachmentNote("   ", false), "");
});

Deno.test("attachmentsTooLarge counts the screenshot and reference images together", () => {
  assertEquals(attachmentsTooLarge(MAX_TOTAL_IMAGE_BASE64, undefined), false);
  assertEquals(attachmentsTooLarge(MAX_TOTAL_IMAGE_BASE64, [{ base64: "x" }]), true);
});

Deno.test("reference image schema rejects more images than the agent payload allows", () => {
  const images = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, (_, index) => ({
    name: `ref-${index}.png`,
    base64: "abc",
    width: 10,
    height: 10,
  }));
  assert(!referenceImagesField.safeParse(images).success);
  assert(referenceImagesField.safeParse(images.slice(0, MAX_REFERENCE_IMAGES)).success);
});
