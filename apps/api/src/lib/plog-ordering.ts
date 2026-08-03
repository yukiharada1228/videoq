/**
 * PLOG グラフの順序制約ヘルパー。
 */

export const ORDERING = new Set(["prerequisite_of", "builds_on"]);

export const NODE_TYPES = new Set(["object", "property", "limitation"]);

export const EDGE_TYPES = new Set([
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
  const nodes = new Set<string>();

  for (const [src, tgt] of pairs) {
    nodes.add(src);
    nodes.add(tgt);
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
  for (const n of nodes) {
    if (!indeg.has(n)) indeg.set(n, 0);
  }

  const q: string[] = [...nodes].filter((n) => (indeg.get(n) ?? 0) === 0);
  let seen = 0;
  while (q.length > 0) {
    const n = q.shift()!;
    seen += 1;
    for (const m of adj.get(n) ?? []) {
      const next = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, next);
      if (next === 0) q.push(m);
    }
  }
  return seen === nodes.size;
}
