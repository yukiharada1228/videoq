import { render, screen, fireEvent } from '@testing-library/react';
import { UploadResumeSelector } from '../UploadResumeSelector';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: '1' } }) }));

it('lists owned interrupted uploads and lets the user select one to resume', async () => {
  globalThis.__setTrpcHandler('videos.listResumableUploads', () => [{ id: 161, title: 'Lecture' }]);
  const onChange = vi.fn();
  const { rerender } = render(<UploadResumeSelector disabled={false} onChange={onChange} />);
  const select = await screen.findByLabelText('videos.upload.resume.label');
  expect(screen.getByRole('option', { name: 'Lecture (#161)' })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: '161' } });
  expect(onChange).toHaveBeenCalledWith(161);
  rerender(<UploadResumeSelector disabled value={161} onChange={onChange} />);
  expect(select).toBeDisabled();
});
