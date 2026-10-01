import { registerRoot, Composition } from 'remotion';
import { StudentDemo } from './StudentDemo';
import timeline from '../content/timeline.json';

registerRoot(() => <Composition id="StudentDemo" component={StudentDemo} width={1920} height={1080} fps={timeline.fps} durationInFrames={timeline.duration * timeline.fps} defaultProps={{locale:'ja' as 'ja'|'en'}} />);
