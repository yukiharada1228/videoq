/**
 * PLOG グラフの順序制約ヘルパー。
 */

/** Only semantic dependencies gate access or withhold downstream concepts. */
export const PREREQUISITES = new Set(["prerequisite_of", "builds_on"]);
/** Presentation order also guides the next concept, but does not imply dependency. */
export const ORDERING = new Set([...PREREQUISITES, "presentation_order"]);

export const NODE_TYPES = new Set(["object", "property", "limitation"]);

export const EDGE_TYPES = new Set([
  "presentation_order",
  "prerequisite_of",
  "builds_on",
  "analogy_for",
  "example_of",
  "contrasts_with",
]);

/** 有向辺の組が DAG なら true（Kahn）。 */
export function isDag(pairs: readonly (readonly [string, string])[]): boolean {
  const adj = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();

  for (const [src, tgt] of pairs) {
    if (!indeg.has(src)) indeg.set(src, 0);
    let outs = adj.get(src);
    if (!outs) {
      outs = new Set();
      adj.set(src, outs);
    }
    if (!outs.has(tgt)) {
      outs.add(tgt);
      indeg.set(tgt, (indeg.get(tgt) ?? 0) + 1);
    }
  }

  const q: string[] = [];
  for (const [node, degree] of indeg) {
    if (degree === 0) q.push(node);
  }
  let seen = 0;
  while (q.length > 0) {
    const n = q.pop()!;
    seen += 1;
    for (const m of adj.get(n) ?? []) {
      const next = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, next);
      if (next === 0) q.push(m);
    }
  }
  return seen === indeg.size;
}
