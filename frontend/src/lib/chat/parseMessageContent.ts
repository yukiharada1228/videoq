export type MessageContentNode =
  | { type: 'text'; value: string }
  | { type: 'ref'; id: number }
  | { type: 'math'; value: string; display: boolean };

type MathDelimiter = {
  left: string;
  right: string;
  display: boolean;
};

const MATH_DELIMITERS: MathDelimiter[] = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
];

const REF_PATTERN = /\[(\d+)\]/g;

function findMathEnd(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex;
  let braceLevel = 0;

  while (index < text.length) {
    const character = text[index];
    if (braceLevel <= 0 && text.startsWith(delimiter, index)) {
      return index;
    }
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '{') braceLevel += 1;
    if (character === '}') braceLevel -= 1;
    index += 1;
  }

  return -1;
}

function findInlineDollarEnd(text: string, startIndex: number): number {
  const end = text.indexOf('$', startIndex);
  if (end === -1) return -1;

  const body = text.slice(startIndex, end);
  if (!body || body.includes('\n')) return -1;
  if (text[end + 1] === '$') return -1;
  if (/[A-Za-z0-9]/.test(text[end + 1] ?? '')) return -1;

  return end;
}

function splitMath(content: string): Array<Extract<MessageContentNode, { type: 'text' | 'math' }>> {
  const nodes: Array<Extract<MessageContentNode, { type: 'text' | 'math' }>> = [];
  let remaining = content;

  while (remaining.length > 0) {
    let nextIndex = -1;
    let nextDelim: MathDelimiter | 'dollar' | null = null;

    for (const delim of MATH_DELIMITERS) {
      const index = remaining.indexOf(delim.left);
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index;
        nextDelim = delim;
      }
    }

    const dollarIndex = remaining.search(/(?<![A-Za-z0-9\\])\$(?!\d)/);
    if (dollarIndex !== -1 && (nextIndex === -1 || dollarIndex < nextIndex)) {
      nextIndex = dollarIndex;
      nextDelim = 'dollar';
    }

    if (nextIndex === -1 || nextDelim === null) {
      nodes.push({ type: 'text', value: remaining });
      break;
    }

    if (nextIndex > 0) {
      nodes.push({ type: 'text', value: remaining.slice(0, nextIndex) });
      remaining = remaining.slice(nextIndex);
    }

    if (nextDelim === 'dollar') {
      const end = findInlineDollarEnd(remaining, 1);
      if (end === -1) {
        nodes.push({ type: 'text', value: remaining.slice(0, 1) });
        remaining = remaining.slice(1);
        continue;
      }
      nodes.push({ type: 'math', value: remaining.slice(1, end), display: false });
      remaining = remaining.slice(end + 1);
      continue;
    }

    const end = findMathEnd(nextDelim.right, remaining, nextDelim.left.length);
    if (end === -1) {
      nodes.push({ type: 'text', value: remaining.slice(0, nextDelim.left.length) });
      remaining = remaining.slice(nextDelim.left.length);
      continue;
    }

    nodes.push({
      type: 'math',
      value: remaining.slice(nextDelim.left.length, end),
      display: nextDelim.display,
    });
    remaining = remaining.slice(end + nextDelim.right.length);
  }

  return nodes;
}

function splitRefs(value: string): Array<Extract<MessageContentNode, { type: 'text' | 'ref' }>> {
  const nodes: Array<Extract<MessageContentNode, { type: 'text' | 'ref' }>> = [];
  let lastIndex = 0;

  for (const match of value.matchAll(REF_PATTERN)) {
    const id = Number(match[1]);
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, start) });
    }
    nodes.push({ type: 'ref', id });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return nodes;
}

function mergeAdjacentText(nodes: MessageContentNode[]): MessageContentNode[] {
  const merged: MessageContentNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === 'text' && last?.type === 'text') {
      last.value += node.value;
      continue;
    }
    merged.push(node);
  }
  return merged;
}

export function parseMessageContent(content: string): MessageContentNode[] {
  return mergeAdjacentText(
    splitMath(content).flatMap((node): MessageContentNode[] =>
      node.type === 'text' ? splitRefs(node.value) : [node],
    ),
  );
}
