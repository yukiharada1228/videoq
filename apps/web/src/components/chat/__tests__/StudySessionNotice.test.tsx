import { act, render, screen } from '@testing-library/react';
import { StudySessionNotice } from '../StudySessionNotice';

it('marks the last confirmed deadline as passed, and accepts a later server-confirmed save', () => {
  vi.useFakeTimers();
  try {
    const now = Date.now();
    const props = { restarted: false, storageAvailable: true, isLoading: false, onRestart: vi.fn() };
    const { rerender, unmount } = render(<StudySessionNotice {...props} info={{ status: 'continued', expires_at: now + 1000 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('chat.studySession.continued');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('status')).toHaveTextContent('chat.studySession.expired');
    rerender(<StudySessionNotice {...props} info={{ status: 'started', expires_at: now + 43_200_000 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('chat.studySession.started');
    unmount();
  } finally {
    vi.useRealTimers();
  }
});
