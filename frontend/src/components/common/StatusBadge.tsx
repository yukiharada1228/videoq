import { useTranslation } from 'react-i18next';
import { ChipLabel } from '@/components/ui/chip-label';
import { getStatusChipColor, getStatusLabel } from '@/lib/utils/video';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const sizeClass =
    size === 'xs'
      ? 'min-h-0 text-oln-14N-100 py-0.5 px-1.5'
      : size === 'sm'
        ? 'min-h-0 text-oln-14N-100'
        : undefined;

  return (
    <ChipLabel
      variant="filled-1"
      color={getStatusChipColor(status)}
      className={cn(sizeClass, className)}
    >
      {t(getStatusLabel(status))}
    </ChipLabel>
  );
}
