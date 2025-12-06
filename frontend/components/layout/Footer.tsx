import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations();
  return (
    <footer className="border-t bg-white py-8">
      <div className="container mx-auto px-4 text-center text-gray-600">
        <p>{t('layout.footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}

