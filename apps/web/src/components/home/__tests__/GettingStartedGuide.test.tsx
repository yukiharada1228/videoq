import { fireEvent, render, screen } from '@testing-library/react'
import { GettingStartedGuide, type GettingStartedProgress } from '../GettingStartedGuide'

const noProgress: GettingStartedProgress = {
  hasVideos: false,
  hasProcessingVideos: false,
  hasCompletedVideos: false,
  hasCourse: false,
  hasCourseVideos: false,
  hasAskedQuestion: false,
}

function renderGuide(progress: Partial<GettingStartedProgress> = {}) {
  return render(
    <GettingStartedGuide
      userId="u1"
      progress={{ ...noProgress, ...progress }}
      courseHref={null}
      onUpload={vi.fn()}
    />,
  )
}

describe('GettingStartedGuide', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('links to the library when no video is processing or ready, such as after a failure', () => {
    renderGuide({ hasVideos: true })

    expect(screen.getByRole('link', { name: 'home.gettingStarted.steps.transcribe.action' }))
      .toHaveAttribute('href', '/videos')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders nothing once every step is done', () => {
    const { container } = renderGuide({
      hasVideos: true,
      hasCompletedVideos: true,
      hasCourse: true,
      hasCourseVideos: true,
      hasAskedQuestion: true,
    })

    expect(container).toBeEmptyDOMElement()
  })

  it('still shows and hides for this visit when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    renderGuide()

    fireEvent.click(screen.getByRole('button', { name: 'home.gettingStarted.dismiss' }))

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})
