import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import { createSnagRequest } from "../api";
import { resolveContext } from "../config";
import {
  compositeElementHighlights,
  pagePosition,
  type PickedElement,
} from "../element-highlights";
import { describeElement, elementLabel } from "../element-info";
import {
  dismissNotificationOffer,
  rememberOwnRequest,
  requestNotificationPermission,
  shouldOfferNotifications,
} from "../notifications";
import type { SnagRequestRow, SnagScreenshot } from "../protocol";
import {
  GLASS_BLUR_SATURATE,
  GLASS_FILL,
  GLASS_SURFACE,
  TAB_MOTION_MS,
  TAB_PEEK_SHAPE,
  TAB_REST_SHAPE,
  glassBackdropStyle,
  lerpShape,
  tabPath,
  tabShapeWidth,
  useMorphMotion,
  type TabShape,
} from "../sheet";
import { withAlpha } from "../styles";
import type { SnagTheme } from "../theme";
import { Switch } from "./controls";
import { ElementPicker } from "./element-picker";
import { ChatIcon, TAB_LABEL } from "./floating-button";
import { RequestsList } from "./requests-list";
import { ScreenshotAnnotator } from "./screenshot-annotator";

const MAX_PROMPT_LENGTH = 2000;
const SHEET_MAX_WIDTH = 560;
const SHEET_FLARE = 14;
const SHEET_CORNER = 18;
const SHEET_STROKE = "rgba(255, 255, 255, 0.6)";
/** Keep in sync with the relay's `elements` max. */
const MAX_ELEMENTS = 8;
const GO_STATUS = [
  "Reading this screen…",
  "Analyzing the request…",
  "Doing the magic",
];

const overlayPillStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(0,0,0,0.65)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
};

type Tab = "new" | "list";
type Phase = "editing" | "submitting" | "done";

interface RequestPanelProps {
  screenshot: SnagScreenshot | null;
  theme: SnagTheme;
  onClose: () => void;
  initialTab?: Tab;
  /** Request to expand and scroll to when the sheet opens on the list. */
  initialFocusRequestId?: string | null;
  followupsEnabled?: boolean;
  agentMode?: "plan_only" | "execute" | null;
  /** Pending needs_input count for the Requests tab badge. */
  badgeCount?: number;
  /** Tab shape at the moment it was pressed; the sheet grows out of it. */
  morphFrom?: TabShape;
  /** Called with fresh rows each time the Requests tab loads while on screen. */
  onRequestsViewed?: (rows: SnagRequestRow[]) => void;
}

export function RequestPanel({
  screenshot,
  theme,
  morphFrom = TAB_REST_SHAPE,
  onRequestsViewed,
  onClose,
  initialTab = "new",
  initialFocusRequestId = null,
  followupsEnabled = false,
  agentMode = null,
  badgeCount = 0,
}: RequestPanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [phase, setPhase] = useState<Phase>("editing");
  const [statusIndex, setStatusIndex] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [workingScreenshot, setWorkingScreenshot] = useState<SnagScreenshot | null>(
    screenshot,
  );
  const [isAnnotated, setIsAnnotated] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [elements, setElements] = useState<PickedElement[]>([]);
  const [previewScreenshot, setPreviewScreenshot] = useState<SnagScreenshot | null>(
    screenshot,
  );
  const [agentUrl, setAgentUrl] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [focusRequestId, setFocusRequestId] = useState<string | null>(initialFocusRequestId);
  const [offerNotifications, setOfferNotifications] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const sheetScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "submitting") {
      setStatusIndex(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStatusIndex(GO_STATUS.length - 1);
      return;
    }
    const id = window.setInterval(() => {
      setStatusIndex((index) => (index + 1) % GO_STATUS.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, [phase]);

  const withHighlights = async (base: SnagScreenshot): Promise<SnagScreenshot> => {
    try {
      return await compositeElementHighlights(base, elements, theme.accent);
    } catch (error) {
      console.warn("[snag] element highlight failed:", error);
      return base;
    }
  };

  // Annotations live on `workingScreenshot`; element boxes are layered on top
  // so removing a pick never erases the user's markup.
  useEffect(() => {
    if (!workingScreenshot || elements.length === 0) {
      setPreviewScreenshot(workingScreenshot);
      return;
    }
    let cancelled = false;
    void compositeElementHighlights(workingScreenshot, elements, theme.accent)
      .then((result) => {
        if (!cancelled) setPreviewScreenshot(result);
      })
      .catch(() => {
        if (!cancelled) setPreviewScreenshot(workingScreenshot);
      });
    return () => {
      cancelled = true;
    };
  }, [workingScreenshot, elements, theme.accent]);

  const applyPicks = (picked: Element[]) => {
    setElements((previous) => {
      // The picker never saw nodes that left the page; keep those picks.
      const next = previous.filter((item) => !item.element.isConnected);
      for (const element of picked) {
        if (next.length >= MAX_ELEMENTS) break;
        const existing = previous.find((item) => item.element === element);
        const item = existing ?? {
          element,
          info: describeElement(element),
          ...pagePosition(element),
        };
        if (!next.some((other) => other.info.selector === item.info.selector)) next.push(item);
      }
      return next;
    });
  };

  const removeElement = (index: number) => {
    setElements((previous) => previous.filter((_, i) => i !== index));
  };

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMessage("Describe the change first.");
      return;
    }
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const context = await resolveContext();
      const response = await createSnagRequest({
        prompt: trimmed,
        context,
        screenshot:
          includeScreenshot && workingScreenshot
            ? await withHighlights(workingScreenshot)
            : undefined,
        elements: elements.length > 0 ? elements.map((item) => item.info) : undefined,
        locale: typeof context.locale === "string" ? context.locale : undefined,
      });
      rememberOwnRequest(response.id);
      setOfferNotifications(shouldOfferNotifications());
      setAgentUrl(response.agent_url);
      setSubmittedId(response.id);
      setPhase("done");
      setListRefreshKey((key) => key + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
      setPhase("editing");
    }
  };

  const startAnother = () => {
    setPhase("editing");
    setPrompt("");
    setAgentUrl(null);
    setSubmittedId(null);
    setErrorMessage(null);
    setIncludeScreenshot(true);
    setWorkingScreenshot(screenshot);
    setIsAnnotated(false);
    setTab("new");
  };

  const { open, progress, requestClose } = useMorphMotion(onClose);
  const [sheetNode, setSheetNode] = useState<HTMLDivElement | null>(null);
  const [sheetSize, setSheetSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!sheetNode) return;
    const update = () =>
      setSheetSize({ width: sheetNode.offsetWidth, height: sheetNode.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sheetNode);
    return () => observer.disconnect();
  }, [sheetNode]);

  if (annotating && workingScreenshot) {
    return (
      <ScreenshotAnnotator
        screenshot={workingScreenshot}
        theme={theme}
        onCancel={() => setAnnotating(false)}
        onDone={(result) => {
          setWorkingScreenshot(result);
          setIsAnnotated(result.base64 !== screenshot?.base64);
          setAnnotating(false);
        }}
      />
    );
  }

  if (picking) {
    return (
      <ElementPicker
        theme={theme}
        initial={elements.map((item) => item.element).filter((node) => node.isConnected)}
        max={MAX_ELEMENTS}
        onCancel={() => setPicking(false)}
        onDone={(picked) => {
          applyPicks(picked);
          setPicking(false);
        }}
      />
    );
  }

  const pickLabel = elements.length > 0 ? "Edit elements" : "Select elements";

  // Narrow viewports get an edge-to-edge sheet, so the flare would fall off-screen.
  const fullFlare =
    sheetSize.width >= SHEET_MAX_WIDTH + 2 * SHEET_FLARE ? SHEET_FLARE : 0;
  const fullShape: TabShape = {
    w: Math.max(0, sheetSize.width - 2 * (fullFlare + SHEET_CORNER)),
    h: sheetSize.height,
    f: fullFlare,
    r: SHEET_CORNER,
  };
  const t = Math.min(1, Math.max(0, progress));
  const shape = lerpShape(open ? morphFrom : TAB_REST_SHAPE, fullShape, t);
  const outline = { ...shape, h: shape.h + 1 };
  const shapeX = (sheetSize.width - tabShapeWidth(shape)) / 2;
  const shapeY = sheetSize.height - shape.h;
  const contentReveal = Math.min(1, Math.max(0, (t - 0.55) / 0.45));
  const labelFade =
    open && morphFrom.h >= TAB_PEEK_SHAPE.h ? Math.max(0, 1 - t * 5) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Snag change request"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        // Keep clicks off the page while collapsing.
        pointerEvents: open ? "auto" : "none",
        ...glassBackdropStyle(open, "rgba(0,0,0,0.35)"),
      }}
      onClick={requestClose}
    >
      <div
        ref={setSheetNode}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: `min(${SHEET_MAX_WIDTH + 2 * SHEET_FLARE}px, 100%)`,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `path('${tabPath(outline, true, shapeX, shapeY)}')`,
            background: GLASS_FILL,
            backdropFilter: GLASS_BLUR_SATURATE,
            WebkitBackdropFilter: GLASS_BLUR_SATURATE,
          }}
        />
        <svg
          aria-hidden
          width={sheetSize.width}
          height={sheetSize.height + 1}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <path
            d={tabPath(outline, false, shapeX, shapeY)}
            fill="none"
            stroke={SHEET_STROKE}
            strokeWidth={1}
          />
        </svg>
        {labelFade > 0 ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: TAB_PEEK_SHAPE.h / 2,
              transform: "translateY(50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: theme.text,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              opacity: labelFade,
              pointerEvents: "none",
            }}
          >
            <ChatIcon />
            {TAB_LABEL}
          </div>
        ) : null}
        <div
          style={{
            position: "relative",
            marginRight: fullFlare,
            maxHeight: "85vh",
            opacity: contentReveal,
            transform: `translateY(${(1 - contentReveal) * 10}px)`,
            pointerEvents: contentReveal > 0.9 ? "auto" : "none",
          }}
        >
        <div
          ref={sheetScrollRef}
          className="snag-sheet-scroll"
          style={{
            position: "relative",
            overflow: "auto",
            maxHeight: "85vh",
            boxSizing: "border-box",
            padding: `20px 20px 28px ${20 + fullFlare}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Snag</h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
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

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <TabButton
              active={tab === "new"}
              label="New request"
              theme={theme}
              onClick={() => {
                if (phase === "done") {
                  startAnother();
                  return;
                }
                setTab("new");
              }}
            />
            <TabButton
              active={tab === "list"}
              label="Requests"
              theme={theme}
              badgeCount={badgeCount}
              onClick={() => {
                setFocusRequestId(null);
                setTab("list");
              }}
            />
          </div>

          <AnimatedTabBody tab={tab}>
            {(activeTab) =>
              activeTab === "list" ? (
                <RequestsList
                  theme={theme}
                  refreshKey={listRefreshKey}
                  followupsEnabled={followupsEnabled}
                focusRequestId={focusRequestId}
                onLoaded={onRequestsViewed}
                onNewRequest={() => {
                    if (phase === "done") {
                      startAnother();
                      return;
                    }
                    setTab("new");
                  }}
                />
              ) : phase === "done" ? (
                <div>
                  <p style={{ color: theme.text, fontSize: 15 }}>
                    {agentMode === "execute"
                      ? "Request submitted. The agent plans the change first."
                      : "Request submitted. An agent is working on it."}
                  </p>
                  {agentMode === "execute" ? (
                    <p style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.45 }}>
                      {followupsEnabled
                        ? "If anything is unclear you'll get questions here. "
                        : ""}
                      Depending on the change, a developer may check it first, or you may be
                      asked to try a preview before it goes live. Progress shows on the request
                      card.
                    </p>
                  ) : null}
                  {agentUrl ? (
                    <a
                      href={agentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: theme.accent, fontWeight: 700 }}
                    >
                      Open agent
                    </a>
                  ) : null}
                  {offerNotifications ? (
                    <NotifyOffer theme={theme} onDone={() => setOfferNotifications(false)} />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setFocusRequestId(submittedId);
                      setTab("list");
                    }}
                    style={{
                      display: "block",
                      marginTop: 20,
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: theme.accent,
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {submittedId ? "Track this request" : "View requests"}
                  </button>
                  <button
                    type="button"
                    onClick={startAnother}
                    style={{
                      display: "block",
                      marginTop: 10,
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.55)",
                      background: GLASS_SURFACE,
                      color: theme.text,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    New request
                  </button>
                </div>
              ) : (
                <>
                  <label
                    htmlFor="snag-prompt"
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      color: theme.textMuted,
                      marginBottom: 8,
                    }}
                  >
                    CHANGE REQUEST
                  </label>
                  <textarea
                    id="snag-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    maxLength={MAX_PROMPT_LENGTH}
                    disabled={phase === "submitting"}
                    placeholder="What should change on this screen?"
                    rows={5}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.55)",
                      background: GLASS_SURFACE,
                      color: theme.text,
                      padding: 12,
                      fontSize: 14,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />

                  {workingScreenshot ? (
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 12,
                        background: GLASS_SURFACE,
                        border: "1px solid rgba(255,255,255,0.4)",
                        padding: 12,
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => setAnnotating(true)}
                          disabled={phase === "submitting"}
                          aria-label="Mark up screenshot"
                          style={{
                            display: "block",
                            width: "100%",
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            cursor: phase === "submitting" ? "not-allowed" : "pointer",
                          }}
                        >
                          <img
                            src={`data:image/jpeg;base64,${(previewScreenshot ?? workingScreenshot).base64}`}
                            alt="Screenshot preview"
                            style={{
                              width: "100%",
                              maxHeight: 160,
                              objectFit: "cover",
                              borderRadius: 8,
                              display: "block",
                            }}
                          />
                        </button>
                        {/* Pills sit outside the image button; "Mark up" lets clicks fall through to it. */}
                        <div
                          style={{
                            position: "absolute",
                            left: 10,
                            bottom: 10,
                            display: "flex",
                            gap: 6,
                            pointerEvents: "none",
                          }}
                        >
                          <span style={overlayPillStyle}>
                            {isAnnotated ? "Marked up · Edit" : "Mark up"}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPicking(true)}
                            disabled={phase === "submitting"}
                            style={{
                              ...overlayPillStyle,
                              border: "none",
                              pointerEvents: "auto",
                              cursor: phase === "submitting" ? "not-allowed" : "pointer",
                            }}
                          >
                            {pickLabel}
                          </button>
                        </div>
                      </div>
                      <PickedElementList
                        elements={elements}
                        theme={theme}
                        disabled={phase === "submitting"}
                        onRemove={removeElement}
                      />
                      <div style={{ marginTop: 12 }}>
                        <Switch
                          checked={includeScreenshot}
                          disabled={phase === "submitting"}
                          theme={theme}
                          onChange={setIncludeScreenshot}
                        >
                          Include screenshot with request
                        </Switch>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        onClick={() => setPicking(true)}
                        disabled={phase === "submitting"}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,0.55)",
                          background: GLASS_SURFACE,
                          color: theme.text,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: phase === "submitting" ? "not-allowed" : "pointer",
                        }}
                      >
                        {pickLabel}
                      </button>
                      <PickedElementList
                        elements={elements}
                        theme={theme}
                        disabled={phase === "submitting"}
                        onRemove={removeElement}
                      />
                    </div>
                  )}

                  {errorMessage ? (
                    <p style={{ color: theme.danger, fontSize: 13, marginTop: 12 }}>
                      {errorMessage}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={phase === "submitting"}
                    style={{
                      display: "block",
                      marginTop: 20,
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: theme.accent,
                      color: "#fff",
                      fontWeight: 700,
                      cursor: phase === "submitting" ? "wait" : "pointer",
                      opacity: phase === "submitting" ? 0.7 : 1,
                    }}
                  >
                    <span aria-live="polite">
                      {phase === "submitting" ? GO_STATUS[statusIndex] : "Go"}
                    </span>
                  </button>
                </>
              )
            }
          </AnimatedTabBody>
        </div>
        <SheetScrollThumb scrollerRef={sheetScrollRef} color={withAlpha(theme.text, 0.38)} />
        </div>
      </div>
    </div>
  );
}

/**
 * Crossfades tab content and morphs height so New ↔ Requests expands/collapses
 * smoothly instead of snapping.
 */
function SheetScrollThumb({
  scrollerRef,
  color,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  color: string;
}) {
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      if (scrollHeight <= clientHeight + 1) {
        setThumb(null);
        return;
      }
      const inset = 14;
      const track = Math.max(0, clientHeight - inset * 2);
      const proportional = Math.round((clientHeight / scrollHeight) * track);
      const height = Math.min(48, Math.max(28, proportional));
      const maxTop = Math.max(0, track - height);
      const top =
        inset +
        (scrollHeight === clientHeight
          ? 0
          : (scrollTop / (scrollHeight - clientHeight)) * maxTop);
      setThumb({ top, height });
    };

    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const mutations = new MutationObserver(update);
    mutations.observe(node, { childList: true, subtree: true });
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [scrollerRef]);

  if (!thumb) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: thumb.top,
        right: 0,
        width: 4,
        height: thumb.height,
        borderRadius: "999px 0 0 999px",
        background: color,
        pointerEvents: "none",
      }}
    />
  );
}

function AnimatedTabBody({
  tab,
  children,
}: {
  tab: Tab;
  children: (activeTab: Tab) => ReactNode;
}) {
  const [displayTab, setDisplayTab] = useState(tab);
  const [visible, setVisible] = useState(true);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const innerRef = useRef<HTMLDivElement>(null);
  const heightReady = useRef(false);

  useEffect(() => {
    if (tab === displayTab) return;
    setVisible(false);
    const hideMs = Math.round(TAB_MOTION_MS * 0.45);
    const hideTimer = window.setTimeout(() => setDisplayTab(tab), hideMs);
    return () => window.clearTimeout(hideTimer);
  }, [tab, displayTab]);

  // Fade back in after displayTab catches up. Kept separate so the swap effect's
  // cleanup can't cancel the rAF that restores opacity.
  useEffect(() => {
    if (tab !== displayTab) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [tab, displayTab]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const update = () => {
      const next = inner.offsetHeight;
      setHeight(next);
      heightReady.current = true;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [displayTab, visible]);

  const fadeMs = Math.round(TAB_MOTION_MS * 0.45);

  return (
    <div
      style={{
        height: height ?? "auto",
        overflow: "hidden",
        transition: heightReady.current
          ? `height ${TAB_MOTION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
          : undefined,
      }}
    >
      <div
        ref={innerRef}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: `opacity ${fadeMs}ms ease, transform ${fadeMs}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        {children(displayTab)}
      </div>
    </div>
  );
}

/** One-time offer after the first submit; the permission prompt needs this click. */
function NotifyOffer({ theme, onDone }: { theme: SnagTheme; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        background: GLASS_SURFACE,
        border: "1px solid rgba(255,255,255,0.55)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, color: theme.text }}>
        Get a browser notification when the agent has a question or your change is ready, even
        in another tab.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={asking}
          onClick={() => {
            setAsking(true);
            void requestNotificationPermission().finally(onDone);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: theme.accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            cursor: asking ? "wait" : "pointer",
          }}
        >
          Notify me when it's ready
        </button>
        <button
          type="button"
          onClick={() => {
            dismissNotificationOffer();
            onDone();
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: theme.textMuted,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

function PickedElementList({
  elements,
  theme,
  disabled,
  onRemove,
}: {
  elements: PickedElement[];
  theme: SnagTheme;
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  if (elements.length === 0) return null;
  return (
    <ul
      aria-label="Selected elements"
      style={{
        listStyle: "none",
        margin: "10px 0 0",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {elements.map((element, index) => (
        <li
          key={element.info.selector}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 6px 6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.55)",
            background: GLASS_SURFACE,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: theme.accent,
              color: "#fff",
              fontSize: 11,
              fontWeight: 800,
              lineHeight: "20px",
              textAlign: "center",
            }}
          >
            {index + 1}
          </span>
          <span
            title={element.info.selector}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              color: theme.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {elementLabel(element.info)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remove element ${index + 1}`}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: 12,
              border: "none",
              background: "transparent",
              color: theme.textMuted,
              cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function TabButton({
  active,
  label,
  theme,
  onClick,
  badgeCount = 0,
}: {
  active: boolean;
  label: string;
  theme: SnagTheme;
  onClick: () => void;
  badgeCount?: number;
}) {
  const badgeLabel = badgeCount > 9 ? "9+" : String(badgeCount);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        badgeCount > 0 ? `${label}. ${badgeCount} awaiting your reply` : label
      }
      style={{
        position: "relative",
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: active ? "none" : "1px solid rgba(255,255,255,0.55)",
        background: active ? theme.accent : GLASS_SURFACE,
        color: active ? "#fff" : theme.text,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
      {badgeCount > 0 ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -6,
            right: -4,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: theme.danger,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            lineHeight: "18px",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
}
