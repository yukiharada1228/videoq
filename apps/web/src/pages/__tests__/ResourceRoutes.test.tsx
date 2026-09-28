import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VideoDetailPage from '../VideoDetailPage';
import VideoCourseDetailPage from '../VideoCourseDetailPage';

const route = vi.hoisted(() => ({ id: undefined as string | undefined }));
vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useParams: () => route,
}));

describe.each([
  { name: 'video', Page: VideoDetailPage, procedure: 'videos.get', path: '/videos', message: 'videoNotFound' },
  { name: 'course', Page: VideoCourseDetailPage, procedure: 'courses.get', path: '/videos/courses', message: 'courseNotFound' },
])('$name route IDs', ({ Page, procedure, path, message }) => {
  const read = vi.fn();
  beforeEach(() => {
    read.mockReset().mockResolvedValue(null);
    globalThis.__setTrpcHandler('account.me', () => ({ id: '1', username: 'testuser' }));
    globalThis.__setTrpcHandler(procedure, read);
    globalThis.__setMockPathname(path);
  });

  it.each(['1suffix', '1.5', '-1', '0', '9007199254740993', '1e2', '0x10', undefined])(
    'shows not found for %s without querying another resource', async id => {
      route.id = id;
      render(<MemoryRouter><Page /></MemoryRouter>);
      await screen.findByText(`common.messages.${message}`);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(['0003', '9007199254740991'])('queries decimal ID %s without truncation', async id => {
    route.id = id;
    render(<MemoryRouter><Page /></MemoryRouter>);
    await waitFor(() => expect(read).toHaveBeenCalledExactlyOnceWith({ id: Number(id) }));
  });
});
