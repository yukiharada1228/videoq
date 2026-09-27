import { parseCitationParts } from '@videoq/trpc/chat';
import type { ChatStreamEvent, Citation } from '../../src/lib/api';
import { answer, citations } from './chat';
import { englishAnswer, englishCitations, englishQuestion, historyItem } from './chatHistory';

export const courseId = 3;
export const shareToken = 'storybook-course-chat';
export const question = historyItem.question;
export const searchQuery = '回転行列の定義と具体例';
export const firstTokens = '回転行列は、ベクトルの長さを変えずに';
export const searchingEvents: ChatStreamEvent[] = [{ type: 'searching', search_id: 1, query: searchQuery }];
export const reviewedEvents: ChatStreamEvent[] = [
  ...searchingEvents,
  { type: 'search_completed', search_id: 1, query: searchQuery, result_count: 3 },
];
export const contentEvents = (content: string, sources: Citation[]): ChatStreamEvent[] => [
  ...sources.map((source): ChatStreamEvent => ({ type: 'source', source })),
  ...parseCitationParts(content, id => sources.some(source => source.id === id)).map((part): ChatStreamEvent =>
    part.type === 'text' ? { type: 'text_delta', text: part.text } : { type: 'citation', sourceId: part.sourceId }),
];
export const answerEvents = (english = false): ChatStreamEvent[] => [
  ...contentEvents(english ? englishAnswer : answer, english ? englishCitations : citations),
  { type: 'done', chat_log_id: 101, feedback: null, citations: english ? englishCitations : citations },
];
export const courseHistory = [{ ...historyItem, course: courseId }];
export const englishHistory = [{ ...courseHistory[0], question: englishQuestion, answer: englishAnswer, citations: englishCitations, asked_by: null, is_shared_origin: true }];
