import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { fetchRelayState } from "../api";
import {
  getSnagConfig,
  isDebugEnabled,
  onSnagInit,
  resolveContext,
  resolveTheme,
} from "../config";
import type { SnagScreenshot } from "../protocol";
import { captureScreenshot } from "../screenshot";
import { FloatingButton } from "./floating-button";
import { RequestPanel } from "./request-panel";

/**
 * Mount once at the app root. Renders nothing until `initSnag` has run AND
 * the relay probe confirms the backend is enabled — the server is the single
 * visibility gate, so this is safe to mount unconditionally in every build.
 */
export function SnagOverlay() {
  const [initialized, setInitialized] = useState(() => getSnagConfig() != null);
  const [enabled, setEnabled] = useState(false);
  const [environmentLabel, setEnvironmentLabel] = useState("");
  const [panelVisible, setPanelVisible] = useState(false);
  const [screenshot, setScreenshot] = useState<SnagScreenshot | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialized) return;
    return onSnagInit(() => setInitialized(true));
  }, [initialized]);

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
      if (isDebugEnabled()) {
        console.log("[Snag] overlay enabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized]);

  if (!mounted || !enabled) return null;

  const theme = resolveTheme();

  const openPanel = async () => {
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
          onPress={() => void openPanel()}
        />
      ) : null}
      {panelVisible ? (
        <RequestPanel
          screenshot={screenshot}
          theme={theme}
          onClose={() => setPanelVisible(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
