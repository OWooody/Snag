import { useState } from "react";
import { initSnag, SnagOverlay } from "@snag-tech/react";

const endpoint = import.meta.env.VITE_SNAG_ENDPOINT as string | undefined;
const projectKey = import.meta.env.VITE_SNAG_PROJECT_KEY as string | undefined;

if (endpoint && projectKey) {
  initSnag({
    endpoint,
    projectKey,
    getContext: () => ({
      route: window.location.pathname,
      environment: "staging",
      app_version: "0.1.0-demo",
    }),
    getRequester: () => "demo-user",
    debug: true,
  });
}

type Screen = "home" | "settings";

export function App() {
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#fafafa" }}>
      <header
        style={{
          display: "flex",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid #e5e5e5",
          background: "#fff",
        }}
      >
        <button type="button" onClick={() => setScreen("home")}>Home</button>
        <button type="button" onClick={() => setScreen("settings")}>Settings</button>
      </header>

      <main style={{ padding: 24, maxWidth: 720 }}>
        {screen === "home" ? (
          <>
            <h1 style={{ marginTop: 0 }}>Snag demo — Home</h1>
            <p>
              Tap the floating Snag button to file a change request. The overlay
              only appears when the relay is enabled for your project key.
            </p>
            <button
              type="button"
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "#5B4CF5",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              Make this button bigger
            </button>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 0 }}>Settings</h1>
            <p>Try filing a request from a different screen.</p>
          </>
        )}

        {!endpoint || !projectKey ? (
          <p style={{ color: "#b45309", marginTop: 24 }}>
            Set <code>VITE_SNAG_ENDPOINT</code> and <code>VITE_SNAG_PROJECT_KEY</code> in{" "}
            <code>apps/demo/.env</code> to enable the overlay.
          </p>
        ) : null}
      </main>

      <SnagOverlay />
    </div>
  );
}
