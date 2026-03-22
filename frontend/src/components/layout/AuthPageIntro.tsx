import type { ReactNode } from 'react';

interface AuthPageIntroProps {
  badge: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

export function AuthPageIntro({ badge, title, description }: AuthPageIntroProps) {
  return (
    <div className="mb-8">
      <div className="inline-flex px-4 py-1.5 rounded-full bg-[#d3ffd5] text-[#2c4e32] text-xs font-bold tracking-wide mb-6">
        {badge}
      </div>
      <h1 className="font-extrabold text-3xl text-[#191c19] tracking-tight leading-tight">
        {title}
      </h1>
      <div className="h-1.5 w-14 bg-[#00652c] rounded-full mt-4 mb-6" />
      {description ? <p className="text-[#6f7a6e] text-sm leading-relaxed">{description}</p> : null}
    </div>
  );
}
