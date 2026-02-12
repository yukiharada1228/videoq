import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-white py-8">
      <div className="container mx-auto px-4 text-center text-gray-600">
        <nav className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/legal/terms" className="hover:text-gray-900 hover:underline">
            {t('layout.footer.terms')}
          </Link>
          <Link to="/legal/privacy" className="hover:text-gray-900 hover:underline">
            {t('layout.footer.privacy')}
          </Link>
          <Link to="/legal/commercial-disclosure" className="hover:text-gray-900 hover:underline">
            {t('layout.footer.disclosure')}
          </Link>
        </nav>
        <p>{t('layout.footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}

