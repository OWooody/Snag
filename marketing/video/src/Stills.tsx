import { AbsoluteFill } from "remotion";
import { Backdrop, TYPED } from "./SnagVideo";
import { FONT } from "./theme";
import { Browser, FakeApp, RequestPanel, SnagTab, StatusCard } from "./ui";

function Caption({ children }: { children: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 46,
        left: 0,
        right: 0,
        textAlign: "center",
        color: "#fff",
        fontSize: 54,
        fontWeight: 800,
        letterSpacing: "-0.035em",
      }}
    >
      {children}
    </div>
  );
}

export function BeforeStill() {
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop />
      <Caption>You point and ask</Caption>
      <Browser url="staging.acme.app/pricing">
        <FakeApp picked />
        <SnagTab peek={0} mode="idle" frame={0} />
        <RequestPanel open={1} text={TYPED} caret={false} picked />
      </Browser>
    </AbsoluteFill>
  );
}

export function AfterStill() {
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Backdrop />
      <Caption>The agent ships it</Caption>
      <Browser url="staging.acme.app/pricing">
        <FakeApp built={1} yearly={1} />
        <StatusCard show={1} phase="live" />
        <SnagTab peek={0} mode="done" frame={0} />
      </Browser>
    </AbsoluteFill>
  );
}
