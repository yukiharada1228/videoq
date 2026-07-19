import {
  NotificationBanner,
  NotificationBannerBody,
} from '@/components/ui/notification-banner';

interface ErrorMessageProps {
  message: string | null;
  title?: string;
}

export function ErrorMessage({ message, title }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <NotificationBanner
      bannerStyle="standard"
      type="error"
      title={title ?? message}
      role="alert"
    >
      <NotificationBannerBody>{title ? message : null}</NotificationBannerBody>
    </NotificationBanner>
  );
}
