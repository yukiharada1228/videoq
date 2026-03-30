import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

export function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="w-full border-t border-stone-200 bg-[#f8faf5]">
      <div className={`flex flex-col md:flex-row justify-between items-center py-8 gap-4 mx-auto w-full ${APP_CONTAINER_CLASS}`}>
        <div
          className="flex items-center gap-2 text-lg font-bold text-stone-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <GraduationCap className="text-[#00652c] w-5 h-5" />
          <span>VideoQ</span>
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
          <Link to="/use-cases/education" className="text-xs text-stone-500 hover:text-stone-700">
            {t('useCases.education.footer.link')}
          </Link>
          <Link to="/terms" className="text-xs text-stone-500 hover:text-stone-700">
            {t('legal.terms.title')}
          </Link>
          <Link to="/privacy" className="text-xs text-stone-500 hover:text-stone-700">
            {t('legal.privacy.title')}
          </Link>
          <Link to="/commercial-disclosure" className="text-xs text-stone-500 hover:text-stone-700">
            {t('legal.disclosure.title')}
          </Link>
        </div>
        <p className="text-xs uppercase tracking-widest font-semibold text-stone-500">
          © {new Date().getFullYear()} VideoQ. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
