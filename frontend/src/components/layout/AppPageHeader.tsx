import type { ReactNode } from 'react';

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
    <header className={`flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 ${className}`}>
      <div>
        {badge ? <div className="mb-3">{badge}</div> : null}
        <h1 className="text-2xl font-extrabold text-[#191c19] tracking-tight mb-1">
          {title}
        </h1>
        {description ? <p className="text-sm text-[#6f7a6e] max-w-3xl">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
