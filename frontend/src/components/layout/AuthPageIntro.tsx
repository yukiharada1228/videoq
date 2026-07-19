import type { ReactNode } from 'react';
import { Heading, HeadingShoulder, HeadingTitle } from '@/components/ui/heading';

interface AuthPageIntroProps {
  badge: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

export function AuthPageIntro({ badge, title, description }: AuthPageIntroProps) {
  return (
    <div className="mb-8">
      <Heading size="28" hasChip rule="4" className="mb-4">
        <HeadingShoulder>{badge}</HeadingShoulder>
        <HeadingTitle level="h1">{title}</HeadingTitle>
      </Heading>
      {description ? (
        <p className="text-std-16N-170 text-solid-gray-700">{description}</p>
      ) : null}
    </div>
  );
}
