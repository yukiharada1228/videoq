import { render, screen } from '@testing-library/react'
import { MessageBody } from '../MessageBody'

const ROTATION_MATRIX = String.raw`\begin{pmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{pmatrix}`

describe('MessageBody', () => {
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
})
