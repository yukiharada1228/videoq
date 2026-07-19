import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AuthPageFooter } from '@/components/layout/AuthPageFooter';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-solid-gray-420 bg-white">
        <div className={`mx-auto flex w-full items-center justify-between gap-4 py-4 ${APP_CONTAINER_CLASS}`}>
          <Link
            href="/"
            className="text-std-20B-150 text-solid-gray-800"
          >
            VideoQ
          </Link>
          <p className="hidden text-std-16N-170 text-solid-gray-600 sm:block">
            {t('layout.authBranding.tagline')}
          </p>
        </div>
      </header>

      <main className={`mx-auto w-full flex-1 py-10 sm:py-14 ${APP_CONTAINER_CLASS}`}>
        <div className="mx-auto w-full max-w-[32rem]">
          {children}
        </div>
      </main>

      <div className={`mx-auto w-full pb-10 ${APP_CONTAINER_CLASS}`}>
        <AuthPageFooter />
      </div>
    </div>
  );
}
