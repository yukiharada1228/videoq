import { type ChatAnswer } from "@videoq/trpc/chat";
import type { Message } from '../../src/hooks/useChatMessages';
import type { ChatHistoryItem } from '../../src/lib/api';
import { answer, answerData, citations, mathAnswerData } from './chat';

export const conversation: Message[] = [
  { role: 'user', content: '回転行列について、具体例を使って教えてください。' },
  { role: 'assistant', answer: answerData,  chatLogId: 101, feedback: 'good' },
  { role: 'user', content: '行列の式も確認したいです。' },
  { role: 'assistant', answer: mathAnswerData,  chatLogId: 102, feedback: null },
];

export const longConversation: Message[] = Array.from({ length: 12 }, (_, index) => [
  { role: 'user' as const, content: `質問 ${index + 1}：回転角が ${index * 30} 度のときの計算を教えてください。` },
  { role: 'assistant' as const, answer: { segments: [{ text: `回答 ${index + 1}：${answer}`, sourceIds: (citations).map(source => source.id) }], sources: citations },  chatLogId: 201 + index },
]).flat();

export const englishCitations = citations.map((citation, index) => ({
  ...citation,
  title: index === 0 ? 'Linear algebra: rotation matrices' : 'Vectors through examples',
}));
export const englishQuestion = 'How does a rotation matrix preserve the length of a vector?';
export const englishAnswerData: ChatAnswer = { segments: [
  { text: 'A rotation matrix changes the direction of a vector without changing its length. ', sourceIds: [1] },
  { text: '\nTry multiplying the matrix by a coordinate vector and comparing the lengths before and after rotation. ', sourceIds: [2] },
], sources: englishCitations };

export const historyItem: ChatHistoryItem = {
  id: 101,
  course: 1,
  asked_by: { user_id: 'storybook-learner', username: '山田 花子', email: 'hanako@example.test' },
  question: '回転行列について、具体例を使って教えてください。',
  answer: answerData,

  is_shared_origin: false,
  feedback: null,
  created_at: '2026-09-01T03:15:00.000Z',
};

export const mixedHistory: ChatHistoryItem[] = [
  { ...historyItem, feedback: 'good' },
  {
    ...historyItem,
    id: 102,
    asked_by: null,
    is_shared_origin: true,
    question: '行列の式も確認したいです。',
    answer: mathAnswerData,
    created_at: '2026-09-01T03:20:00.000Z',
  },
  {
    ...historyItem,
    id: 103,
    question: '逆回転はどのように計算しますか？',
    answer: { segments: [{ text: "回転角の符号を反転すると、逆向きの回転になります。", sourceIds: [1] }], sources: [] },
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
