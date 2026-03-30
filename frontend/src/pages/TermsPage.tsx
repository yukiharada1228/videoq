import { useTranslation } from 'react-i18next';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { operatorConfig } from '@/lib/operatorConfig';

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

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <AppPageShell isPublic>
      <SeoHead
        title={t('seo.terms.title')}
        description={t('seo.terms.description')}
        path="/terms"
      />
      <AppPageHeader title={t('legal.terms.title')} />
      <div className="space-y-8 rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
        {sections.map((section) => (
          <section key={section}>
            <h2 className="mb-3 text-base font-semibold text-[#191c19]">
              {t(`legal.terms.sections.${section}.heading`)}
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#3f493f]">
              {t(`legal.terms.sections.${section}.body`, { operatorName: operatorConfig.name })}
            </p>
          </section>
        ))}
      </div>
    </AppPageShell>
  );
}
