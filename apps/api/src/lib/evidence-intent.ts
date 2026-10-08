/** Conservative positive cues, not a general classifier: unmatched questions
 * still use the agent's normal evidence planning. These cues prevent obvious
 * visual requests from being answered solely from subtitle search results.
 */
export function visualEvidenceIntent(question: string): {
  required: boolean; shortInterval: boolean; inclusiveEnd?: number;
} {
  const q = question.normalize("NFKC");
  const required = /映[像っるり]|画面|見え[るたて]|図形|何色|上段|下段|英数字|[0-9一二三四五六七八九十]+文字.*(?:コード|記号)|(?:コード|文字|図|物体).*(?:表示|映|色|位置)|(?:色|形|個数|位置|順序).*(?:図形|画面|映像)|\b(?:on[- ]screen|visually|visible|alphanumeric|[a-z0-9-]+[- ]character\s+code)\b|\b(?:color|colour|shape|position|how many|move|moving|appears?|order|sequence)\b.*\b(?:objects?|shapes?|circles?|triangles?|squares?|screen|frames?|video)\b|\b(?:code|text|label|objects?|shapes?)\b.*\b(?:displayed|shown|appear|screen|color|colour|position)\b/iu.test(q);
  const match = q.match(/(\d+(?:\.\d+)?)\s*(?:秒|seconds?|s)?\s*(?:[〜~～–—-]|から|以上|to|through)\s*(\d+(?:\.\d+)?)\s*(?:秒|seconds?|s)/iu);
  const start = match ? Number(match[1]) : NaN;
  const end = match ? Number(match[2]) : NaN;
  const shortInterval = Number.isFinite(start) && end > start && end - start < 16;
  // The user-facing range "10–14 seconds" includes the 14-second frame. An
  // explicit "20秒未満" does not. Image tools themselves remain half-open.
  const exclusive = match && /^\s*(?:未満|より前|exclusive|\))/iu.test(q.slice(match.index! + match[0].length));
  return { required, shortInterval, ...(shortInterval && !exclusive ? { inclusiveEnd: end } : {}) };
}
