import { codeOpening, codeRunCanClose, codeRunLength, inlineMathCanClose, isCodeLineStart, isFenceSpace, mathOpening, type CodeDelimiter } from "./chat-syntax";

/** Text keeps its original TeX/code syntax. Citations are indivisible UI parts. */
export type ChatContentPart = { type: "text"; text: string } | { type: "citation"; sourceId: number };
export type InvalidCitationReason = "invalid_id" | "unknown_id";

function appendChatPart(parts: ChatContentPart[], part: ChatContentPart): void {
  const last = parts.at(-1);
  if (part.type === "text") {
    if (!part.text) return;
    if (last?.type === "text") { last.text += part.text; return; }
  }
  parts.push({ ...part });
}

type ProtectedRegion =
  | { kind: "math"; close: string; braces: number }
  | ({ kind: "code"; closingFence?: boolean } & CodeDelimiter);

const MAX_MARKER_LENGTH = 64;

/**
 * Incremental, request-scoped lexer shared by server validation and legacy rendering.
 * Only numeric [N] outside TeX, code, escaped text and Markdown link labels is a
 * citation. Invalid markers stay literal; never guess a replacement source.
 * Unclosed math/code remains protected to EOF. Citation lookahead is bounded to 64 chars.
 */
class CitationTextParser {
  private pending = "";
  private region: ProtectedRegion | null = null;
  private previous = "";
  private linePrefix = "";
  private finished = false;
  private readonly hasSource: (id: number) => boolean;
  private readonly onInvalid: (reason: InvalidCitationReason) => void;

  constructor(
    hasSource: (id: number) => boolean,
    onInvalid: (reason: InvalidCitationReason) => void = () => {},
  ) {
    this.hasSource = hasSource;
    this.onInvalid = onInvalid;
  }

  push(text: string): ChatContentPart[] {
    if (this.finished) throw new Error("Citation parser already finished");
    this.pending += text;
    return this.drain(false);
  }

  finish(): ChatContentPart[] {
    if (this.finished) return [];
    this.finished = true;
    return this.drain(true);
  }

  private drain(final: boolean): ChatContentPart[] {
    const parts: ChatContentPart[] = [];
    let cursor = 0;
    const consume = (size: number, sourceId?: number) => {
      const raw = this.pending.slice(cursor, cursor + size);
      appendChatPart(parts, sourceId === undefined ? { type: "text", text: raw } : { type: "citation", sourceId });
      this.previous = raw.at(-1) ?? this.previous;
      for (const char of raw) {
        this.linePrefix = char === "\n" ? "" : (this.linePrefix + char).slice(0, 4);
      }
      cursor += size;
    };

    while (cursor < this.pending.length) {
      const rest = this.pending.slice(cursor);
      const char = rest[0];
      if (this.region?.kind === "code") {
        const region = this.region;
        if (region.closingFence) {
          if (char === "\n") { this.region = null; consume(1); continue; }
          if (isFenceSpace(char)) { consume(1); continue; }
          region.closingFence = false;
        }
        if (char === region.character) {
          const length = codeRunLength(rest, 0);
          if (length === rest.length && !final) break;
          if (codeRunCanClose(region, char, length, isCodeLineStart(this.linePrefix, this.linePrefix.length))) {
            if (region.fenced) region.closingFence = true;
            else this.region = null;
          }
          consume(length);
        } else consume(1);
        continue;
      }
      if (this.region?.kind === "math") {
        const region = this.region;
        if (region.braces <= 0 && region.close.startsWith(rest) && rest.length < region.close.length && !final) break;
        if (region.braces <= 0 && rest.startsWith(region.close)) {
          if (region.close === "$") {
            if (rest.length === 1 && !final) break;
            if (!inlineMathCanClose(rest[1] ?? "")) {
              // A stray $ must not consume a later $$ block or a word-adjacent $.
              this.region = null;
              continue;
            }
          }
          this.region = null;
          consume(region.close.length);
        } else if (char === "\\") {
          if (rest.length === 1 && !final) break;
          if (region.close === "$" && rest[1] === "\n") this.region = null;
          consume(Math.min(2, rest.length));
        } else {
          if (char === "{") region.braces++;
          if (char === "}") region.braces--;
          if (char === "\n" && region.close === "$") this.region = null;
          consume(1);
        }
        continue;
      }
      if (char === "\\" || char === "$") {
        if (rest.length === 1 && !final) break;
        const math = mathOpening(char, rest[1] ?? "", this.previous);
        if (math) {
          this.region = { kind: "math", close: math.close, braces: 0 };
          consume(math.open.length);
        } else {
          consume(char === "\\" ? Math.min(2, rest.length) : 1);
        }
        continue;
      }
      if (char === "`" || char === "~") {
        const length = codeRunLength(rest, 0);
        if (length === rest.length && !final) break;
        const code = codeOpening(char, length, isCodeLineStart(this.linePrefix, this.linePrefix.length));
        if (code) this.region = { kind: "code", ...code };
        consume(length);
        continue;
      }
      if (char === "[") {
        const candidate = /^\[([+\-\d.eE]+)\]/.exec(rest);
        if (candidate) {
          // A numeric Markdown link label is ordinary text, not a scene citation.
          if (candidate[0].length === rest.length && candidate[0].length < MAX_MARKER_LENGTH && !final) break;
          const id = Number(candidate[1]);
          let sourceId: number | undefined;
          if (candidate[0].length >= MAX_MARKER_LENGTH) this.onInvalid("invalid_id");
          else if (rest[candidate[0].length] !== "(") {
            if (!/^\d+$/.test(candidate[1]) || !Number.isSafeInteger(id) || id <= 0) this.onInvalid("invalid_id");
            else if (!this.hasSource(id)) this.onInvalid("unknown_id");
            else sourceId = id;
          }
          consume(candidate[0].length, sourceId);
          continue;
        }
        if (/^\[[+\-\d.eE]*$/.test(rest) && rest.length < MAX_MARKER_LENGTH && !final) break;
        // Overlong numeric markers are literal regardless of network chunking.
        if (/^\[[+\-\d.eE]{63}/.test(rest)) {
          this.onInvalid("invalid_id");
          consume(1);
          continue;
        }
      }
      consume(1);
    }
    this.pending = this.pending.slice(cursor);
    return parts;
  }
}

export function parseCitationParts(
  content: string,
  hasSource: (id: number) => boolean,
  onInvalid?: (reason: InvalidCitationReason) => void,
): ChatContentPart[] {
  const parser = new CitationTextParser(hasSource, onInvalid);
  const parts: ChatContentPart[] = [];
  for (const part of [...parser.push(content), ...parser.finish()]) appendChatPart(parts, part);
  return parts;
}
