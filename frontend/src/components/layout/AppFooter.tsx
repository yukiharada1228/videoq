import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';
import { UtilityLink } from '@/components/ui/utility-link';
import { Divider } from '@/components/ui/divider';

export function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto w-full border-t border-solid-gray-420 bg-white">
      <div className={`mx-auto w-full py-10 ${APP_CONTAINER_CLASS}`}>
        <div className="mb-6">
          <p className="text-std-18B-160 text-solid-gray-800">VideoQ</p>
          <p className="mt-2 text-std-16N-170 text-solid-gray-700">
            {t('layout.authBranding.tagline')}
          </p>
        </div>
        <Divider className="mb-6" />
        <nav className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
          <UtilityLink asChild>
            <Link href="/">{t('navigation.home')}</Link>
          </UtilityLink>
          <UtilityLink asChild>
            <Link href="/docs">{t('navigation.docs')}</Link>
          </UtilityLink>
          <UtilityLink asChild>
            <Link href="/login">{t('auth.login.submit')}</Link>
          </UtilityLink>
          <UtilityLink asChild>
            <Link href="/signup">{t('auth.signup.submit')}</Link>
          </UtilityLink>
        </nav>
        <p className="text-oln-14N-100 text-solid-gray-600">
          © {new Date().getFullYear()} VideoQ
        </p>
      </div>
    </footer>
  );
}
