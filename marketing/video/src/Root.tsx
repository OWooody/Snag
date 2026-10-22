import { Composition } from "remotion";
import { SnagVideo, TOTAL_FRAMES, type SnagVideoProps } from "./SnagVideo";

export const RemotionRoot = () => (
  <Composition<any, SnagVideoProps>
    id="SnagDemo"
    component={SnagVideo}
    durationInFrames={TOTAL_FRAMES}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{}}
  />
);
