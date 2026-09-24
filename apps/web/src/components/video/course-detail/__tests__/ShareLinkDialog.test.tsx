import { useState, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShareLinkDialog } from '../ShareLinkDialog';

function createProps(): ComponentProps<typeof ShareLinkDialog> {
  return {
    isOpen: true,
    shareSlug: 'linear-algebra',
    shareLink: 'https://videoq.example/shared/linear-algebra',
    isGeneratingLink: false,
    isDeletingLink: false,
    isCopied: false,
    onOpenChange: vi.fn(),
    onGenerate: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
  };
}

describe('ShareLinkDialog', () => {
  it.each(['button', 'cancel'] as const)(
    'closes the native dialog before the parent unmounts it on %s',
    (action) => {
      const props = createProps();
      const onNativeClose = vi.fn();

      function Parent() {
        const [open, setOpen] = useState(true);
        return open ? (
          <ShareLinkDialog
            {...props}
            onOpenChange={(value) => {
              props.onOpenChange(value);
              setOpen(value);
            }}
          />
        ) : null;
      }

      render(<Parent />);
      const dialog = screen.getByRole('dialog');
      dialog.addEventListener('close', onNativeClose);

      if (action === 'button') {
        fireEvent.click(screen.getByRole('button', { name: 'common.actions.close' }));
      } else {
        fireEvent(dialog, new Event('cancel', { cancelable: true }));
      }

      expect(onNativeClose).toHaveBeenCalledTimes(1);
      expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(onNativeClose.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(props.onOpenChange).mock.invocationCallOrder[0],
      );
      expect(dialog).not.toHaveAttribute('open');
      expect(dialog).not.toBeInTheDocument();
    },
  );

  it.each(['isGeneratingLink', 'isDeletingLink'] as const)(
    'blocks closing while %s is pending and allows it after completion',
    (pending) => {
      const props = createProps();
      const { rerender } = render(<ShareLinkDialog {...props} {...{ [pending]: true }} />);
      const dialog = screen.getByRole('dialog');
      const close = screen.getByRole('button', { name: 'common.actions.close' });

      expect(close).toBeDisabled();
      fireEvent.click(close);
      fireEvent(dialog, new Event('cancel', { cancelable: true }));

      expect(props.onOpenChange).not.toHaveBeenCalled();
      expect(dialog).toHaveAttribute('open');

      rerender(<ShareLinkDialog {...props} />);

      expect(close).toBeEnabled();
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(dialog).not.toHaveAttribute('open');
    },
  );
});
