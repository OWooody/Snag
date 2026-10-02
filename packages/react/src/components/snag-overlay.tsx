import { useCallback, useEffect, useState } from "react";
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
import type { SnagScreenshot } from "../protocol";
import { captureScreenshot } from "../screenshot";
import { FloatingButton } from "./floating-button";
import { RequestPanel } from "./request-panel";

const BADGE_POLL_MS = 30_000;

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
  const [environmentLabel, setEnvironmentLabel] = useState("");
  const [panelVisible, setPanelVisible] = useState(false);
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
    setRunningCount(
      mine.filter((row) => row.status === "queued" || row.status === "running").length,
    );
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

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.hidden) return;
      void refreshBadge();
    };
    const id = window.setInterval(tick, BADGE_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refreshBadge();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refreshBadge]);

  useEffect(() => {
    if (!enabled) return;
    return startConsoleErrorBuffer();
  }, [enabled]);

  if (!mounted || !enabled) return null;

  const theme = resolveTheme();

  const openPanel = async (tab: "new" | "list" = "new") => {
    setInitialTab(tab);
    // Capture BEFORE the panel mounts so it never appears in the screenshot.
    setScreenshot(await captureScreenshot());
    setPanelVisible(true);
  };

  return createPortal(
    <div data-snag-overlay="true">
      {!panelVisible ? (
        <FloatingButton
          environmentLabel={environmentLabel}
          theme={theme}
          badgeCount={badgeCount}
          running={runningCount > 0}
          onPress={() => void openPanel(badgeCount > 0 ? "list" : "new")}
        />
      ) : null}
      {panelVisible ? (
        <RequestPanel
          screenshot={screenshot}
          theme={theme}
          initialTab={initialTab}
          followupsEnabled={followupsEnabled}
          agentMode={agentMode}
          badgeCount={badgeCount}
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
