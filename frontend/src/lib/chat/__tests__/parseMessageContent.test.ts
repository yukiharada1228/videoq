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
})
