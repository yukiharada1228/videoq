import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import i18n from '@/i18n/config';
import { CourseSharingNotice } from './CourseSharingNotice';

const meta = {
  title: 'Video/CourseSharingNotice',
  component: CourseSharingNotice,
  args: { method: 'link' },
  parameters: { a11y: { test: 'error' } },
  render: args => <div className="max-w-2xl p-4"><CourseSharingNotice {...args} /></div>,
  async play({ canvas, args }) {
    await expect(canvas.getByText(i18n.t(`courseSharing.${args.method}`))).toBeVisible();
    await expect(canvas.getByText(i18n.t('courseSharing.quotaAndHistory'))).toBeVisible();
    const link = canvas.getByRole('link');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAccessibleName(`${i18n.t('courseSharing.learnMore')} ${i18n.t('courseSharing.opensInNewTab')}`);
  },
} satisfies Meta<typeof CourseSharingNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShareJapanese: Story = { globals: { locale: 'ja' } };
export const ShareEnglishMobile: Story = { globals: { locale: 'en', viewport: { value: 'mobile', isRotated: false } } };
export const InvitationJapaneseMobile: Story = { args: { method: 'invitation' }, globals: { locale: 'ja', viewport: { value: 'mobile', isRotated: false } } };
export const InvitationEnglish: Story = { args: { method: 'invitation' }, globals: { locale: 'en' } };
