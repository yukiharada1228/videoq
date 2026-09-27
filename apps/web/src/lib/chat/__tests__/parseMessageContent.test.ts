import { describe, expect, it } from 'vitest'
import { parseChatText, parseCitationParts } from '@videoq/trpc/chat'
import { parseMessageParts } from '../parseMessageContent'

// These fixtures assume every citation ID belongs to an available source.
const parseMessageContent = (content: string) => parseMessageParts(parseCitationParts(content, () => true))

const ROTATION_MATRIX = String.raw`\begin{pmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{pmatrix}`

describe('parseMessageContent', () => {
  it('keeps plain text unchanged', () => {
    expect(parseMessageContent('回転行列の説明です。')).toEqual([
      { type: 'text', value: '回転行列の説明です。' },
    ])
  })

  it('extracts display math wrapped in \\[ \\]', () => {
    const content = `回転行列は次の形になります。\n\n\\[\n${ROTATION_MATRIX}\n\\]\n\nこの行列を使います。[1]`

    expect(parseMessageContent(content)).toEqual([
      { type: 'text', value: '回転行列は次の形になります。\n\n' },
      { type: 'math', value: `\n${ROTATION_MATRIX}\n`, display: true },
      { type: 'text', value: '\n\nこの行列を使います。' },
      { type: 'ref', id: 1 },
    ])
  })

  it('extracts $$ display math and \\( \\) inline math', () => {
    expect(parseMessageContent('面積は $$a^{2}$$ で、辺は \\(a\\) です。')).toEqual([
      { type: 'text', value: '面積は ' },
      { type: 'math', value: 'a^{2}', display: true },
      { type: 'text', value: ' で、辺は ' },
      { type: 'math', value: 'a', display: false },
      { type: 'text', value: ' です。' },
    ])
  })

  it('extracts $inline$ math without treating currency as math', () => {
    expect(parseMessageContent('コストは $100 で、$x$ を求めます。')).toEqual([
      { type: 'text', value: 'コストは $100 で、' },
      { type: 'math', value: 'x', display: false },
      { type: 'text', value: ' を求めます。' },
    ])
  })

  it('leaves unclosed math as text so streaming replies stay readable', () => {
    expect(parseMessageContent('途中まで \\[ a^2')).toEqual([
      { type: 'text', value: '途中まで \\[ a^2' },
    ])
  })

  it('keeps later TeX when a lone $ is not a closed formula', () => {
    expect(parseMessageContent('PATH は $PATH です。\n\n\\[ x = 1 \\]')).toEqual([
      { type: 'text', value: 'PATH は $PATH です。\n\n' },
      { type: 'math', value: ' x = 1 ', display: true },
    ])
    expect(parseMessageContent('コストは $ 程度。そのあと \\(a\\) です。')).toEqual([
      { type: 'text', value: 'コストは $ 程度。そのあと ' },
      { type: 'math', value: 'a', display: false },
      { type: 'text', value: ' です。' },
    ])
  })

  it('does not let a stray $ consume a later $$ block', () => {
    expect(parseMessageContent('Let $ and then $$a^2$$')).toEqual([
      { type: 'text', value: 'Let $ and then ' },
      { type: 'math', value: 'a^2', display: true },
    ])
  })

  it('parses adjacent delimiter kinds without skipping formulas or citations', () => {
    expect(parseMessageContent(String.raw`$x$\(y\)$$z$$\[w\][2]`)).toEqual([
      { type: 'math', value: 'x', display: false },
      { type: 'math', value: 'y', display: false },
      { type: 'math', value: 'z', display: true },
      { type: 'math', value: 'w', display: true },
      { type: 'ref', id: 2 },
    ])
  })

  it('preserves display math priority and inline dollar exclusions', () => {
    expect(parseMessageContent(String.raw`x$$a$$y \$x$ $20 $z$`)).toEqual([
      { type: 'text', value: 'x' },
      { type: 'math', value: 'a', display: true },
      { type: 'text', value: String.raw`y \$x$ $20 ` },
      { type: 'math', value: 'z', display: false },
    ])
  })

  it('ignores closing delimiters inside TeX braces', () => {
    expect(parseMessageContent(String.raw`\[\frac{a\]b}{c} + d\] [3]`)).toEqual([
      { type: 'math', value: String.raw`\frac{a\]b}{c} + d`, display: true },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 3 },
    ])
  })

  it('renders later formulas but keeps citations inside an unclosed expression literal', () => {
    expect(parseMessageContent(String.raw`prefix \[a {b\] still text \(c\) [1]`)).toEqual([
      { type: 'text', value: String.raw`prefix \[a {b\] still text ` },
      { type: 'math', value: 'c', display: false },
      { type: 'text', value: ' [1]' },
    ])
  })

  it('keeps reference syntax inside formulas as math', () => {
    expect(parseMessageContent('$x[1]$ [1] $$y[2]$$ [2]')).toEqual([
      { type: 'math', value: 'x[1]', display: false },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 1 },
      { type: 'text', value: ' ' },
      { type: 'math', value: 'y[2]', display: true },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 2 },
    ])
  })

  it('keeps whitespace and reference-like subscripts in inline math', () => {
    expect(parseMessageContent('$ x[01] $ [2]')).toEqual([
      { type: 'math', value: ' x[01] ', display: false },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 2 },
    ])
  })

  it('ends unclosed inline math at a newline even after a backslash', () => {
    const text = '$x' + '\\' + '\n'
    expect(parseMessageContent(text + '[2]')).toEqual([{ type: 'text', value: text }, { type: 'ref', id: 2 }])
  })

  it('retains line context across references and adjacent text parts', () => {
    const expected = [
      { type: 'text', value: 'Before' }, { type: 'ref', id: 1 }, { type: 'text', value: '~~~ ' },
      { type: 'math', value: 'x', display: false }, { type: 'text', value: ' ' }, { type: 'ref', id: 2 },
    ]
    expect(parseMessageContent('Before[1]~~~ $x$ [2]')).toEqual(expected)
    expect(parseMessageParts([
      { type: 'text', text: 'Before' }, { type: 'citation', sourceId: 1 },
      { type: 'text', text: '~~~ $' }, { type: 'text', text: 'x$ ' }, { type: 'citation', sourceId: 2 },
    ])).toEqual(expected)
    expect(parseMessageContent('Before[1]\n~~~\n$x$\n~~~\n$y$')).toEqual([
      { type: 'text', value: 'Before' }, { type: 'ref', id: 1 }, { type: 'text', value: '\n~~~\n$x$\n~~~\n' },
      { type: 'math', value: 'y', display: false },
    ])
  })

  it('preserves rendered math when citation parts split mixed delimiter sequences', () => {
    const fragments = ['a', ' ', '\n', '\r\n', '\\', '$', '$$', '`', '``', '```', '~~~', '[1]', '[01]', '[2]', '[0]', '[99]', '[', '1', ']', '{', '}', '(', '\\[', '\\]', '\\(', '\\)', '[1](url)']
    let seed = 994
    const next = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit }
    for (let example = 0; example < 300; example++) {
      const input = Array.from({ length: 24 }, () => fragments[next(fragments.length)]).join('')
      const originalMath = parseChatText(input).filter(node => node.type === 'math')
      const parts = parseCitationParts(input, id => id === 1 || id === 2)
      expect(parseMessageParts(parts).filter(node => node.type === 'math'), JSON.stringify(input)).toEqual(originalMath)
    }
  })

  it.each([
    '```js\nx[1]\n````\n',
    '```js\nconst ticks = "```";\n$x[1]$\n```\n',
    'Use ``a```[1]`` then ',
    '~~~ts\n~~~not a closing fence [1]\n~~~\n',
  ])('preserves code and renders formulas after its entire closing delimiter: %s', (code) => {
    expect(parseMessageContent(code + '$x$ [2]')).toEqual([
      { type: 'text', value: code },
      { type: 'math', value: 'x', display: false },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 2 },
    ])
  })

  it('parses each streaming update independently', () => {
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(parseMessageContent('')).toEqual([])
      expect(parseMessageContent('$$x')).toEqual([{ type: 'text', value: '$$x' }])
      expect(parseMessageContent('$$x$$')).toEqual([{ type: 'math', value: 'x', display: true }])
      expect(parseMessageContent(String.raw`\(y`)).toEqual([{ type: 'text', value: String.raw`\(y` }])
      expect(parseMessageContent(String.raw`\(y\)`)).toEqual([{ type: 'math', value: 'y', display: false }])
    }
  })
})
