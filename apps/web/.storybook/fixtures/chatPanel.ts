import type { ChatStreamEvent } from '../../src/lib/api';
import { answer, citations } from './chat';
import { englishAnswer, englishCitations, englishQuestion, historyItem } from './chatHistory';

export const courseId = 3;
export const shareToken = 'storybook-course-chat';
export const studySessionId = '8cb5df8c-8841-4e51-98b4-80a48517fa0c';
export const question = historyItem.question;
export const searchQuery = '回転行列の定義と具体例';
export const firstTokens = '回転行列は、ベクトルの長さを変えずに';
export const searchingEvents: ChatStreamEvent[] = [{ type: 'searching', search_id: 1, query: searchQuery }];
export const reviewedEvents: ChatStreamEvent[] = [
  ...searchingEvents,
  { type: 'search_completed', search_id: 1, query: searchQuery, result_count: 3 },
];
export const answerEvents = (english = false): ChatStreamEvent[] => [
  { type: 'content_chunk', text: english ? englishAnswer : answer },
  { type: 'done', chat_log_id: 101, feedback: null, citations: english ? englishCitations : citations },
];
export const courseHistory = [{ ...historyItem, course: courseId }];
export const englishHistory = [{ ...courseHistory[0], question: englishQuestion, answer: englishAnswer, citations: englishCitations, asked_by: null, is_shared_origin: true }];
