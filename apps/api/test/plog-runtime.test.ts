import { describe, it, expect } from "vitest";
import {
  canonicalConceptLabel,
  coveredConceptIds,
  graphsHaveOrderingPath,
  nearDuplicateIds,
  nextUncoveredInOrder,
  orderingEdges,
  prerequisitesOf,
  descendants,
  orderingPathReady,
  revealProxy,
  routeToConceptScored,
  studyPathConceptIds,
  topologicalConceptIds,
  type PlogConcept,
  type PlogEdge,
  type PlogGraphSnapshot,
} from "../src/lib/plog-runtime";
import {
  isAskForAnswer,
  isMetaOrConfused,
  classifyStudyMessage,
  shouldStayOnActive,
} from "../src/lib/plog-study";

const concept = (
  id: number,
  label: string,
  intro: number,
  embedding: number[] = [],
): PlogConcept => ({
  id,
  label,
  intro_sec: intro,
  embedding,
});

const edge = (source: number, target: number, type = "builds_on"): PlogEdge => ({
  source_id: source,
  target_id: target,
  edge_type: type,
});

const graphOf = (
  concepts: PlogConcept[],
  edges: PlogEdge[],
): PlogGraphSnapshot => ({
  video_id: 1,
  concepts,
  edges,
  learning_objects: {},
  summary_nodes: [],
});

describe("plog-runtime helpers", () => {
  it("canonical / near-duplicate labels collapse after NFKC", () => {
    expect(canonicalConceptLabel("  ＡＢＣ  ")).toBe("abc");
    expect(canonicalConceptLabel("ノット ゲート")).toBe(canonicalConceptLabel("ノットゲート"));
    expect(canonicalConceptLabel("A")).not.toBe(canonicalConceptLabel("B"));
  });

  it("study path is empty without ordering edges", () => {
    const concepts = [concept(1, "オア", 1), concept(2, "ノット", 2)];
    expect(studyPathConceptIds(concepts, [])).toEqual([]);
  });

  it("a single concept is a complete learning path without ordering edges", () => {
    const single = graphOf([concept(1, "オア", 1)], []);
    expect(studyPathConceptIds(single.concepts, single.edges)).toEqual([1]);
    expect(orderingPathReady(single)).toBe(true);
    expect(graphsHaveOrderingPath([graphOf([], []), single])).toBe(true);
  });

  it("an empty graph is not a learning path", () => {
    const empty = graphOf([], []);
    expect(studyPathConceptIds(empty.concepts, empty.edges)).toEqual([]);
    expect(orderingPathReady(empty)).toBe(false);
    expect(graphsHaveOrderingPath([empty])).toBe(false);
  });

  it("a single concept with an ordering self-loop is still rejected", () => {
    expect(orderingPathReady(graphOf([concept(1, "オア", 1)], [edge(1, 1)]))).toBe(false);
  });

  it("study path uses ordering DAG only", () => {
    const concepts = [
      concept(1, "オア", 1),
      concept(2, "ノット", 2),
      concept(3, "Z2の出力", 9),
    ];
    const edges = [edge(1, 2)];
    expect(studyPathConceptIds(concepts, edges)).toEqual([1, 2]);
  });

  it("presentation order suggests A then B without making A a prerequisite or withholding B", () => {
    const concepts = [concept(1, "A", 1), concept(2, "B", 2)];
    const edges = [edge(1, 2, "presentation_order")];
    expect(studyPathConceptIds(concepts, edges)).toEqual([1, 2]);
    expect(orderingPathReady(graphOf(concepts, edges))).toBe(true);
    expect(prerequisitesOf(2, edges).size).toBe(0);
    expect(descendants(1, edges).size).toBe(0);
  });

  it("a semantic vector prerequisite gates dot products, including downstream withholding", () => {
    const edges = [edge(1, 2, "prerequisite_of"), edge(2, 3, "presentation_order")];
    expect([...prerequisitesOf(2, edges)]).toEqual([1]);
    expect([...descendants(1, edges)]).toEqual([2]);
  });

  it("rejects a cycle combining presentation order and semantic prerequisites", () => {
    const graph = graphOf([concept(1, "A", 1), concept(2, "B", 2)], [
      edge(1, 2, "presentation_order"), edge(2, 1, "prerequisite_of"),
    ]);
    expect(orderingPathReady(graph)).toBe(false);
  });

  it("ordering_path_ready requires DAG ordering path", () => {
    const concepts = [concept(1, "A", 1), concept(2, "B", 2), concept(3, "C", 3)];
    const empty = graphOf(concepts, []);
    const withPath = graphOf(concepts, [edge(1, 2), edge(2, 3)]);
    expect(orderingPathReady(empty)).toBe(false);
    expect(orderingPathReady(withPath)).toBe(true);
    expect(graphsHaveOrderingPath([empty])).toBe(false);
    expect(graphsHaveOrderingPath([withPath])).toBe(true);
    expect(orderingEdges(withPath.edges)).toHaveLength(2);
  });

  it("covered_concept_ids includes near-duplicate labels", () => {
    const byId = new Map([
      [1, concept(1, "ノットゲート", 1)],
      [2, concept(2, "ノット ゲート", 2)],
      [3, concept(3, "オア", 3)],
    ]);
    expect([...coveredConceptIds([1], byId)].sort()).toEqual([1, 2]);
  });

  it("next_uncovered_in_order skips covered synonyms", () => {
    const byId = new Map([
      [1, concept(1, "A", 1)],
      [2, concept(2, "A", 2)],
      [3, concept(3, "B", 3)],
    ]);
    expect(nextUncoveredInOrder([1, 2, 3], [1], byId)).toBe(3);
    expect(nextUncoveredInOrder([1, 2, 3], [1], byId, 1)).toBe(3);
  });

  it("preserves reached order and ignores blank aliases", () => {
    const entries: [number, PlogConcept][] = [
      [1, concept(1, " ＡＢ Ｃ ", 1)], [2, concept(2, "abc", 2)],
      [3, concept(3, "ノット ゲート", 3)], [4, concept(4, "ノットゲート", 4)],
      [5, concept(5, "", 5)], [6, concept(6, " \u3000 ", 6)], [7, concept(7, "Other", 7)],
    ];
    const byId: ReadonlyMap<number, PlogConcept> = new Map(entries);
    function* reached() { yield* [3, 5, 999, 1, 3]; }
    expect([...coveredConceptIds(reached(), byId)]).toEqual([3, 5, 1, 2, 4]);
    expect(nextUncoveredInOrder([999, 1, 2, 3, 4, 5, 6, 7], reached(), byId)).toBe(6);
    expect([...coveredConceptIds([], byId)]).toEqual([]);
  });

  it("keeps alias lookup scoped to existing, nonblank labels", () => {
    const entries: [number, PlogConcept][] = [
      [1, concept(1, " ＡＢ Ｃ ", 1)], [2, concept(2, "abc", 2)],
      [3, concept(3, "", 3)], [4, concept(4, " ", 4)],
    ];
    const byId: ReadonlyMap<number, PlogConcept> = new Map(entries);
    expect([...nearDuplicateIds(1, byId)]).toEqual([1, 2]);
    expect([...nearDuplicateIds(3, byId)]).toEqual([]);
    expect([...nearDuplicateIds(999, byId)]).toEqual([]);
    entries[1][1].label = "Changed";
    expect([...nearDuplicateIds(1, byId)]).toEqual([1]);
    expect([...coveredConceptIds([1], byId)]).toEqual([1]);
  });

  it("preserves FIFO learning order, equal-time ties and cycle fallback without changing the graph", () => {
    const concepts = Object.freeze([
      concept(5, "E", 5), concept(1, "A", 1), concept(2, "B", 1),
      concept(3, "C", 0), concept(4, "D", 5), concept(6, "F", 6),
      concept(7, "G", 7), concept(8, "H", 8), concept(9, "I", 1),
    ]);
    const edges = Object.freeze([
      edge(1, 5), edge(1, 4), edge(2, 4), edge(3, 2),
      edge(3, 2, "presentation_order"), edge(6, 7), edge(7, 6),
      edge(7, 8), edge(99, 1), edge(9, 1, "analogy_for"),
    ]);
    expect(topologicalConceptIds(concepts, edges)).toEqual([3, 1, 9, 2, 5, 4, 6, 7, 8]);
    expect(topologicalConceptIds([], edges)).toEqual([]);
    expect(concepts.map(item => item.id)).toEqual([5, 1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it("traverses prerequisite diamonds and cycles once in breadth-first order", () => {
    const edges = [
      edge(1, 3), edge(1, 2), edge(3, 4), edge(2, 4),
      edge(4, 1), edge(1, 3), edge(4, 5, "presentation_order"),
    ];
    expect([...descendants(1, edges)]).toEqual([3, 2, 4, 1]);
    expect([...descendants(99, edges)]).toEqual([]);
  });

  it("reveal_proxy detects premature answer cues", () => {
    expect(revealProxy("The answer is 42")).toBe(true);
    expect(revealProxy("正解はオアゲートです")).toBe(true);
    expect(revealProxy("もう少し考えてみましょう")).toBe(false);
  });
});

describe("PLOG concept routing", () => {
  it("returns the strongest concept across all graphs with its score", () => {
    const first = graphOf([concept(1, "A", 0, [3, 4])], []);
    const second = graphOf([concept(2, "B", 0, [0, 1]), concept(3, "C", 1, [2, 0])], []);
    const result = routeToConceptScored([1, 0], [first, second]);
    expect(result?.score).toBe(1);
    expect(result?.graph).toBe(second);
    expect(result?.concept).toBe(second.concepts[1]);
  });

  it("keeps input order for tied concepts and tied graphs", () => {
    const first = graphOf([concept(9, "First", 9, [1, 0]), concept(1, "Second", 1, [2, 0])], []);
    const second = graphOf([concept(2, "Other graph", 0, [1, 0])], []);
    Object.freeze(first.concepts);
    Object.freeze(second.concepts);
    const graphs = Object.freeze([first, second]);
    const result = routeToConceptScored(Object.freeze([1, 0]), graphs);
    expect(result?.graph).toBe(first);
    expect(result?.concept).toBe(first.concepts[0]);
    expect(first.concepts.map(c => c.id)).toEqual([9, 1]);
  });

  it("includes the score threshold exactly and rejects weaker matches", () => {
    const graph = graphOf([concept(1, "A", 0, [3, 4])], []);
    expect(routeToConceptScored([1, 0], [graph], 0.6)?.score).toBe(0.6);
    expect(routeToConceptScored([1, 0], [graph], 0.6001)).toBeNull();
    expect(routeToConceptScored([0, 1], [graphOf([concept(2, "B", 0, [1, 0])], [])])).toBeNull();
  });

  it("ignores graphs without any embeddings even with a zero threshold", () => {
    const empty = graphOf([], []);
    const ungenerated = graphOf([concept(1, "A", 0), concept(2, "B", 1)], []);
    expect(routeToConceptScored([1, 0], [], 0)).toBeNull();
    expect(routeToConceptScored([1, 0], [empty, ungenerated], 0)).toBeNull();
  });

  it("retains negative-score handling and excludes exact opposites", () => {
    const opposite = graphOf([concept(1, "Opposite", 0, [-1, 0])], []);
    const negative = graphOf([concept(2, "Negative", 0, [-3, 4])], []);
    expect(routeToConceptScored([1, 0], [opposite], -1)).toBeNull();
    expect(routeToConceptScored([1, 0], [opposite, negative], -0.6)).toEqual({
      graph: negative, concept: negative.concepts[0], score: -0.6,
    });
  });

  it("preserves zero-score fallback within a graph that has embeddings", () => {
    const graph = graphOf([concept(1, "Ungenerated", 0), concept(2, "Negative", 1, [-3, 4])], []);
    expect(routeToConceptScored([1, 0], [graph], 0)).toEqual({
      graph, concept: graph.concepts[0], score: 0,
    });
    expect(routeToConceptScored([1, 0], [graph])).toBeNull();
  });

  it.each([{ query: [] }, { query: [0, 0] }, { query: [1] }])("preserves zero similarity for an empty, zero or mismatched query: %j", ({ query }) => {
    const graph = graphOf([concept(1, "A", 0, [1, 0])], []);
    expect(routeToConceptScored(query, [graph], 0)).toEqual({
      graph, concept: graph.concepts[0], score: 0,
    });
    expect(routeToConceptScored(query, [graph])).toBeNull();
  });
});

describe("study message intents", () => {
  it.each([
    ["ヒントを教えて", "hint"], ["Can I have a hint?", "hint"],
    ["なんで出力が変わるの？", "explanation"], ["Why does it change?", "explanation"],
    ["用語の意味を教えて", "explanation"], ["Explain this term", "explanation"],
    ["教えて", "explanation"], ["関係なくない？", "explanation"],
    ["何を言っている？", "explanation"], ["？", "explanation"], ["", "explanation"],
    ["答えをそのまま教えて", "reveal"], ["Tell me the answer", "reveal"],
    ["0", "answer"], ["はい", "answer"], ["答えは0です", "answer"],
    ["片方が1なら出力は1", "answer"], ["My answer is 0", "answer"],
    ["ヒントから考えると0です", "answer"], ["Using the hint, my answer is 0", "answer"],
    ["Why does this hint mention input?", "explanation"],
  ])("classifies %s as %s without grading", (reply, intent) => {
    expect(classifyStudyMessage(reply)).toBe(intent);
  });

  it("ask-for-answer detection", () => {
    expect(isAskForAnswer("教えて")).toBe(false);
    expect(isAskForAnswer("ヒントを教えて")).toBe(false);
    expect(isAskForAnswer("解答の考え方を教えて")).toBe(false);
    expect(isAskForAnswer("答えを教えてください")).toBe(true);
    expect(isAskForAnswer("ノットゲートは否定")).toBe(false);
  });

  it("stay on active for short or confused replies", () => {
    const active = concept(1, "ノットゲート", 1, [1, 0]);
    const other = concept(2, "Aに関係ない", 2, [0, 1]);
    expect(isMetaOrConfused("関係なくない？")).toBe(true);
    expect(
      shouldStayOnActive("関係なくない？", [1, 0], active, { score: 0.9, concept: other }),
    ).toBe(true);
    expect(shouldStayOnActive("0は1", [1, 0], active, { score: 0.9, concept: other })).toBe(
      true,
    );
    expect(
      shouldStayOnActive(
        "偶数と奇数の関係について詳しく知りたいです",
        [0, 1],
        active,
        { score: 0.9, concept: other },
      ),
    ).toBe(false);
  });
});
