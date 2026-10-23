import { Composition, Still } from "remotion";
import { AfterStill, BeforeStill } from "./Stills";
import { SnagVideo, TOTAL_FRAMES, type SnagVideoProps } from "./SnagVideo";

export const RemotionRoot = () => (
  <>
    <Composition<any, SnagVideoProps>
      id="SnagDemo"
      component={SnagVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
    <Still id="Before" component={BeforeStill} width={1920} height={1080} />
    <Still id="After" component={AfterStill} width={1920} height={1080} />
  </>
);
