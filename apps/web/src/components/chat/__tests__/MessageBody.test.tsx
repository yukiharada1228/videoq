import { fireEvent, render, screen } from '@testing-library/react'
import katex from 'katex'
import { parseCitationParts } from '@videoq/trpc/chat'
import { MessageBody } from '../MessageBody'

const ROTATION_MATRIX = String.raw`\begin{pmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{pmatrix}`

describe('MessageBody', () => {
  it.each(['history', 'typed stream'])('keeps math and code intact alongside clickable citations: %s', (format) => {
    const citations = [{ id: 1, video_id: 7, title: 'Video', start_time: '00:00:10', end_time: null }]
    const content = '$ x[01] $[1]~~~ $y$\n```js\nconst ticks = "```";\n[1]\n````\n$z$[1]'
    const navigate = vi.fn()
    const { container } = render(<MessageBody content={content}
      parts={format === 'typed stream' ? parseCitationParts(content, id => id === 1) : undefined}
      citations={citations} onVideoNavigate={navigate} />)
    expect(Array.from(container.querySelectorAll('annotation'), node => node.textContent)).toEqual([' x[01] ', 'y', 'z'])
    const buttons = screen.getAllByRole('button', { name: 'Video 00:00:10' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    expect(navigate).toHaveBeenCalledExactlyOnceWith(7, '00:00:10')
    expect(container.textContent).toContain('const ticks = "```";\n[1]\n````')
  })

  it('renders typed citations without interpreting references in literal text parts', () => {
    const citations = [{ id: 1, video_id: 7, title: 'Video', start_time: '00:00:10', end_time: null }]
    render(<MessageBody content="unused" parts={[
      { type: 'text', text: 'Literal [1] and $x[1]$ ' },
      { type: 'citation', sourceId: 1 },
      { type: 'text', text: ' more' },
    ]} citations={citations} onVideoNavigate={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Video 00:00:10' })).toHaveLength(1)
    expect(screen.getByText(/Literal \[1\]/)).toBeInTheDocument()
    expect(screen.queryByText('unused')).not.toBeInTheDocument()
  })

  it('uses the same citation rules for legacy responses and saved history', () => {
    const citations = [{ id: 1, video_id: 7, title: 'Video', start_time: '00:00:10', end_time: null }]
    const { container } = render(<MessageBody content={'[1] [99] [-1] [1.5] `a[1]` $x[1]$ [1](url)'}
      citations={citations} onVideoNavigate={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Video 00:00:10' })).toHaveLength(1)
    expect(container.textContent).toContain('[99] [-1] [1.5] `a[1]`')
    expect(container.textContent).toContain('[1](url)')
  })

  afterEach(() => vi.restoreAllMocks())

  it('renders display TeX instead of the raw delimiters', () => {
    const content = `回転行列は次の形になります。\n\n\\[\n${ROTATION_MATRIX}\n\\]\n\nこの行列を使います。[1]`

    const { container } = render(
      <MessageBody
        content={content}
        citations={[{ id: 1, video_id: 7, title: '線形代数', start_time: '00:21:37', end_time: '00:22:20' }]}
        onVideoNavigate={vi.fn()}
      />,
    )

    expect(container.querySelector('.katex-display')).toBeInTheDocument()
    expect(container.querySelector('.katex-html')?.textContent).toContain('cos')
    expect(container.querySelector('annotation')?.textContent).toContain('pmatrix')
    expect(container.querySelector('.katex-html')?.textContent).not.toContain('\\[')
    expect(screen.getByRole('button', { name: '線形代数 00:21:37' })).toHaveTextContent('(21:37-22:20)')
    expect(screen.getByText(/回転行列は次の形になります/)).toBeInTheDocument()
  })

  it('renders inline TeX in the surrounding sentence', () => {
    const { container } = render(
      <MessageBody content={'辺の長さは \\(a\\) です。'} onVideoNavigate={vi.fn()} />,
    )

    expect(container.querySelector('.katex')).toBeInTheDocument()
    expect(container.textContent).toContain('辺の長さは')
    expect(container.textContent).toContain('です。')
    expect(container.textContent).not.toContain('\\(a\\)')
  })

  it('normalizes millisecond timestamps in inline citation links', () => {
    render(<MessageBody
      content="Deep learning is useful[1]. It finds a good function."
      citations={[{ id: 1, video_id: 1, title: 'Test Video', start_time: '00:06:37,480', end_time: '00:07:47,900' }]}
      onVideoNavigate={vi.fn()}
    />)
    expect(screen.getByRole('button', { name: 'Test Video 00:06:37,480' })).toHaveTextContent('(6:37-7:47)')
  })

  it('reuses unchanged formulas while the surrounding answer streams and updates changed formulas', () => {
    const renderMath = vi.spyOn(katex, 'renderToString')
    const props = { content: 'Formula: \\(a+b\\)', onVideoNavigate: vi.fn() }
    const { container, rerender } = render(<MessageBody {...props} />)
    expect(renderMath).toHaveBeenCalledTimes(1)

    for (const suffix of ['', ' is', ' is explained', ' is explained here.']) {
      rerender(<MessageBody {...props} content={props.content + suffix} onVideoNavigate={vi.fn()} />)
      expect(renderMath).toHaveBeenCalledTimes(1)
      expect(container.querySelector('annotation')).toHaveTextContent('a+b')
    }

    const navigate = vi.fn()
    rerender(<MessageBody content={'Formula: \\(a-b\\) [1]'} onVideoNavigate={navigate}
      citations={[{ id: 1, video_id: 7, title: 'Lecture', start_time: '00:00:10', end_time: null }]} />)
    expect(renderMath).toHaveBeenCalledTimes(2)
    expect(container.querySelector('annotation')).toHaveTextContent('a-b')
    fireEvent.click(screen.getByRole('button', { name: 'Lecture 00:00:10' }))
    expect(navigate).toHaveBeenCalledExactlyOnceWith(7, '00:00:10')

    rerender(<MessageBody {...props} content={'Formula: \\[a-b\\]'} />)
    expect(renderMath).toHaveBeenCalledTimes(3)
    expect(container.querySelector('.katex-display')).toBeInTheDocument()
  })
})
