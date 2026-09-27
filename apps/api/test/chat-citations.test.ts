import { describe, expect, it, vi } from "vitest";
import {
  CitationTextParser, appendChatPart, chatStreamEventSchema, parseCitationParts, serializeChatParts,
  type ChatContentPart, type InvalidCitationReason,
} from "@videoq/trpc/chat";
import { ChatCitationRegistry, validateChatCitations } from "../src/lib/chat-citations";

const source = { video_id: 7, title: "Private title", start_time: "00:21:37", end_time: "00:22:20" };
const text = (value: string): ChatContentPart => ({ type: "text", text: value });
const ref = (sourceId: number): ChatContentPart => ({ type: "citation", sourceId });

describe("citation grammar and streaming validation", () => {
  const fixtures: Array<[string, ChatContentPart[]]> = [
    ["説明[1][2]続き[01]", [text("説明"), ref(1), ref(2), text("続き"), ref(1)]],
    ["[0] [-1] [+1] [1.5] [1e0] [9007199254740992] [99]", [text("[0] [-1] [+1] [1.5] [1e0] [9007199254740992] [99]")]],
    ["[example] [1, 2] [1](https://example.com) [1]", [text("[example] [1, 2] [1](https://example.com) "), ref(1)]],
    [String.raw`\[a[1] + \frac{b\]c}{d}\] [2]`, [text(String.raw`\[a[1] + \frac{b\]c}{d}\] `), ref(2)]],
    [String.raw`\(a[1]\) $$b[2]$$ $x[1]$ [2]`, [text(String.raw`\(a[1]\) $$b[2]$$ $x[1]$ `), ref(2)]],
    ['$ x[01] $ [2]', [text('$ x[01] $ '), ref(2)]],
    ['Stray $ then $$x[1]$$ [2]', [text('Stray $ then $$x[1]$$ '), ref(2)]],
    ['$x' + '\\' + '\n[2]', [text('$x' + '\\' + '\n'), ref(2)]],
    ['`a[1]` ``a`[2]`` [1]', [text('`a[1]` ``a`[2]`` '), ref(1)]],
    ['Inline ```a[1]``` [2]', [text('Inline ```a[1]``` '), ref(2)]],
    ['```ts\na[1]\n```\n[2]', [text('```ts\na[1]\n```\n'), ref(2)]],
    ['~~~\n[1]\n~~~\n[2]', [text('~~~\n[1]\n~~~\n'), ref(2)]],
    ['```ts\nconst ticks = "```";\n[1]\n````\n$ x[1] $ [2]', [text('```ts\nconst ticks = "```";\n[1]\n````\n$ x[1] $ '), ref(2)]],
    ['```\n```not a closing fence [1]\n```\n[2]', [text('```\n```not a closing fence [1]\n```\n'), ref(2)]],
    [String.raw`\[1] [2]`, [text(String.raw`\[1] [2]`)]],
    ['Cost $100. [1]\nCode `[2]', [text('Cost $100. '), ref(1), text('\nCode `[2]')]],
    ['Answer [12', [text('Answer [12')]],
    ['[1][' + '0'.repeat(80) + '1]', [ref(1), text('[' + '0'.repeat(80) + '1]')]],
    ['[' + '0'.repeat(80) + '1](url) [2]', [text('[' + '0'.repeat(80) + '1](url) '), ref(2)]],
    ['`'.repeat(70) + '\n[1]\n' + '`'.repeat(70) + '\n[2]', [text('`'.repeat(70) + '\n[1]\n' + '`'.repeat(70) + '\n'), ref(2)]],
    ['', []],
  ];

  it.each(fixtures)("preserves text and validates citations independently of every chunk boundary: %s", (input, expected) => {
    const rejected: InvalidCitationReason[] = [];
    const baseline = parseCitationParts(input, (id) => id === 1 || id === 2, (reason) => rejected.push(reason));
    expect(baseline).toEqual(expected);
    const partitions = Array.from({ length: input.length + 1 }, (_, i) => [input.slice(0, i), input.slice(i)]);
    partitions.push([...input]);
    for (const chunks of partitions) {
      const invalid: InvalidCitationReason[] = [];
      const parser = new CitationTextParser((id) => id === 1 || id === 2, (reason) => invalid.push(reason));
      const actual: ChatContentPart[] = [];
      for (const chunk of chunks) for (const part of parser.push(chunk)) appendChatPart(actual, part);
      for (const part of parser.finish()) appendChatPart(actual, part);
      expect(actual, JSON.stringify(chunks)).toEqual(expected);
      expect(invalid, JSON.stringify(chunks)).toEqual(rejected);
    }
  });

  it("keeps unregistered markers literal without inferring sources from prior turns", () => {
    const first = new ChatCitationRegistry();
    first.register([source]);
    expect([...first.parser.push("[1]"), ...first.parser.finish()]).toEqual([ref(1)]);
    const next = new ChatCitationRegistry();
    expect([...next.parser.push("[1]"), ...next.parser.finish()]).toEqual([text("[1]")]);
  });

  it("is independent of random network partitions for mixed delimiter sequences", () => {
    const fragments = ["a", " ", "\n", "\r\n", "\\", "$", "$$", "`", "``", "```", "~~~", "[1]", "[01]", "[2]", "[0]", "[99]", "[", "1", "]", "{", "}", "(", "\\[", "\\]", "\\(", "\\)", "[1](url)"];
    let seed = 993;
    const next = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    for (let example = 0; example < 300; example++) {
      const input = Array.from({ length: 24 }, () => fragments[next(fragments.length)]).join("");
      const expectedInvalid: InvalidCitationReason[] = [];
      const expected = parseCitationParts(input, id => id === 1 || id === 2, reason => expectedInvalid.push(reason));
      const invalid: InvalidCitationReason[] = [];
      const parser = new CitationTextParser(id => id === 1 || id === 2, reason => invalid.push(reason));
      const actual: ChatContentPart[] = [];
      for (let cursor = 0; cursor < input.length;) {
        const length = next(7) + 1;
        for (const part of parser.push(input.slice(cursor, cursor + length))) appendChatPart(actual, part);
        cursor += length;
      }
      for (const part of parser.finish()) appendChatPart(actual, part);
      expect(actual, JSON.stringify(input)).toEqual(expected);
      expect(invalid, JSON.stringify(input)).toEqual(expectedInvalid);
      expect(parseCitationParts(serializeChatParts(expected), id => id === 1 || id === 2), JSON.stringify(input)).toEqual(expected);
    }
  });

  it("registers appended search results once and rejects renumbering", () => {
    const registry = new ChatCitationRegistry();
    const second = { ...source, video_id: 8 };
    expect(registry.register([source])).toEqual([{ ...source, id: 1 }]);
    expect(registry.register([source, second])).toEqual([{ ...second, id: 2 }]);
    expect(registry.register([source, second])).toEqual([]);
    expect(() => registry.register([second, source])).toThrow("source changed");
  });

  it("logs only rejection counts and reasons, once per answer", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const registry = new ChatCitationRegistry();
      registry.register([source]);
      const original = "Private answer [99] [-1] $a[99]$ `[0]` [1]";
      const parts = [...registry.parser.push(original), ...registry.parser.finish()];
      expect(serializeChatParts(parts)).toBe(original);
      registry.reportRejected();
      registry.reportRejected();
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "chat_citations_rejected", invalid_id: 1, unknown_id: 1 }));
      expect(validateChatCitations("Answer [01]", [source])).toBe("Answer [1]");
    } finally { log.mockRestore(); }
  });

  it("rejects invalid IDs in structured stream events", () => {
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      expect(chatStreamEventSchema.safeParse({ type: "citation", sourceId: id }).success).toBe(false);
      expect(chatStreamEventSchema.safeParse({ type: "source", source: { ...source, id } }).success).toBe(false);
    }
  });
});
