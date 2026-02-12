import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/layout/PageLayout';

export default function TermsPage() {
  const { t } = useTranslation();

  const sections = [
    'serviceOverview',
    'accountRegistration',
    'prohibitedUse',
    'accountSuspension',
    'paymentAndBilling',
    'cancellation',
    'intellectualProperty',
    'limitationOfLiability',
    'serviceChanges',
    'governingLaw',
    'changes',
  ] as const;

  return (
    <PageLayout>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">
          {t('legal.terms.title')}
        </h1>
        <div className="space-y-8 rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
          {sections.map((section) => (
            <section key={section}>
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
                {t(`legal.terms.sections.${section}.heading`)}
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {t(`legal.terms.sections.${section}.body`)}
              </p>
            </section>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
