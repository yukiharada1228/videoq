import { answerParts, type ChatAnswer } from '@videoq/trpc/chat';
import type { ChatStreamEvent } from '../../src/lib/api';
import { answerData } from './chat';
import { englishAnswerData, englishQuestion, historyItem } from './chatHistory';

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
export const contentEvents = (answer: ChatAnswer): ChatStreamEvent[] => [
  ...answer.sources.map((source): ChatStreamEvent => ({ type: 'source', source })),
  ...answerParts(answer).map((part): ChatStreamEvent => part.type === 'text' ? { ...part, type: 'text_delta' } : part),
];
export const answerEvents = (english = false): ChatStreamEvent[] => [
  ...contentEvents(english ? englishAnswerData : answerData),
  { type: 'done', chat_log_id: 101, feedback: null },
];
export const courseHistory = [{ ...historyItem, course: courseId }];
export const englishHistory = [{ ...courseHistory[0], question: englishQuestion, answer: englishAnswerData, asked_by: null, is_shared_origin: true }];
