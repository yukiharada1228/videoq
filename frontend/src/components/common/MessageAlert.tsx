import {
  NotificationBanner,
  NotificationBannerBody,
  type NotificationBannerType,
} from '@/components/ui/notification-banner';

interface MessageAlertProps {
  message: string;
  type: 'error' | 'success' | 'warning';
}

const typeMap: Record<MessageAlertProps['type'], NotificationBannerType> = {
  error: 'error',
  success: 'success',
  warning: 'warning',
};

export function MessageAlert({ message, type }: MessageAlertProps) {
  return (
    <NotificationBanner
      bannerStyle="standard"
      type={typeMap[type]}
      title={message}
      role="alert"
    >
      <NotificationBannerBody />
    </NotificationBanner>
  );
}
