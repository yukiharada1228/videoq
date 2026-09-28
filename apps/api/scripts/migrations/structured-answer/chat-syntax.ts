/** Frozen delimiter rules needed by the one-time historical citation conversion. */
type MathDelimiter = { open: string; close: string; display: boolean };
export type CodeDelimiter = { character: string; length: number; fenced: boolean };
const MATH_DELIMITERS: Record<string, MathDelimiter | undefined> = {
  "$$": { open: "$$", close: "$$", display: true },
  "\\[": { open: "\\[", close: "\\]", display: true },
  "\\(": { open: "\\(", close: "\\)", display: false },
};

export function mathOpening(character: string, next: string, previous: string): MathDelimiter | null {
  const paired = MATH_DELIMITERS[character + next];
  if (paired) return paired;
  // Match existing inline TeX: whitespace after $ is allowed; $100 is currency.
  if (character === "$" && next && !/\d/.test(next) && !/[A-Za-z0-9\\]/.test(previous)) {
    return { open: "$", close: "$", display: false };
  }
  return null;
}

export const inlineMathCanClose = (next: string): boolean => next !== "$" && !/[A-Za-z0-9]/.test(next);

export function codeRunLength(text: string, start: number): number {
  const character = text[start];
  if (character !== "`" && character !== "~") return 0;
  let end = start + 1;
  while (text[end] === character) end++;
  return end - start;
}

export function isCodeLineStart(text: string, index: number): boolean {
  let spaces = 0;
  for (let i = index - 1; i >= 0 && text[i] !== "\n"; i--) {
    if (text[i] !== " " || ++spaces > 3) return false;
  }
  return true;
}

export function codeOpening(character: string, length: number, atLineStart: boolean): CodeDelimiter | null {
  const fenced = length >= 3 && atLineStart;
  return character === "`" || (character === "~" && fenced) ? { character, length, fenced } : null;
}

export function codeRunCanClose(region: CodeDelimiter, character: string, length: number, atLineStart: boolean): boolean {
  return character === region.character && (region.fenced ? atLineStart && length >= region.length : length === region.length);
}

export const isFenceSpace = (character: string): boolean => character === " " || character === "\t" || character === "\r";
