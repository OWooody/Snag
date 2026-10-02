import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = createRoot(document.getElementById("root")!);

if (window.location.pathname === "/preview") {
  void import("./preview").then(({ Preview }) => {
    root.render(
      <StrictMode>
        <Preview />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
