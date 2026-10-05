import { registerRoot, Composition } from 'remotion';
import { StudentDemo } from './StudentDemo';
import { ProviderDemo } from './ProviderDemo';
import timeline from '../content/timeline.json';
import providerTimeline from '../content/provider-timeline.json';

registerRoot(() => <>
  <Composition id="StudentDemo" component={StudentDemo} width={1920} height={1080} fps={timeline.fps} durationInFrames={timeline.duration * timeline.fps} defaultProps={{locale:'ja' as 'ja'|'en'}} />
  <Composition id="ProviderDemo" component={ProviderDemo} width={1920} height={1080} fps={providerTimeline.fps} durationInFrames={providerTimeline.duration * providerTimeline.fps} defaultProps={{locale:'ja' as 'ja'|'en'}} />
</>);
