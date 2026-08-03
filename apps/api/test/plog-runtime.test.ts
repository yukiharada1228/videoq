import { describe, it, expect } from "vitest";
import {
  canonicalConceptLabel,
  coveredConceptIds,
  graphsHaveOrderingPath,
  labelsNearDuplicate,
  nextUncoveredInOrder,
  orderingEdges,
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
  pregradeReply,
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

  it("study path uses ordering DAG only", () => {
    const concepts = [
      concept(1, "オア", 1),
      concept(2, "ノット", 2),
      concept(3, "Z2の出力", 9),
    ];
    const edges = [edge(1, 1, 2)];
    expect(studyPathConceptIds(concepts, edges)).toEqual([1, 2]);
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

describe("algorithm-1 grading guards", () => {
  it("pregrade only forces empty / ask-for-answer / meta", () => {
    expect(pregradeReply("")).toBe("miss");
    expect(pregradeReply("教えて")).toBe("miss");
    expect(pregradeReply("関係なくない？")).toBe("miss");
    expect(pregradeReply("何を言っている？")).toBe("miss");
    expect(pregradeReply("？")).toBe("miss");
    expect(pregradeReply("はい")).toBeNull();
    expect(pregradeReply("片方が1なら出力は1")).toBeNull();
  });

  it("ask-for-answer detection", () => {
    expect(isAskForAnswer("教えて")).toBe(true);
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
