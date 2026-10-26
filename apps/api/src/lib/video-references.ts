export type LocalVideoReference = {
  kind: "lecture_number" | "position" | "title" | "current";
  quote: string;
  number: number | null;
};

const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const words: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
};
const japanese = "[0-9零〇一二三四五六七八九十百千]+";
const single = Object.keys(words).join("|");
const english = `(?:[0-9]+(?:st|nd|rd|th)?|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](?:one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|${single})`;

function number(value: string): number {
  if (/^\d/.test(value)) return Number(value.replace(/(?:st|nd|rd|th)$/i, ""));
  if (/^[a-z]/i.test(value))
    return value
      .toLowerCase()
      .split(/[ -]/)
      .reduce((sum, word) => sum + words[word], 0);
  if (!/[十百千]/.test(value)) return Number([...value].map((char) => digits[char]).join(""));
  let total = 0,
    current = 0;
  for (const char of value) {
    if (char in digits) current = digits[char];
    else {
      total += (current || 1) * units[char];
      current = 0;
    }
  }
  return total + current;
}

/** Parse clear video-reference syntax; ambiguous references retain model resolution. */
export function explicitVideoReferences(query: string): LocalVideoReference[] {
  const text = query.normalize("NFKC");
  const result: LocalVideoReference[] = [];
  const collect = (pattern: RegExp, kind: LocalVideoReference["kind"]) => {
    for (const match of text.matchAll(pattern)) {
      const value = number(match[1]);
      if (Number.isFinite(value)) result.push({ kind, quote: match[0], number: value });
    }
  };
  collect(new RegExp(`第(${japanese})(?:回|講|話|章)`, "g"), "lecture_number");
  collect(new RegExp(`(${japanese})(?:本目|番目)(?:の)?(?:動画|ビデオ|講義|講座|授業|内容|要約)`, "g"), "position");
  // Do not parse a prefix of a larger number phrase such as "one hundred".
  collect(
    new RegExp(`\\b(?:lecture|lesson|session|chapter)\\s+(${english})\\b(?![ -]+(?:hundred|thousand|million))`, "gi"),
    "lecture_number",
  );
  collect(new RegExp(`\\b(${english})\\s+(?:video|entry|item)\\b`, "gi"), "position");
  const namedTitles = [
    /[「『]([^」』]+)[」』]\s*(?:というタイトルの|という題名の|という|の)?(?:動画|ビデオ|講義|講座|授業)/g,
    /\b(?:video|lecture|lesson)\s+(?:called|named|titled)\s+["“]([^"”]+)["”]/gi,
    /["“]([^"”]+)["”]\s+(?:video|lecture|lesson)\b/gi,
  ];
  for (const pattern of namedTitles)
    for (const match of text.matchAll(pattern)) result.push({ kind: "title", quote: match[1], number: null });
  for (const match of text.matchAll(/この動画|本動画|\bthis video\b/gi))
    result.push({ kind: "current", quote: match[0], number: null });
  return result;
}
