export type MessageContentNode =
  | { type: 'text'; value: string }
  | { type: 'ref'; id: number }
  | { type: 'math'; value: string; display: boolean };

const MATH_DELIMITERS: Record<string, { right: string; display: boolean } | undefined> = {
  '$$': { right: '$$', display: true },
  '\\[': { right: '\\]', display: true },
  '\\(': { right: '\\)', display: false },
};

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
  // One forward search replaces a full suffix search for every delimiter kind.
  // Keep $$ first so display math wins over a single dollar at the same index.
  const openings = /\$\$|\\\[|\\\(|(?<![A-Za-z0-9\\])\$(?!\d)/g;
  let cursor = 0;

  while (cursor < content.length) {
    openings.lastIndex = cursor;
    const match = openings.exec(content);
    if (!match) {
      nodes.push({ type: 'text', value: content.slice(cursor) });
      break;
    }

    if (match.index > cursor) {
      nodes.push({ type: 'text', value: content.slice(cursor, match.index) });
    }
    const left = match[0];
    const delimiter = MATH_DELIMITERS[left];
    const bodyStart = match.index + left.length;
    const end = delimiter
      ? findMathEnd(delimiter.right, content, bodyStart)
      : findInlineDollarEnd(content, bodyStart);
    if (end === -1) {
      nodes.push({ type: 'text', value: left });
      cursor = bodyStart;
      continue;
    }

    nodes.push({
      type: 'math',
      value: content.slice(bodyStart, end),
      display: delimiter?.display ?? false,
    });
    cursor = end + (delimiter?.right.length ?? 1);
  }

  return nodes;
}

function appendText(nodes: MessageContentNode[], value: string): void {
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') {
    last.value += value;
  } else {
    nodes.push({ type: 'text', value });
  }
}

function appendRefs(nodes: MessageContentNode[], value: string): void {
  let lastIndex = 0;

  for (const match of value.matchAll(REF_PATTERN)) {
    const id = Number(match[1]);
    const start = match.index ?? 0;
    if (start > lastIndex) {
      appendText(nodes, value.slice(lastIndex, start));
    }
    nodes.push({ type: 'ref', id });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < value.length) {
    appendText(nodes, value.slice(lastIndex));
  }
}

export function parseMessageContent(content: string): MessageContentNode[] {
  const nodes: MessageContentNode[] = [];
  for (const node of splitMath(content)) {
    if (node.type === 'text') {
      appendRefs(nodes, node.value);
    } else {
      nodes.push(node);
    }
  }
  return nodes;
}
