import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { describeElement, elementLabel } from "../element-info";
import { GLASS_FILL, GLASS_SURFACE } from "../sheet";
import type { SnagTheme } from "../theme";

interface ElementPickerProps {
  theme: SnagTheme;
  /** Elements already picked; the picker starts from this selection. */
  initial: Element[];
  max: number;
  onDone: (elements: Element[]) => void;
  onCancel: () => void;
}

function isPickable(element: Element): boolean {
  return (
    element !== document.documentElement &&
    element !== document.body &&
    !element.closest("[data-snag-overlay]")
  );
}

function hitTest(x: number, y: number): Element | null {
  return document.elementsFromPoint(x, y).find(isPickable) ?? null;
}

function ancestorAt(element: Element | null, depth: number): Element | null {
  let node = element;
  for (let i = 0; i < depth && node; i += 1) {
    const parent: Element | null = node.parentElement;
    if (!parent || !isPickable(parent)) break;
    node = parent;
  }
  return node;
}

function maxDepth(element: Element | null): number {
  let depth = 0;
  let node = element?.parentElement ?? null;
  while (node && isPickable(node)) {
    depth += 1;
    node = node.parentElement;
  }
  return depth;
}

/**
 * Full-screen picker: hover highlights the element under the pointer, click
 * adds or removes it from the selection. Touch: tap to preview, then Add.
 * Arrow Up/Down walk to the parent/child, Enter finishes, Esc cancels.
 */
export function ElementPicker({ theme, initial, max, onDone, onCancel }: ElementPickerProps) {
  const [target, setTarget] = useState<Element | null>(null);
  const [depth, setDepth] = useState(0);
  const [touchMode, setTouchMode] = useState(false);
  const [picked, setPicked] = useState<Element[]>(initial);
  const [, setLayoutTick] = useState(0);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const targetRef = useRef<Element | null>(null);

  const selected = ancestorAt(target, depth);
  const selectedIsPicked = selected != null && picked.includes(selected);
  const full = picked.length >= max;
  const label = useMemo(
    () => (selected ? elementLabel(describeElement(selected)) : null),
    [selected],
  );

  const retarget = useCallback((x: number, y: number) => {
    const found = hitTest(x, y);
    if (found === targetRef.current) return;
    targetRef.current = found;
    setTarget(found);
    setDepth(0);
  }, []);

  const toggle = useCallback(
    (element: Element) => {
      setPicked((current) => {
        if (current.includes(element)) return current.filter((item) => item !== element);
        if (current.length >= max) return current;
        return [...current, element];
      });
    },
    [max],
  );

  const finish = useCallback(() => {
    // Enter with nothing picked keeps the old one-step flow: take the hovered element.
    if (picked.length === 0 && selected) onDone([selected]);
    else onDone(picked);
  }, [picked, selected, onDone]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "ArrowUp") {
        setDepth((value) => Math.min(value + 1, maxDepth(target)));
      } else if (event.key === "ArrowDown") {
        setDepth((value) => Math.max(0, value - 1));
      } else if (event.key === "Enter") {
        finish();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel, finish, target]);

  useEffect(() => {
    const onLayoutChange = () => {
      if (lastPointer.current && !touchMode) {
        retarget(lastPointer.current.x, lastPointer.current.y);
      }
      setLayoutTick((tick) => tick + 1);
    };
    window.addEventListener("scroll", onLayoutChange, true);
    window.addEventListener("resize", onLayoutChange);
    return () => {
      window.removeEventListener("scroll", onLayoutChange, true);
      window.removeEventListener("resize", onLayoutChange);
    };
  }, [retarget, touchMode]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    setTouchMode(false);
    retarget(event.clientX, event.clientY);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Keep focus and text selection on the page untouched while picking.
    if (event.pointerType === "mouse") event.preventDefault();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      const found = hitTest(event.clientX, event.clientY);
      const element = found === target ? selected : found;
      if (element) toggle(element);
      return;
    }
    setTouchMode(true);
    lastPointer.current = { x: event.clientX, y: event.clientY };
    retarget(event.clientX, event.clientY);
  };

  const rect = selected?.getBoundingClientRect() ?? null;
  const labelAbove = rect ? rect.top > 30 : true;

  return (
    <div role="dialog" aria-modal="true" aria-label="Select an element">
      <div
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          cursor: "crosshair",
          background: "transparent",
          touchAction: "pan-x pan-y",
        }}
      />

      {picked.map((element, index) => {
        const box = element.getBoundingClientRect();
        return (
          <div
            key={index}
            aria-hidden="true"
            style={{
              position: "fixed",
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              zIndex: 2147483646,
              pointerEvents: "none",
              boxSizing: "border-box",
              border: `2px solid ${theme.accent}`,
              borderRadius: 4,
              background: `color-mix(in srgb, ${theme.accent} 8%, transparent)`,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -10,
                left: -10,
                width: 20,
                height: 20,
                borderRadius: 999,
                background: theme.accent,
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 2px #fff",
              }}
            >
              {index + 1}
            </span>
          </div>
        );
      })}

      {rect && !selectedIsPicked ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            zIndex: 2147483646,
            pointerEvents: "none",
            boxSizing: "border-box",
            border: `2px solid ${theme.accent}`,
            boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
            borderRadius: 4,
            background: `color-mix(in srgb, ${theme.accent} 14%, transparent)`,
            transition: "left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease",
          }}
        >
          {label ? (
            <span
              style={{
                position: "absolute",
                left: -2,
                ...(labelAbove ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }),
                maxWidth: 320,
                padding: "3px 8px",
                borderRadius: 6,
                background: "rgba(17,17,24,0.88)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          gap: 8,
          maxWidth: "calc(100% - 24px)",
          boxSizing: "border-box",
          padding: "8px 8px 8px 14px",
          borderRadius: 12,
          background: GLASS_FILL,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.55)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
        }}
      >
        <div aria-live="polite" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
            {full
              ? `Up to ${max} elements`
              : touchMode
                ? "Tap an element, then Add"
                : "Click the elements to change"}
          </div>
          {!touchMode ? (
            <div style={{ fontSize: 11, color: theme.textMuted }}>
              Click again to remove · ↑ ↓ parent / child · Enter done · Esc cancel
            </div>
          ) : null}
        </div>
        {touchMode && selected ? (
          <>
            <BannerButton
              label="Parent"
              theme={theme}
              disabled={depth >= maxDepth(target)}
              onClick={() => setDepth((value) => value + 1)}
            />
            <BannerButton
              label={selectedIsPicked ? "Remove" : "Add"}
              theme={theme}
              disabled={!selectedIsPicked && full}
              onClick={() => toggle(selected)}
            />
          </>
        ) : null}
        <BannerButton label="Cancel" theme={theme} onClick={onCancel} />
        <BannerButton
          label={picked.length > 0 ? `Done (${picked.length})` : "Done"}
          theme={theme}
          primary
          disabled={picked.length === 0}
          onClick={() => onDone(picked)}
        />
      </div>
    </div>
  );
}

function BannerButton({
  label,
  theme,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string;
  theme: SnagTheme;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flexShrink: 0,
        padding: "7px 12px",
        borderRadius: 8,
        border: primary ? "none" : "1px solid rgba(255,255,255,0.55)",
        background: primary ? theme.accent : GLASS_SURFACE,
        color: primary ? "#fff" : theme.text,
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
