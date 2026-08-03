import { describe, it, expect } from "vitest";
import {
  chatMessageBodySchema,
  openAiCompletionBodySchema,
} from "../src/features/chat/schemas";

describe("chatMessageBodySchema", () => {
  it("accepts qa payload", () => {
    const r = chatMessageBodySchema.parse({
      messages: [{ role: "user", content: "hi" }],
      group_id: 3,
    });
    expect(r.mode).toBe("qa");
    expect(r.group_id).toBe(3);
  });

  it("rejects empty messages", () => {
    expect(chatMessageBodySchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(
      chatMessageBodySchema.safeParse({
        messages: [{ role: "bot", content: "x" }],
      }).success,
    ).toBe(false);
  });
});

describe("openAiCompletionBodySchema", () => {
  it("defaults model to videoq", () => {
    const r = openAiCompletionBodySchema.parse({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.model).toBe("videoq");
  });
});
