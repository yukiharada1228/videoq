import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Course, VideoListItem } from '@videoq/trpc';
import { useVideos } from '@/hooks/useVideos';
import { PickFromLibraryDialog } from '../PickFromLibraryDialog';

const video = (id: number): VideoListItem => ({
  id, title: `Video ${id}`, description: `Description ${id}`, file: null,
  uploaded_at: '2026-09-23T00:00:00Z', status: 'completed', source_type: 'uploaded', tags: [],
});
const course: Course = {
  id: 7, name: 'Course', description: '', display_order: 0,
  created_at: '2026-09-23T00:00:00Z', video_count: 0, videos: [], access_role: 'owner',
};
const props = { isOpen: true, courseId: course.id, course, onOpenChange: vi.fn() };
const list = vi.fn();
const add = vi.fn();
const intersections = new Set<() => void>();
const enterViewport = () => act(() => { for (const notify of [...intersections]) notify(); });

function library(videos: VideoListItem[]) {
  list.mockImplementation((input: { limit: number; cursor?: number; q?: string }) => {
    const offset = input.cursor ?? 0;
    const data = input.q ? videos.filter(row => row.title.includes(input.q!)) : videos;
    return { data: data.slice(offset, offset + input.limit), meta: { total: data.length, limit: input.limit, offset } };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  intersections.clear();
  vi.stubGlobal('IntersectionObserver', vi.fn((callback: IntersectionObserverCallback) => {
    const observer = {
      observe: () => { intersections.add(notify); },
      disconnect: () => { intersections.delete(notify); },
      unobserve: () => { intersections.delete(notify); },
    };
    const notify = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
    return observer;
  }));
  globalThis.__setTrpcHandler('videos.list', list);
  globalThis.__setTrpcHandler('memberships.addVideos', add);
  globalThis.__setTrpcHandler('tags.list', () => ({ data: [], meta: { total: 0, limit: 100, offset: 0 } }));
  add.mockResolvedValue({ message: 'Added', added_count: 1, skipped_count: 0 });
});

afterEach(() => vi.unstubAllGlobals());

it('shares the library page request and loads only the initial 24 videos', async () => {
  library(Array.from({ length: 105 }, (_, index) => video(index + 1)));
  function Library() {
    const { videos } = useVideos({ ordering: 'uploaded_at_desc' });
    return <output data-testid="library-count">{videos.length}</output>;
  }
  render(<><Library /><PickFromLibraryDialog {...props} course={{ ...course, videos: [{ ...video(1), order: 0 }] }} /></>);

  await screen.findByRole('checkbox', { name: 'Video 24 Description 24' });
  expect(screen.queryByRole('checkbox', { name: 'Video 1 Description 1' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Video 25 Description 25' })).not.toBeInTheDocument();
  expect(screen.getByTestId('library-count')).toHaveTextContent('24');
  expect(list).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ordering: 'uploaded_at_desc', limit: 24, cursor: 0 }));
});

it('reaches videos beyond the first 100 even when every earlier page belongs to the course', async () => {
  const videos = Array.from({ length: 105 }, (_, index) => video(index + 1));
  library(videos);
  render(<PickFromLibraryDialog {...props} course={{ ...course, videos: videos.slice(0, 100).map(row => ({ ...row, order: row.id })) }} />);
  for (let page = 0; page < 4; page++) {
    await screen.findByRole('button', { name: 'videos.courseDetail.loadMoreVideos' });
    expect(screen.queryByText('videos.courseDetail.noAvailableVideos')).not.toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(page + 1));
    enterViewport();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(page + 2));
  }

  fireEvent.click(await screen.findByRole('checkbox', { name: 'Video 105 Description 105' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  expect(screen.queryByRole('button', { name: 'videos.courseDetail.loadMoreVideos' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.add' }));
  await waitFor(() => expect(add).toHaveBeenCalledExactlyOnceWith({ courseId: 7, videoIds: [105] }));
  expect(list.mock.calls.map(([input]) => input.cursor)).toEqual([0, 24, 48, 72, 96]);
});

it('retains selected videos while a later page is pending or failed, then retries that page', async () => {
  const videos = Array.from({ length: 25 }, (_, index) => video(index + 1));
  let failPage!: (error: Error) => void;
  list.mockImplementationOnce(() => ({ data: videos.slice(0, 24), meta: { total: 25, limit: 24, offset: 0 } }))
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { failPage = reject; }))
    .mockResolvedValue({ data: videos.slice(24), meta: { total: 25, limit: 24, offset: 24 } });
  render(<PickFromLibraryDialog {...props} />);
  const first = await screen.findByRole('checkbox', { name: 'Video 1 Description 1' });
  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.loadMoreVideos' }));
  await waitFor(() => expect(failPage).toBeDefined());
  try {
    expect(first).toBeInTheDocument();
    expect(first).toBeChecked();
    enterViewport();
    expect(list).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => failPage(new Error('Later page failed')));
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('Later page failed');
  expect(first).toBeChecked();
  enterViewport();
  expect(list).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.retryLoadVideos' }));
  await screen.findByText('Video 25');
  expect(screen.getByRole('checkbox', { name: 'Video 25 Description 25' })).toBeInTheDocument();
  expect(first).toBeChecked();
  expect(list.mock.calls.map(([input]) => input.cursor)).toEqual([0, 24, 24]);
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.selectAll' }));
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(25);
});

it('retries an initial failure without showing an empty library', async () => {
  list.mockRejectedValueOnce(new Error('Library unavailable'))
    .mockResolvedValue({ data: [video(1)], meta: { total: 1, limit: 24, offset: 0 } });
  render(<PickFromLibraryDialog {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Library unavailable');
  expect(screen.queryByText('videos.courseDetail.noAvailableVideos')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.retryLoadVideos' }));
  await screen.findByRole('checkbox', { name: 'Video 1 Description 1' });
  expect(list).toHaveBeenCalledTimes(2);
});

it('does not fetch a closed picker and re-filters course membership without refetching', async () => {
  library([video(1), video(2)]);
  const { rerender } = render(<PickFromLibraryDialog {...props} isOpen={false} />);
  expect(list).not.toHaveBeenCalled();
  rerender(<PickFromLibraryDialog {...props} />);
  await screen.findByRole('checkbox', { name: 'Video 1 Description 1' });
  rerender(<PickFromLibraryDialog {...props} course={{ ...course, videos: [{ ...video(1), order: 0 }] }} />);
  expect(screen.queryByRole('checkbox', { name: 'Video 1 Description 1' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(list).toHaveBeenCalledTimes(1);
});

it('restarts pagination when a search changes after loading more videos', async () => {
  library(Array.from({ length: 30 }, (_, index) => video(index + 1)));
  render(<PickFromLibraryDialog {...props} />);
  await screen.findByRole('checkbox', { name: 'Video 24 Description 24' });
  fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.loadMoreVideos' }));
  await screen.findByRole('checkbox', { name: 'Video 30 Description 30' });
  fireEvent.change(screen.getByRole('textbox', { name: 'videos.courseDetail.searchPlaceholder' }), { target: { value: 'Video 30' } });
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: 'uploaded_at_desc', q: 'Video 30', limit: 24, cursor: 0 })));
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
  expect(screen.getByRole('checkbox', { name: 'Video 30 Description 30' })).toBeInTheDocument();
});
