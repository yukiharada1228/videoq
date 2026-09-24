import { describe, expect, it } from 'vitest'
import { parseMessageContent } from '../parseMessageContent'

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

  it('finds later formulas after an unclosed expression', () => {
    expect(parseMessageContent(String.raw`prefix \[a {b\] still text \(c\) [1]`)).toEqual([
      { type: 'text', value: String.raw`prefix \[a {b\] still text ` },
      { type: 'math', value: 'c', display: false },
      { type: 'text', value: ' ' },
      { type: 'ref', id: 1 },
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
