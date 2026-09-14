import type { PlogConcept, PlogEdge, PlogGraph } from '@videoq/trpc';

export const videoId = 42;
export const concept = (id: number, label: string, overrides: Partial<PlogConcept> = {}): PlogConcept => ({
  id, label, node_type: 'object', intro_sec: 60, source_quote: 'ベクトルの長さを保ったまま向きを変えます。',
  opening_question: '回転の前後で変わらない量は何でしょうか？',
  hint_ladder: ['座標の変化を考えましょう。', '長さを比較してみましょう。'],
  misconceptions: ['回転によって長さも変わる'], canonical_order: ['座標を確認', '行列を掛ける', '長さを比較'],
  worked_examples: ['90度回転の計算例'], waypoints: [{ label: '回転行列の導入', start_sec: 60, end_sec: 90 }],
  hint_count: 2, waypoint_count: 1, ...overrides,
});
export const concepts: PlogConcept[] = [
  concept(1, '回転行列'),
  concept(2, '長さの保存', { node_type: 'property', intro_sec: 120 }),
  concept(3, '近似の限界', { node_type: 'limitation', intro_sec: 210, hint_ladder: [], hint_count: 0, waypoints: [], waypoint_count: 0 }),
];
export const edgeTypes = ['prerequisite_of', 'builds_on', 'analogy_for', 'example_of', 'contrasts_with'] as const;
export const edges: PlogEdge[] = edgeTypes.map((edge_type, index) => ({
  id: 11 + index, source_id: index % 3 + 1, source_label: concepts[index % 3].label,
  target_id: (index + 1) % 3 + 1, target_label: concepts[(index + 1) % 3].label,
  edge_type, quote: `関係${index + 1}の根拠：講義の具体例を比較します。`,
}));
export const readyGraph: PlogGraph = {
  video_id: videoId, build_status: 'ready', input_tokens: 1200, output_tokens: 800,
  error_message: '', summary_node_count: 4, concepts, edges,
};
export const emptyGraph: PlogGraph = { ...readyGraph, concepts: [], edges: [], summary_node_count: 0 };
export const missingGraph: PlogGraph = { ...emptyGraph, build_status: 'missing' };
export const failedGraph: PlogGraph = { ...emptyGraph, build_status: 'failed', error_message: '生成処理を完了できませんでした / The build could not be completed.' };
export const englishGraph: PlogGraph = {
  ...readyGraph,
  concepts: concepts.map((item, index) => ({ ...item, label: ['Rotation matrix', 'Length preservation', 'Approximation limits'][index], source_quote: 'The direction changes while the length stays the same.', opening_question: 'What stays the same after a rotation?', hint_ladder: ['Look at the coordinates.', 'Compare the lengths.'], misconceptions: ['Rotation changes the length'], canonical_order: ['Check coordinates', 'Multiply by the matrix'], worked_examples: ['Rotate by 90 degrees'], waypoints: item.waypoints.map(point => ({ ...point, label: 'Introducing rotation matrices' })) })),
  edges: edges.map(item => ({ ...item, source_label: ['Rotation matrix', 'Length preservation', 'Approximation limits'][item.source_id - 1], target_label: ['Rotation matrix', 'Length preservation', 'Approximation limits'][item.target_id - 1], quote: 'Compare the examples in the lecture.' })),
};
export const longLabel = 'RotationMatrixAndLengthPreservation'.repeat(5);
export const longQuote = '講義中の具体例を使って、回転前後の座標と長さの関係を説明します。'.repeat(12);
export const longGraph: PlogGraph = {
  ...readyGraph,
  concepts: [concept(1, longLabel, { source_quote: longQuote, opening_question: longQuote, worked_examples: [longQuote] }), ...concepts.slice(1)],
  edges: edges.map(item => ({ ...item, source_label: item.source_id === 1 ? longLabel : item.source_label, target_label: item.target_id === 1 ? longLabel : item.target_label, quote: longQuote })),
};
export const manyGraph: PlogGraph = {
  ...readyGraph,
  concepts: Array.from({ length: 24 }, (_, index) => concept(index + 1, `概念 ${index + 1}`)),
  edges: Array.from({ length: 23 }, (_, index) => ({ ...edges[0], id: 11 + index, source_id: index + 1, source_label: `概念 ${index + 1}`, target_id: index + 2, target_label: `概念 ${index + 2}` })),
};
