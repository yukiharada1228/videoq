import { describe, it, expect } from "vitest";
import {
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_TOTAL_CHARS,
} from "@videoq/trpc/schema";
import { chatMessageBodySchema } from "../src/features/chat/schemas";

describe("chatMessageBodySchema", () => {
  it("accepts qa payload", () => {
    const r = chatMessageBodySchema.parse({
      messages: [{ role: "user", content: "hi" }],
      course_id: 3,
    });
    expect(r.mode).toBe("qa");
    expect(r.course_id).toBe(3);
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

  it("メッセージ件数の上限を超えた入力を拒否する", () => {
    expect(
      chatMessageBodySchema.safeParse({
        messages: Array.from({ length: CHAT_MAX_MESSAGES + 1 }, () => ({
          role: "user",
          content: "x",
        })),
      }).success,
    ).toBe(false);
  });

  it("単一メッセージの文字数上限を超えた入力を拒否する", () => {
    expect(
      chatMessageBodySchema.safeParse({
        messages: [
          { role: "user", content: "x".repeat(CHAT_MAX_MESSAGE_CHARS + 1) },
        ],
      }).success,
    ).toBe(false);
  });

  it("各メッセージが上限内でも合計文字数の上限を超えた入力を拒否する", () => {
    const messageCount = Math.floor(
      CHAT_MAX_TOTAL_CHARS / CHAT_MAX_MESSAGE_CHARS,
    ) + 1;
    expect(
      chatMessageBodySchema.safeParse({
        messages: Array.from({ length: messageCount }, () => ({
          role: "user",
          content: "x".repeat(CHAT_MAX_MESSAGE_CHARS),
        })),
      }).success,
    ).toBe(false);
  });
});
