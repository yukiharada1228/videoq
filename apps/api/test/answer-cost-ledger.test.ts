import { describe, expect, it } from "vitest";
import { AnswerCostLedger } from "../src/lib/answer-cost-ledger";

describe("answer cost ledger", () => {
  it("records every provider call on one anonymous attempt without content", () => {
    const ledger = new AnswerCostLedger();
    const answer = ledger.begin("answer_model", "gpt-6-luna");
    answer.complete({ prompt_tokens: 120, completion_tokens: 35, prompt_tokens_details: { cached_tokens: 40 }, prompt: "private question", negative: -1 });
    ledger.begin("query_embedding", "text-embedding-3-small").fail();

    expect(ledger.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(ledger.calls).toHaveLength(2);
    expect(ledger.calls[0]).toMatchObject({
      kind: "answer_model", status: "completed",
      usage: { prompt_tokens: 120, completion_tokens: 35, prompt_tokens_details: { cached_tokens: 40 } },
    });
    expect(ledger.calls[1]).toMatchObject({ kind: "query_embedding", status: "failed", usage: null });
    expect(JSON.stringify(ledger.calls)).not.toContain("private question");
  });
});
