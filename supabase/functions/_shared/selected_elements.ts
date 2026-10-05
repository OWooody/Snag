/**
 * Elements the requester picked on the page with the SDK's element picker.
 * Values come straight from the host page DOM — treat them as untrusted text.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const MAX_SELECTED_ELEMENTS = 8;
const MAX_ATTRIBUTES = 16;

const shortText = (max: number) => z.string().max(max);
const coordinate = z.number().finite();

export const selectedElementSchema = z.object({
  selector: shortText(500).min(1),
  tag: shortText(40).min(1),
  text: shortText(300).optional(),
  attributes: z
    .record(shortText(300))
    .refine((value) => Object.keys(value).length <= MAX_ATTRIBUTES)
    .optional(),
  rect: z.object({
    x: coordinate,
    y: coordinate,
    width: coordinate.nonnegative(),
    height: coordinate.nonnegative(),
  }),
  component: shortText(120).optional(),
  componentStack: z.array(shortText(120)).max(8).optional(),
  source: z
    .object({
      file: shortText(400).min(1),
      line: z.number().int().nonnegative().optional(),
      column: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const selectedElementsSchema = z
  .array(selectedElementSchema)
  .max(MAX_SELECTED_ELEMENTS);

export type SelectedElement = z.infer<typeof selectedElementSchema>;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/`/g, "'").trim();
}

function formatElement(element: SelectedElement, index: number): string[] {
  const heading = [`### ${index + 1}. <${clean(element.tag)}>`];
  if (element.text) heading.push(`"${clean(element.text)}"`);

  const lines = [heading.join(" ")];
  if (element.component) {
    const ancestors = (element.componentStack ?? [])
      .filter((name) => name !== element.component)
      .map(clean);
    lines.push(
      ancestors.length > 0
        ? `- React component: \`${clean(element.component)}\` (inside ${ancestors.map((name) => `\`${name}\``).join(" › ")})`
        : `- React component: \`${clean(element.component)}\``,
    );
  }
  if (element.source) {
    const location = [clean(element.source.file), element.source.line, element.source.column]
      .filter((part) => part !== undefined)
      .join(":");
    lines.push(`- Source hint: \`${location}\` (from a dev build; the file is reliable, the line may be approximate)`);
  }
  lines.push(`- CSS selector: \`${clean(element.selector)}\``);
  const attributes = Object.entries(element.attributes ?? {});
  if (attributes.length > 0) {
    lines.push(
      `- Attributes: ${attributes.map(([name, value]) => `\`${clean(name)}="${clean(value)}"\``).join(", ")}`,
    );
  }
  const { x, y, width, height } = element.rect;
  lines.push(
    `- Position: ${Math.round(width)}×${Math.round(height)} at (${Math.round(x)}, ${Math.round(y)}) in viewport CSS px`,
  );
  return lines;
}

/** Markdown section for the agent prompt, or [] when nothing was picked. */
export function formatSelectedElements(elements: SelectedElement[] | undefined): string[] {
  if (!elements || elements.length === 0) return [];
  const sections = [
    "## Selected elements",
    "The requester clicked these exact elements on the page. Numbered boxes on the screenshot match these numbers. Start here when locating the code.",
  ];
  elements.forEach((element, index) => {
    sections.push("", ...formatElement(element, index));
  });
  return sections;
}
