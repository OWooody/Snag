import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { SnagScreenshot } from "../protocol";
import {
  GLASS_SURFACE,
  glassBackdropStyle,
  glassSheetStyle,
  useSheetMotion,
} from "../sheet";
import {
  compositeAnnotatedScreenshot,
  paintStroke,
  type Stroke,
  type StrokePoint,
  type StrokeTool,
} from "../stroke-utils";
import type { SnagTheme } from "../theme";

interface ScreenshotAnnotatorProps {
  screenshot: SnagScreenshot;
  theme: SnagTheme;
  onDone: (result: SnagScreenshot) => void;
  onCancel: () => void;
}

export function ScreenshotAnnotator({
  screenshot,
  theme,
  onDone,
  onCancel,
}: ScreenshotAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);

  // Keep a ref of live stroke state for rAF-free redraws from pointer handlers.
  const strokesRef = useRef(strokes);
  const currentRef = useRef(current);
  strokesRef.current = strokes;
  currentRef.current = current;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const maxWidth = container.clientWidth;
      const maxHeight = Math.min(window.innerHeight * 0.55, 480);
      const scale = Math.min(
        maxWidth / Math.max(1, screenshot.width),
        maxHeight / Math.max(1, screenshot.height),
        1,
      );
      setDisplaySize({
        width: Math.max(1, Math.round(screenshot.width * scale)),
        height: Math.max(1, Math.round(screenshot.height * scale)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [screenshot.width, screenshot.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displaySize.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(displaySize.width * dpr);
    canvas.height = Math.round(displaySize.height * dpr);
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      (displaySize.width / screenshot.width) * dpr,
      0,
      0,
      (displaySize.height / screenshot.height) * dpr,
      0,
      0,
    );

    for (const stroke of strokesRef.current) {
      paintStroke(ctx, stroke, { last: true });
    }
    if (currentRef.current) {
      paintStroke(ctx, currentRef.current, { last: false });
    }
  }, [strokes, current, displaySize, screenshot.width, screenshot.height]);

  const toNativePoint = (event: ReactPointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas || displaySize.width === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * screenshot.width;
    const y = ((event.clientY - rect.top) / rect.height) * screenshot.height;
    return [x, y, event.pressure || 0.5];
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toNativePoint(event);
    if (!point) return;
    setCurrent({ tool, points: [point] });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current || saving) return;
    if (event.buttons === 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    const point = toNativePoint(event);
    if (!point) return;
    setCurrent({
      tool: currentRef.current.tool,
      points: [...currentRef.current.points, point],
    });
  };

  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!currentRef.current) return;
    event.preventDefault();
    const finished = currentRef.current;
    setStrokes((prev) => [...prev, finished]);
    setCurrent(null);
  };

  const undo = () => {
    setStrokes((prev) => prev.slice(0, -1));
    setCurrent(null);
  };

  const clearAll = () => {
    setStrokes([]);
    setCurrent(null);
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const allStrokes =
        currentRef.current && currentRef.current.points.length > 0
          ? [...strokesRef.current, currentRef.current]
          : strokesRef.current;
      if (allStrokes.length === 0) {
        onDone(screenshot);
        return;
      }
      const annotated = await compositeAnnotatedScreenshot(screenshot, allStrokes);
      onDone(annotated);
    } catch (error) {
      console.warn("[snag] annotation export failed:", error);
      // Fall back to the original so the user can still submit.
      onDone(screenshot);
    } finally {
      setSaving(false);
    }
  };

  const hasStrokes = strokes.length > 0 || current != null;
  const { open, requestClose } = useSheetMotion(onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Annotate screenshot"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        pointerEvents: open ? "auto" : "none",
        ...glassBackdropStyle(open, "rgba(0,0,0,0.45)"),
      }}
      onClick={requestClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "16px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          ...glassSheetStyle(open),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, color: theme.text }}>Mark up screenshot</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cancel annotation"
            disabled={saving}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              border: "1px solid rgba(255,255,255,0.55)",
              background: GLASS_SURFACE,
              color: theme.text,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: theme.textMuted }}>
          Circle or highlight what should change, then tap Done.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <ToolButton
            label="Pen"
            active={tool === "pen"}
            theme={theme}
            onClick={() => setTool("pen")}
            disabled={saving}
          />
          <ToolButton
            label="Highlighter"
            active={tool === "highlighter"}
            theme={theme}
            onClick={() => setTool("highlighter")}
            disabled={saving}
          />
          <ToolButton
            label="Undo"
            active={false}
            theme={theme}
            onClick={undo}
            disabled={saving || !hasStrokes}
          />
          <ToolButton
            label="Clear"
            active={false}
            theme={theme}
            onClick={clearAll}
            disabled={saving || !hasStrokes}
          />
        </div>

        <div
          ref={containerRef}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            background: GLASS_SURFACE,
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: 12,
            padding: 8,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              position: "relative",
              width: displaySize.width || "100%",
              height: displaySize.height || 200,
              borderRadius: 8,
              overflow: "hidden",
              background: "#111",
            }}
          >
            <img
              src={`data:image/jpeg;base64,${screenshot.base64}`}
              alt="Screenshot to annotate"
              draggable={false}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              style={{
                position: "absolute",
                inset: 0,
                touchAction: "none",
                cursor: "crosshair",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.55)",
              background: GLASS_SURFACE,
              color: theme.text,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={saving}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: theme.accent,
              color: "#fff",
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  theme,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  theme: SnagTheme;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: active ? "none" : "1px solid rgba(255,255,255,0.55)",
        background: active ? theme.accent : GLASS_SURFACE,
        color: active ? "#fff" : theme.text,
        fontWeight: 700,
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
