import type { RpcOutputMap } from '@videoq/trpc';
import type { ChatStreamEvent } from '@videoq/trpc/chat';

// Test fixtures only. The application always loads a real public course and SSE.
export const landingCourse = {
  id: 91, name: '伝わる説明のつくり方', description: 'Storybook sample',
  display_order: 0, created_at: '2026-10-01T00:00:00Z', video_count: 1,
  access_role: 'public', share_slug: 'videoq-demo-ja-v1',
  videos: [{ id: 92, title: '伝わる説明のつくり方', description: '',
    file: '/demo/explain-ja.mp4', status: 'completed', source_type: 'uploaded',
    uploaded_at: '2026-10-01T00:00:00Z', order: 0 }],
} satisfies RpcOutputMap['courses.shared'];

export const landingDemoAnswer = '説明は結論から始め、理由と具体例を続けます。';
export function landingDemoEvents(videoId = 92): ChatStreamEvent[] {
  return [
    { type: 'searching', query: '説明の順番', search_id: 1 },
    { type: 'search_completed', query: '説明の順番', search_id: 1, result_count: 1 },
    { type: 'source', source: { id: 1, video_id: videoId, title: '伝わる説明のつくり方', start_time: '00:00:23,400', end_time: '00:00:38,000' } },
    { type: 'text_delta', segmentIndex: 0, text: landingDemoAnswer },
    { type: 'citation', segmentIndex: 0, sourceId: 1 },
    { type: 'done', chat_log_id: null, feedback: null },
  ];
}
