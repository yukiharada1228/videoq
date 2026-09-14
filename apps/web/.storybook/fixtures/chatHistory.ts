import type { Message } from '../../src/hooks/useChatMessages';
import type { ChatHistoryItem, ChatLogEvaluation } from '../../src/lib/api';
import { answer, citations, mathAnswer } from './chat';

export const conversation: Message[] = [
  { role: 'user', content: '回転行列について、具体例を使って教えてください。' },
  { role: 'assistant', content: answer, citations, chatLogId: 101, feedback: 'good' },
  { role: 'user', content: '行列の式も確認したいです。' },
  { role: 'assistant', content: mathAnswer, citations, chatLogId: 102, feedback: null },
];

export const longConversation: Message[] = Array.from({ length: 12 }, (_, index) => [
  { role: 'user' as const, content: `質問 ${index + 1}：回転角が ${index * 30} 度のときの計算を教えてください。` },
  { role: 'assistant' as const, content: `回答 ${index + 1}：${answer}`, citations, chatLogId: 201 + index },
]).flat();

export const englishCitations = citations.map((citation, index) => ({
  ...citation,
  title: index === 0 ? 'Linear algebra: rotation matrices' : 'Vectors through examples',
}));
export const englishQuestion = 'How does a rotation matrix preserve the length of a vector?';
export const englishAnswer = 'A rotation matrix changes the direction of a vector without changing its length. [1]\nTry multiplying the matrix by a coordinate vector and comparing the lengths before and after rotation. [2]';

export const historyItem: ChatHistoryItem = {
  id: 101,
  course: 1,
  asked_by: { user_id: 'storybook-learner', username: '山田 花子', email: 'hanako@example.test' },
  question: conversation[0].content,
  answer,
  citations,
  is_shared_origin: false,
  feedback: null,
  created_at: '2026-09-01T03:15:00.000Z',
};

export const completedEvaluation: ChatLogEvaluation = {
  chat_log_id: historyItem.id,
  status: 'completed',
  faithfulness: 0.94,
  answer_relevancy: 0.875,
  context_precision: 1,
  error_message: null,
  evaluated_at: '2026-09-01T03:16:00.000Z',
};
export const pendingEvaluation: ChatLogEvaluation = {
  ...completedEvaluation,
  status: 'pending',
  faithfulness: null,
  answer_relevancy: null,
  context_precision: null,
  evaluated_at: null,
};
export const failedEvaluation: ChatLogEvaluation = {
  ...pendingEvaluation,
  status: 'failed',
  error_message: 'Evaluation service timed out (fixture).',
};

export const mixedHistory: ChatHistoryItem[] = [
  { ...historyItem, evaluation: completedEvaluation, feedback: 'good' },
  {
    ...historyItem,
    id: 102,
    asked_by: null,
    is_shared_origin: true,
    question: '行列の式も確認したいです。',
    answer: mathAnswer,
    evaluation: { ...pendingEvaluation, chat_log_id: 102 },
    created_at: '2026-09-01T03:20:00.000Z',
  },
  {
    ...historyItem,
    id: 103,
    question: '逆回転はどのように計算しますか？',
    answer: '回転角の符号を反転すると、逆向きの回転になります。[1]',
    evaluation: { ...failedEvaluation, chat_log_id: 103 },
    feedback: 'bad',
    created_at: '2026-09-02T05:30:00.000Z',
  },
  {
    ...historyItem,
    id: 104,
    question: '回転行列の復習です。',
    created_at: '2026-09-02T05:35:00.000Z',
  },
];
