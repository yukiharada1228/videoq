import { render, screen } from '@testing-library/react'
import React from 'react'
import DeveloperDocsSectionPage from '../DeveloperDocsSectionPage'

const schema = {
  paths: {
    '/api/account/me': { get: { summary: 'Current user profile (app fields)' } },
    '/api/videos': {
      get: { summary: 'List videos', tags: ['Videos'] },
    },
    '/api/videos/groups': { get: { summary: 'List groups', tags: ['Groups'] } },
    '/api/videos/groups/{groupId}/videos': {
      post: { summary: 'Add videos to a group', tags: ['Membership'] },
    },
    '/api/videos/{videoId}/tags': {
      post: { summary: 'Attach tags to a video', tags: ['Membership'] },
    },
    '/api/chat/messages': { post: { summary: 'Send chat message', tags: ['Chat'] } },
    '/api/v1/chat/completions': {
      post: { summary: 'OpenAI-compatible chat completions', tags: ['Chat'] },
    },
  },
}

const params = { section: 'videos' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => params,
    Navigate: ({ to }: { to: string }) => React.createElement('div', {}, `navigate:${to}`),
  }
})

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: { getSchema: vi.fn(() => Promise.resolve(schema)) },
  }
})

describe('DeveloperDocsSectionPage', () => {
  it('lists the endpoints tagged for the section, including collection paths', async () => {
    params.section = 'videos'
    render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/videos')).not.toHaveLength(0)
    expect(screen.queryByText('/api/videos/groups')).not.toBeInTheDocument()
  })

  it('keeps the OpenAI-compatible endpoint out of the chat section', async () => {
    params.section = 'chat'
    render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/chat/messages')).not.toHaveLength(0)
    expect(screen.queryByText('/api/v1/chat/completions')).not.toBeInTheDocument()
  })

  it('splits membership endpoints between the groups and tags sections', async () => {
    params.section = 'groups'
    const { unmount } = render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/videos/groups/{groupId}/videos')).not.toHaveLength(0)
    expect(screen.queryByText('/api/videos/{videoId}/tags')).not.toBeInTheDocument()

    unmount()
    params.section = 'tags'
    render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/videos/{videoId}/tags')).not.toHaveLength(0)
    expect(screen.queryByText('/api/videos/groups/{groupId}/videos')).not.toBeInTheDocument()
  })

  it('shows SDK examples and the raw endpoint for the OpenAI section', async () => {
    params.section = 'openai'
    const { container } = render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/v1/chat/completions')).not.toHaveLength(0)
    expect(screen.getByText('docs.openai.exampleTitle')).toBeInTheDocument()
    expect(container.textContent).toContain('Authorization: Bearer vq_your_key_here')
    expect(container.textContent).not.toContain('X-API-Key: vq_your_key_here')
  })

  it('uses the browser session for account endpoint examples', async () => {
    params.section = 'auth'
    const { container } = render(<DeveloperDocsSectionPage />)

    expect(await screen.findAllByText('/api/account/me')).not.toHaveLength(0)
    expect(container.textContent).toContain('Cookie: <session-cookie-name>=<session-cookie-value>')
    expect(container.textContent).toContain('credentials: "include"')
    expect(container.textContent).not.toContain('X-API-Key: vq_your_key_here')
  })

  it('redirects unknown sections back to the docs index', () => {
    params.section = 'nope'
    render(<DeveloperDocsSectionPage />)

    expect(screen.getByText('navigate:/docs')).toBeInTheDocument()
  })
})
