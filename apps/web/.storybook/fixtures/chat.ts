import { chatAnswerText, type ChatAnswer, type ChatSource } from '@videoq/trpc/chat';
import type { ChatProgress } from '../../src/lib/chatProgress';

export const citations = [
  { id: 1, video_id: 7, title: '線形代数：回転行列', start_time: '00:21:37', end_time: '00:22:20' },
  { id: 2, video_id: 12, title: '具体例で学ぶベクトル', start_time: '00:03:10', end_time: '00:04:05' },
] satisfies ChatSource[];

export const answerData: ChatAnswer = { segments: [
  { text: "回転行列は、ベクトルの長さを変えずに向きを変える行列です。", sourceIds: [1] },
  { text: "\n具体例を図と一緒に確認すると理解しやすくなります。", sourceIds: [2] },
], sources: citations };
export const answer = chatAnswerText(answerData);

export const syntaxAnswerData: ChatAnswer = { segments: [
  { text: "数式 / Formula: $ x[01] $", sourceIds: [1] },
  { text: "~~~ $y$\n\n```js\nconst ticks = \"```\";\n[1]\n````\n続き / Next: $z$", sourceIds: [2] },
], sources: citations };

export const longAnswerData: ChatAnswer = {
  segments: Array.from({ length: 8 }, (_, index) => ({
    text: `${index ? '\n\n' : ''}${index + 1}. 回転前後でベクトルの長さが変わらないことを確認します。角度と座標の関係を整理し、講義の例題を使って計算してみましょう。`,
    sourceIds: [1],
  })),
  sources: citations,
};
export const longAnswer = chatAnswerText(longAnswerData);

export const mathAnswerData: ChatAnswer = { segments: [{ text: String.raw`回転角を \(\theta\) とすると、回転行列は次のように表せます。

\[
R(\theta) = \begin{pmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{pmatrix}
\]

この行列を座標ベクトルに掛けると、回転後の座標が求まります。`, sourceIds: [1] }], sources: citations };
export const mathAnswer = chatAnswerText(mathAnswerData);

export const searching = {
  phase: 'searching',
  searches: [
    { id: 1, query: '回転行列の定義と具体例', status: 'complete' },
    { id: 2, query: '回転してもベクトルの長さが変わらない理由', status: 'running' },
  ],
} satisfies ChatProgress;

export const searched: ChatProgress = {
  phase: 'complete',
  searches: searching.searches.map(search => ({ ...search, status: 'complete' })),
};

export const interrupted: ChatProgress = {
  phase: 'error',
  searches: searching.searches.map(search => ({
    ...search,
    status: search.status === 'running' ? 'interrupted' : search.status,
  })),
};
