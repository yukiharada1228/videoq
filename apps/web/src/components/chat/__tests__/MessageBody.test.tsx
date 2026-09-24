import { fireEvent, render, screen } from '@testing-library/react'
import katex from 'katex'
import { MessageBody } from '../MessageBody'

const ROTATION_MATRIX = String.raw`\begin{pmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{pmatrix}`

describe('MessageBody', () => {
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
