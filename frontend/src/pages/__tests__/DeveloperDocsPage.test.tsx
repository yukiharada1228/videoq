import { render, screen, waitFor } from '@testing-library/react'
import DeveloperDocsPage from '../DeveloperDocsPage'
import { docsSectionIds } from '@/lib/docs/sections'

const schema = {
  paths: {
    '/api/account/me': { get: { summary: 'Current user profile (app fields)' } },
    '/api/videos': {
      get: { summary: 'List videos', tags: ['Videos'] },
      post: { summary: 'Upload a video', tags: ['Videos'] },
    },
    '/api/videos/groups': { get: { summary: 'List groups', tags: ['Groups'] } },
    '/api/chat/messages': { post: { summary: 'Send chat message', tags: ['Chat'] } },
    '/api/v1/chat/completions': {
      post: { summary: 'OpenAI-compatible chat completions', tags: ['Chat'] },
    },
    '/health': { get: { summary: 'Liveness probe', tags: ['Health'] } },
  },
}

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: { getSchema: vi.fn(() => Promise.resolve(schema)) },
  }
})

describe('DeveloperDocsPage', () => {
  it('links to every docs section', async () => {
    render(<DeveloperDocsPage />)

    for (const id of docsSectionIds) {
      const link = await screen.findByRole('link', { name: new RegExp(`docs\\.sections\\.${id}\\.title`) })
      expect(link).toHaveAttribute('href', `/docs/${id}`)
    }
  })

  it('shows the endpoint count each section resolves to in the live schema', async () => {
    render(<DeveloperDocsPage />)

    // /api/videos GET + POST land in videos; the OpenAI path is not counted as chat.
    await waitFor(() => {
      expect(screen.getByText('docs.home.endpointCount {"count":2}')).toBeInTheDocument()
    })
    expect(screen.getAllByText('docs.home.endpointCount {"count":1}')).toHaveLength(4)
  })

  it('points at the endpoints the API actually serves', async () => {
    render(<DeveloperDocsPage />)

    const reference = await screen.findByRole('link', { name: /docs\.home\.references\.reference/ })
    expect(reference.getAttribute('href')).toMatch(/\/api\/docs$/)

    const openapi = screen.getByRole('link', { name: /docs\.home\.references\.openapi/ })
    expect(openapi.getAttribute('href')).toMatch(/\/api\/openapi\.json$/)

    const redoc = screen.getByRole('link', { name: /docs\.home\.references\.redoc/ })
    expect(redoc.getAttribute('href')).toMatch(/\/api\/redoc$/)
  })
})
