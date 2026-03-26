import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

interface AuthPageFooterProps {
  bordered?: boolean;
  align?: 'left' | 'center';
}

export function AuthPageFooter({ bordered = false, align = 'center' }: AuthPageFooterProps) {
  const { t } = useTranslation();

  return (
    <div className={`${bordered ? 'mt-24 pt-8 border-t border-gray-100' : 'pt-0'} ${align === 'left' ? 'text-left' : 'text-center'}`}>
      <div className="mb-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/terms" className="text-xs text-gray-500 hover:text-[#00652c]">
          {t('legal.terms.title')}
        </Link>
        <Link href="/privacy" className="text-xs text-gray-500 hover:text-[#00652c]">
          {t('legal.privacy.title')}
        </Link>
        <Link href="/commercial-disclosure" className="text-xs text-gray-500 hover:text-[#00652c]">
          {t('legal.disclosure.title')}
        </Link>
      </div>
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
        {t('layout.authFooter', { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
