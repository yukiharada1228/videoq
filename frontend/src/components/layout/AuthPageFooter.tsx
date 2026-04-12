import { useTranslation } from 'react-i18next';

interface AuthPageFooterProps {
  bordered?: boolean;
  align?: 'left' | 'center';
}

export function AuthPageFooter({ bordered = false, align = 'center' }: AuthPageFooterProps) {
  const { t } = useTranslation();

  return (
    <div className={`${bordered ? 'mt-24 pt-8 border-t border-gray-100' : 'pt-0'} ${align === 'left' ? 'text-left' : 'text-center'}`}>
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
        {t('layout.authFooter', { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
