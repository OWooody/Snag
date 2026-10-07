import { useRef, useState, type ReactNode } from "react";

import {
  ATTACHMENT_ACCEPT,
  readAttachments,
  type LocalAttachment,
} from "../attachments";
import { GLASS_SURFACE } from "../sheet";
import type { SnagTheme } from "../theme";

/** Room for the + control in the bottom-left corner of a composer field. */
export const COMPOSER_PADDING = "12px 14px 42px 14px";

/**
 * Image and text-file picker. The control is a + in the bottom-left of the
 * message field. Images are compressed before they leave the browser; the
 * relay sends them to the agent as visual reference.
 */
export function AttachmentPicker({
  attachments,
  onChange,
  disabled = false,
  theme,
  children,
}: {
  attachments: LocalAttachment[];
  onChange: (next: LocalAttachment[]) => void;
  disabled?: boolean;
  theme: SnagTheme;
  /** The message field. The + sits in its bottom-left corner. */
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = disabled || reading;

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setReading(true);
    setError(null);
    try {
      const { added, error: readError } = await readAttachments(files, attachments);
      if (added.length > 0) onChange([...attachments, ...added]);
      setError(readError);
    } finally {
      setReading(false);
    }
  };

  const plus = (
    <button
      type="button"
      aria-label="Add image or file"
      title="Add image or file"
      disabled={busy}
      onClick={() => inputRef.current?.click()}
      style={{
        position: children ? "absolute" : "relative",
        left: children ? 6 : 0,
        bottom: children ? 6 : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        margin: 0,
        padding: 0,
        border: "none",
        borderRadius: 16,
        background: "transparent",
        color: theme.text,
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.45 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        tabIndex={-1}
        style={{ display: "none" }}
        onChange={(event) => {
          // Copy first. Clearing the input empties the live FileList.
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          void addFiles(files);
        }}
      />
      {attachments.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {attachments.map((item) => (
            <div
              key={item.id}
              style={{
                position: "relative",
                width: item.kind === "image" ? 76 : undefined,
                maxWidth: "100%",
                padding: item.kind === "file" ? "6px 28px 6px 8px" : 0,
                borderRadius: 8,
                background: GLASS_SURFACE,
                border: "1px solid rgba(255,255,255,0.4)",
              }}
            >
              {item.kind === "image" && item.previewUrl ? (
                <>
                  <img
                    src={item.previewUrl}
                    alt=""
                    style={{
                      width: 76,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                  <span
                    style={{
                      display: "block",
                      maxWidth: 76,
                      padding: "4px 4px 6px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: theme.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.name}
                  </span>
                </>
              ) : (
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: theme.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                >
                  {item.name}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                disabled={busy}
                onClick={() => onChange(attachments.filter((other) => other.id !== item.id))}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  border: "none",
                  background: "rgba(0,0,0,0.65)",
                  color: "#fff",
                  fontSize: 12,
                  lineHeight: "18px",
                  padding: 0,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {children ? <div style={{ position: "relative" }}>{children}{plus}</div> : plus}
      {error ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: theme.danger }}>{error}</p>
      ) : null}
    </div>
  );
}
