import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChatMessageBubble } from '../ChatMessageBubble';
import type { Message } from '@/hooks/useChatMessages';

describe('chat activity display', () => {
  it.each([false, true])('keeps the waiting label until queued answer text is visible (searched: %s)', (searched) => {
    const props = { feedbackUpdatingId: null, onFeedback: vi.fn(), onVideoNavigate: vi.fn() };
    const message: Message = {
      role: 'assistant', content: '', progress: {
        phase: searched ? 'reviewing' : 'preparing',
        searches: searched ? [{ id: 1, query: 'ドモルガンの定理', status: 'complete' }] : [],
      },
    };
    const { rerender } = render(<ChatMessageBubble {...props} message={message} isAwaitingResponse />);
    const waitingLabel = screen.getByRole('status').textContent;

    // The network has finished, but the typewriter has not painted the answer.
    const receivedMessage: Message = { ...message, progress: { ...message.progress!, phase: 'complete' } };
    rerender(<ChatMessageBubble {...props} message={receivedMessage} isAwaitingResponse />);
    expect(screen.getByRole('status').textContent).toBe(waitingLabel);

    rerender(<ChatMessageBubble {...props} message={{ ...receivedMessage, content: '回答' }} isAwaitingResponse />);
    expect(screen.getByText('回答')).toBeVisible();
    if (searched) {
      expect(screen.getByRole('status')).toHaveTextContent('chat.progress.searched');
    } else {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }
  });

  it('shows a compact status and reveals only the searched topics on demand', () => {
    const props = { feedbackUpdatingId: null, onFeedback: vi.fn(), onVideoNavigate: vi.fn() };
    const message: Message = {
      role: 'assistant', content: '', progress: { phase: 'searching', searches: [
        { id: 1, query: '回路を簡単にする', status: 'complete', resultCount: 20 },
        { id: 2, query: 'ドモルガンの定理', status: 'running' },
      ] },
    };
    const { rerender } = render(<ChatMessageBubble {...props} message={message} isAwaitingResponse />);
    expect(screen.getByText('ドモルガンの定理')).not.toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('chat.progress.checkingVideos');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    rerender(<ChatMessageBubble {...props} message={{
      ...message, progress: {
        phase: 'reviewing', searches: message.progress!.searches.map((search) => ({ ...search, status: 'complete', resultCount: 20 })),
      },
    }} isAwaitingResponse />);
    expect(screen.getByRole('status')).toHaveTextContent('chat.progress.checkingVideos');
    expect(screen.getByText('ドモルガンの定理')).not.toBeVisible();

    rerender(<ChatMessageBubble {...props} message={message} isAwaitingResponse />);
    expect(screen.getByRole('status')).toHaveTextContent('chat.progress.checkingVideos');

    rerender(<ChatMessageBubble {...props} message={{
      ...message, content: '定理を使って簡単にできます。', progress: {
        phase: 'complete', searches: [
          ...message.progress!.searches.map((search) => ({ ...search, status: 'complete' as const, resultCount: 20 })),
          { id: 3, query: 'ドモルガンの定理', status: 'complete', resultCount: 20 },
        ],
      },
    }} />);
    expect(screen.getByText('定理を使って簡単にできます。')).toBeVisible();
    const toggle = screen.getByRole('button', { name: /chat.progress.details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '回路を簡単にする', 'ドモルガンの定理',
    ]);
    expect(within(screen.getByRole('list')).getByText('回路を簡単にする')).toBeVisible();
    expect(within(screen.getByRole('list')).getByText('ドモルガンの定理')).toBeVisible();
  });
});
