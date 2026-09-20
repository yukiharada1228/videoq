import { describe, it, expect } from "vitest";
import {
  canonicalConceptLabel,
  coveredConceptIds,
  graphsHaveOrderingPath,
  labelsNearDuplicate,
  nextUncoveredInOrder,
  orderingEdges,
  prerequisitesOf,
  ancestors,
  descendants,
  orderingPathReady,
  revealProxy,
  studyPathConceptIds,
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
  video_id: 1,
  label,
  node_type: "object",
  intro_sec: intro,
  embedding,
});

const edge = (id: number, source: number, target: number, type = "builds_on"): PlogEdge => ({
  id,
  video_id: 1,
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
  build_status: "ready",
});

describe("plog-runtime helpers", () => {
  it("canonical / near-duplicate labels collapse after NFKC", () => {
    expect(canonicalConceptLabel("  ＡＢＣ  ")).toBe("abc");
    expect(labelsNearDuplicate("ノット ゲート", "ノットゲート")).toBe(true);
    expect(labelsNearDuplicate("A", "B")).toBe(false);
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
    expect(orderingPathReady(graphOf([concept(1, "オア", 1)], [edge(1, 1, 1)]))).toBe(false);
  });

  it("study path uses ordering DAG only", () => {
    const concepts = [
      concept(1, "オア", 1),
      concept(2, "ノット", 2),
      concept(3, "Z2の出力", 9),
    ];
    const edges = [edge(1, 1, 2)];
    expect(studyPathConceptIds(concepts, edges)).toEqual([1, 2]);
  });

  it("presentation order suggests A then B without making A a prerequisite or withholding B", () => {
    const concepts = [concept(1, "A", 1), concept(2, "B", 2)];
    const edges = [edge(1, 1, 2, "presentation_order")];
    expect(studyPathConceptIds(concepts, edges)).toEqual([1, 2]);
    expect(orderingPathReady(graphOf(concepts, edges))).toBe(true);
    expect(prerequisitesOf(2, edges).size).toBe(0);
    expect(ancestors(2, edges).size).toBe(0);
    expect(descendants(1, edges).size).toBe(0);
  });

  it("a semantic vector prerequisite gates dot products, including downstream withholding", () => {
    const edges = [edge(1, 1, 2, "prerequisite_of"), edge(2, 2, 3, "presentation_order")];
    expect([...prerequisitesOf(2, edges)]).toEqual([1]);
    expect([...ancestors(3, edges)]).toEqual([]);
    expect([...descendants(1, edges)]).toEqual([2]);
  });

  it("rejects a cycle combining presentation order and semantic prerequisites", () => {
    const graph = graphOf([concept(1, "A", 1), concept(2, "B", 2)], [
      edge(1, 1, 2, "presentation_order"), edge(2, 2, 1, "prerequisite_of"),
    ]);
    expect(orderingPathReady(graph)).toBe(false);
  });

  it("ordering_path_ready requires DAG ordering path", () => {
    const concepts = [concept(1, "A", 1), concept(2, "B", 2), concept(3, "C", 3)];
    const empty = graphOf(concepts, []);
    const withPath = graphOf(concepts, [edge(1, 1, 2), edge(2, 2, 3)]);
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

  it("reveal_proxy detects premature answer cues", () => {
    expect(revealProxy("The answer is 42")).toBe(true);
    expect(revealProxy("正解はオアゲートです")).toBe(true);
    expect(revealProxy("もう少し考えてみましょう")).toBe(false);
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
