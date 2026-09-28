import { fireEvent, render, screen } from '@testing-library/react'
import katex from 'katex'
import { applyChatPart, answerParts, plainChatAnswer, type ChatAnswer } from '@videoq/trpc/chat'
import { MessageBody } from '../MessageBody'
const source = { id: 1, video_id: 7, title: 'Video', start_time: '00:00:10', end_time: null }

describe('MessageBody', () => {
  afterEach(() => vi.restoreAllMocks())
  it.each(['history', 'stream'])('renders the same math, code and citation positions from %s', mode => {
    const saved: ChatAnswer = { segments: [
      { text: '$ x[01] $', sourceIds: [1] },
      { text: '~~~ $y$\n```js\nconst ticks = "```";\n[1]\n````\n$z$', sourceIds: [1] },
    ], sources: [source] }
    const streamed: ChatAnswer = { segments: [], sources: [source] }
    for (const part of answerParts(saved)) applyChatPart(streamed, part)
    const navigate = vi.fn()
    const { container } = render(<MessageBody answer={mode === 'history' ? saved : streamed} onVideoNavigate={navigate} />)
    expect(Array.from(container.querySelectorAll('annotation'), node => node.textContent)).toEqual([' x[01] ', 'y', 'z'])
    const buttons = screen.getAllByRole('button', { name: 'Video 00:00:10' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    expect(navigate).toHaveBeenCalledExactlyOnceWith(7, '00:00:10')
    expect(container.textContent).toContain('const ticks = "```";\n[1]\n````')
  })
  it('treats all reference-like prose literally and drops unknown source links', () => {
    const { container } = render(<MessageBody answer={{ segments: [{ text: '[1] [99] [-1] [1.5] `a[1]` [1](url)', sourceIds: [1, 99] }], sources: [source] }} onVideoNavigate={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(container.textContent).toContain('[1] [99] [-1] [1.5] `a[1]` [1](url)')
  })
  it('renders a matrix and normalizes millisecond timestamps', () => {
    const text = String.raw`回転行列: \[R = \begin{pmatrix}\cos\theta & -\sin\theta \\ \sin\theta & \cos\theta\end{pmatrix}\]`
    const { container } = render(<MessageBody answer={{ segments: [{ text, sourceIds: [1] }], sources: [{ ...source, start_time: '00:06:37,480', end_time: '00:07:47,900' }] }} onVideoNavigate={vi.fn()} />)
    expect(container.querySelector('.katex-display')).toBeInTheDocument()
    expect(container.querySelector('annotation')?.textContent).toContain('pmatrix')
    expect(screen.getByRole('button')).toHaveTextContent('(6:37-7:47)')
  })
  it('reuses unchanged math while text streams and updates changed formulas', () => {
    const renderMath = vi.spyOn(katex, 'renderToString')
    const props = { answer: plainChatAnswer('Formula: \\(a+b\\)'), onVideoNavigate: vi.fn() }
    const { container, rerender } = render(<MessageBody {...props} />)
    for (const suffix of ['', ' is', ' is explained', ' is explained here.']) {
      rerender(<MessageBody {...props} answer={plainChatAnswer('Formula: \\(a+b\\)' + suffix)} />)
      expect(renderMath).toHaveBeenCalledTimes(1)
    }
    rerender(<MessageBody {...props} answer={plainChatAnswer('Formula: \\[a-b\\]')} />)
    expect(renderMath).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.katex-display')).toBeInTheDocument()
  })
  it('joins text segments without adding whitespace or breaking a split formula', () => {
    const { container } = render(<MessageBody answer={{ segments: [{ text: 'Hello  \\(a', sourceIds: [] }, { text: '+b\\)\n', sourceIds: [1] }], sources: [source] }} onVideoNavigate={vi.fn()} />)
    expect(container.querySelector('annotation')).toHaveTextContent('a+b')
    expect(container.textContent).toContain('Hello  ')
  })
})
