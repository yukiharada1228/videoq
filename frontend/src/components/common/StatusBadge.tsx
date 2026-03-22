import { useTranslation } from 'react-i18next';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';

interface StatusBadgeProps {
  status: string;
  size?: 'xs' | 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <span className={getStatusBadgeClassName(status, size)}>
      {t(getStatusLabel(status))}
    </span>
  );
}
