import type { ReactNode } from 'react';
import { Heading, HeadingShoulder, HeadingTitle } from '@/components/ui/heading';

interface AppPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

export function AppPageHeader({
  title,
  description,
  action,
  badge,
  className = '',
}: AppPageHeaderProps) {
  return (
    <header className={`mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end ${className}`}>
      <div className="min-w-0">
        <Heading size="28" hasChip={!!badge} rule="4" className="mb-3">
          {badge ? <HeadingShoulder>{badge}</HeadingShoulder> : null}
          <HeadingTitle level="h1">{title}</HeadingTitle>
        </Heading>
        {description ? (
          <p className="max-w-3xl text-std-16N-170 text-solid-gray-700">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
