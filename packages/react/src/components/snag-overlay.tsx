import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fetchRelayState } from "../api";
import {
  getSnagConfig,
  isDebugEnabled,
  onSnagInit,
  resolveContext,
  resolveRequester,
  resolveTheme,
  startConsoleErrorBuffer,
} from "../config";
import { ACTIVE_POLL_MS, isActiveRequest, startVisiblePolling } from "../polling";
import type { SnagRequestRow, SnagScreenshot } from "../protocol";
import { captureScreenshot } from "../screenshot";
import { countUnseenDone, markDoneSeen } from "../seen-done";
import { TAB_REST_SHAPE, type TabShape } from "../sheet";
import { SnagStyles } from "../styles";
import { FloatingButton } from "./floating-button";
import { RequestPanel } from "./request-panel";

const BADGE_POLL_MS = 30_000;

function doneRequestIds(rows: SnagRequestRow[]): string[] {
  return rows
    .filter((row) => row.status === "finished" || row.status === "merged")
    .map((row) => row.id);
}

/**
 * Mount once at the app root. Renders nothing until `initSnag` has run AND
 * the relay probe confirms the backend is enabled — the server is the single
 * visibility gate, so this is safe to mount unconditionally in every build.
 */
export function SnagOverlay() {
  const [initialized, setInitialized] = useState(() => getSnagConfig() != null);
  const [enabled, setEnabled] = useState(false);
  const [followupsEnabled, setFollowupsEnabled] = useState(false);
  const [agentMode, setAgentMode] = useState<"plan_only" | "execute" | null>(null);
  const [badgeCount, setBadgeCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const lastRequester = useRef<string | null>(null);
  const [environmentLabel, setEnvironmentLabel] = useState("");
  const [panelVisible, setPanelVisible] = useState(false);
  const [opening, setOpening] = useState(false);
  const [morphFrom, setMorphFrom] = useState<TabShape>(TAB_REST_SHAPE);
  const [initialTab, setInitialTab] = useState<"new" | "list">("new");
  const [screenshot, setScreenshot] = useState<SnagScreenshot | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialized) return;
    return onSnagInit(() => setInitialized(true));
  }, [initialized]);

  const refreshBadge = useCallback(async () => {
    const [state, requester] = await Promise.all([
      fetchRelayState(),
      resolveRequester(),
    ]);
    if (!state.enabled) {
      setEnabled(false);
      setBadgeCount(0);
      setRunningCount(0);
      setDoneCount(0);
      setFollowupsEnabled(false);
      return;
    }
    setEnabled(true);
    const followups = state.requester_followups_enabled === true;
    setFollowupsEnabled(followups);
    if (state.agent_mode) setAgentMode(state.agent_mode);
    const mine = (state.requests ?? []).filter(
      (row) => !requester || !row.requester || row.requester === requester,
    );
    setBadgeCount(
      mine.filter(
        (row) =>
          row.status === "awaiting_confirmation" ||
          (followups && row.status === "needs_input"),
      ).length,
    );
    setRunningCount(mine.filter(isActiveRequest).length);
    lastRequester.current = requester;
    setDoneCount(countUnseenDone(requester, doneRequestIds(mine)));
  }, []);

  const markRequestsViewed = useCallback((rows: SnagRequestRow[]) => {
    const requester = lastRequester.current;
    markDoneSeen(
      requester,
      doneRequestIds(
        rows.filter((row) => !requester || !row.requester || row.requester === requester),
      ),
    );
    setDoneCount(0);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    void (async () => {
      if (isDebugEnabled()) {
        console.log("[Snag] overlay probing…");
      }
      const state = await fetchRelayState();
      if (isDebugEnabled()) {
        console.log("[Snag] overlay state", state);
      }
      if (cancelled || !state.enabled) return;
      const context = await resolveContext();
      if (cancelled) return;
      setEnvironmentLabel(
        typeof context.environment === "string" ? context.environment : "dev",
      );
      setEnabled(true);
      setFollowupsEnabled(state.requester_followups_enabled === true);
      if (state.agent_mode) setAgentMode(state.agent_mode);
      if (isDebugEnabled()) {
        console.log("[Snag] overlay enabled");
      }
      if (!cancelled) await refreshBadge();
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, refreshBadge]);

  const active = runningCount > 0;
  useEffect(() => {
    // The open sheet polls the list itself.
    if (!enabled || panelVisible) return;
    return startVisiblePolling(
      () => void refreshBadge(),
      active ? ACTIVE_POLL_MS : BADGE_POLL_MS,
    );
  }, [enabled, panelVisible, active, refreshBadge]);

  useEffect(() => {
    if (!enabled) return;
    return startConsoleErrorBuffer();
  }, [enabled]);

  if (!mounted || !enabled) return null;

  const theme = resolveTheme();

  const openPanel = async (tab: "new" | "list", from: TabShape) => {
    if (opening) return;
    setOpening(true);
    setInitialTab(tab);
    setMorphFrom(from);
    // Capture BEFORE the panel mounts so it never appears in the screenshot.
    setScreenshot(await captureScreenshot());
    setPanelVisible(true);
    setOpening(false);
  };

  return createPortal(
    <div data-snag-overlay="true" dir="ltr">
      <SnagStyles theme={theme} />
      {!panelVisible ? (
        <FloatingButton
          environmentLabel={environmentLabel}
          theme={theme}
          badgeCount={badgeCount}
          doneCount={doneCount}
          running={runningCount > 0}
          busy={opening}
          onPress={(shape) =>
            void openPanel(badgeCount > 0 || doneCount > 0 ? "list" : "new", shape)
          }
        />
      ) : null}
      {panelVisible ? (
        <RequestPanel
          screenshot={screenshot}
          theme={theme}
          morphFrom={morphFrom}
          initialTab={initialTab}
          followupsEnabled={followupsEnabled}
          agentMode={agentMode}
          badgeCount={badgeCount}
          onRequestsViewed={markRequestsViewed}
          onClose={() => {
            setPanelVisible(false);
            void refreshBadge();
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
