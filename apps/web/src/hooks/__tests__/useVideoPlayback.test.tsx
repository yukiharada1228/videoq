import { act, renderHook } from '@testing-library/react';
import type { VideoInCourse } from '@videoq/trpc';
import { useVideoPlayback } from '../useVideoPlayback';

function video(id: number, source_type: VideoInCourse['source_type'] = 'uploaded') {
  return { id, source_type };
}

function player() {
  const element = document.createElement('video');
  vi.spyOn(element, 'play').mockResolvedValue();
  return element;
}

describe('useVideoPlayback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('waits for the requested video and consumes its pending seek only once', () => {
    const onVideoSelect = vi.fn();
    const { result, rerender } = renderHook(({ selectedVideo }) => useVideoPlayback({
      selectedVideo, onVideoSelect,
    }), { initialProps: { selectedVideo: video(1) } });
    const previous = player();
    const target = player();
    result.current.videoRef.current = previous;

    act(() => result.current.handleVideoPlayFromTime(2, '00:02:00'));
    act(() => result.current.handleVideoCanPlay());
    expect(previous.currentTime).toBe(0);
    expect(previous.play).not.toHaveBeenCalled();
    expect(onVideoSelect).toHaveBeenCalledExactlyOnceWith(2);

    rerender({ selectedVideo: video(2) });
    result.current.videoRef.current = target;
    act(() => result.current.handleVideoCanPlay());
    expect(target.currentTime).toBe(120);
    target.currentTime = 125;
    act(() => result.current.handleVideoCanPlay());
    expect(target.currentTime).toBe(125);
    expect(target.play).toHaveBeenCalledTimes(1);
  });

  it('does not apply a YouTube citation time to a different selected video', () => {
    const { result, rerender } = renderHook(({ selectedVideo }) => useVideoPlayback({
      selectedVideo, onVideoSelect: vi.fn(),
    }), { initialProps: { selectedVideo: video(1, 'youtube') } });

    act(() => result.current.handleVideoPlayFromTime(1, '00:02:00'));
    expect(result.current.youtubeStartSeconds).toBe(120);
    rerender({ selectedVideo: video(2, 'youtube') });
    expect(result.current.youtubeStartSeconds).toBeNull();
  });

  it('seeks the current file directly and tolerates blocked automatic playback', async () => {
    const onVideoSelect = vi.fn();
    const onMobileSwitch = vi.fn();
    const { result } = renderHook(() => useVideoPlayback({
      selectedVideo: video(1), onVideoSelect, onMobileSwitch,
    }));
    const element = player();
    vi.mocked(element.play).mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError'));
    result.current.videoRef.current = element;

    await act(async () => result.current.handleVideoPlayFromTime(1, '00:01:30'));
    expect(element.currentTime).toBe(90);
    expect(onVideoSelect).not.toHaveBeenCalled();
    expect(onMobileSwitch).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending citation when the user chooses a video manually', () => {
    const { result, rerender } = renderHook(({ selectedVideo }) => useVideoPlayback({
      selectedVideo, onVideoSelect: vi.fn(),
    }), { initialProps: { selectedVideo: video(1) } });
    const element = player();
    act(() => result.current.handleVideoPlayFromTime(2, '00:02:00'));
    act(() => result.current.handleVideoSelect(3));
    rerender({ selectedVideo: video(3) });
    result.current.videoRef.current = element;
    act(() => result.current.handleVideoCanPlay());
    act(() => result.current.handleVideoSelect(2));
    rerender({ selectedVideo: video(2) });
    act(() => result.current.handleVideoCanPlay());
    expect(element.currentTime).toBe(0);
    expect(element.play).not.toHaveBeenCalled();
  });
});
