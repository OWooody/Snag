import type { CSSProperties, ReactNode } from "react";

/**
 * Minimal Markdown renderer for agent question summaries.
 * Supports paragraphs, lists, **bold**, *italic*, and `code` — no HTML.
 */

type InlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

type Block =
  | { type: "paragraph"; parts: InlinePart[] }
  | { type: "ul"; items: InlinePart[][] }
  | { type: "ol"; items: InlinePart[][] };

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function parseLightMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: InlinePart[][] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (!text) return;
    blocks.push({ type: "paragraph", parts: parseInline(text) });
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(parseInline(ulMatch[1]));
      continue;
    }
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(parseInline(olMatch[1]));
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let lastIndex = 0;
  INLINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_RE.exec(text)) != null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push({ type: "italic", value: token.slice(1, -1) });
    } else {
      parts.push({ type: "text", value: token });
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

function renderInline(parts: InlinePart[], keyPrefix: string): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (part.type) {
      case "bold":
        return <strong key={key}>{part.value}</strong>;
      case "italic":
        return <em key={key}>{part.value}</em>;
      case "code":
        return (
          <code
            key={key}
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.92em",
              background: "rgba(0,0,0,0.06)",
              borderRadius: 4,
              padding: "0 4px",
            }}
          >
            {part.value}
          </code>
        );
      default:
        return <span key={key}>{part.value}</span>;
    }
  });
}

export function LightMarkdown({
  text,
  color,
  fontSize = 12,
}: {
  text: string;
  color: string;
  fontSize?: number;
}) {
  const blocks = parseLightMarkdown(text);
  const base: CSSProperties = {
    margin: 0,
    fontSize,
    color,
    lineHeight: 1.45,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <p key={blockIndex} style={base}>
              {renderInline(block.parts, `p${blockIndex}`)}
            </p>
          );
        }
        const ListTag = block.type === "ol" ? "ol" : "ul";
        return (
          <ListTag
            key={blockIndex}
            style={{
              ...base,
              // Keep list markers — `display: flex` on ol/ul hides numbering.
              paddingLeft: 22,
              margin: 0,
              listStyleType: block.type === "ol" ? "decimal" : "disc",
              listStylePosition: "outside",
            }}
          >
            {block.items.map((item, itemIndex) => (
              <li
                key={itemIndex}
                style={{ margin: 0, marginBottom: itemIndex < block.items.length - 1 ? 4 : 0 }}
              >
                {renderInline(item, `l${blockIndex}-${itemIndex}`)}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}
