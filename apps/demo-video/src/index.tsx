import { registerRoot, Composition } from 'remotion';
import { StudentDemo } from './StudentDemo';
import { ProviderDemo } from './ProviderDemo';
import { XAd } from './XAd';
import xAdTimeline from '../content/x-ad-timeline.json';
import timeline from '../content/timeline.json';
import providerTimeline from '../content/provider-timeline.json';

registerRoot(() => <>
  <Composition id="XAd" component={XAd} width={1080} height={1080} fps={xAdTimeline.fps} durationInFrames={xAdTimeline.duration * xAdTimeline.fps} defaultProps={{hook:'search' as 'search'|'question',locale:'ja' as 'ja'|'en'}} />
  <Composition id="StudentDemo" component={StudentDemo} width={1920} height={1080} fps={timeline.fps} durationInFrames={timeline.duration * timeline.fps} defaultProps={{locale:'ja' as 'ja'|'en'}} />
  <Composition id="ProviderDemo" component={ProviderDemo} width={1920} height={1080} fps={providerTimeline.fps} durationInFrames={providerTimeline.duration * providerTimeline.fps} defaultProps={{locale:'ja' as 'ja'|'en'}} />
</>);
