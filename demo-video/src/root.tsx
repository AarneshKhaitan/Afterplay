import {Composition} from "remotion";
import {AfterplayRiffDemo} from "./video";

export const RemotionRoot = () => {
  return (
    <Composition
      id="AfterplayRiffDemo"
      component={AfterplayRiffDemo}
      durationInFrames={1594}
      fps={60}
      width={1920}
      height={1080}
    />
  );
};
