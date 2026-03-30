import { useTranslation } from 'react-i18next';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { operatorConfig } from '@/lib/operatorConfig';

const sections = [
  'dataCollected',
  'purposeOfUse',
  'thirdPartySharing',
  'cookies',
  'dataRetention',
  'security',
  'userRights',
] as const;

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <AppPageShell isPublic>
      <SeoHead
        title={t('seo.privacy.title')}
        description={t('seo.privacy.description')}
        path="/privacy"
      />
      <AppPageHeader title={t('legal.privacy.title')} />
      <div className="space-y-8 rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
        {sections.map((section) => (
          <section key={section}>
            <h2 className="mb-3 text-base font-semibold text-[#191c19]">
              {t(`legal.privacy.sections.${section}.heading`)}
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#3f493f]">
              {t(`legal.privacy.sections.${section}.body`)}
            </p>
          </section>
        ))}
        {/* Contact section uses env-var email */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-[#191c19]">
            {t('legal.privacy.sections.contact.heading')}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-[#3f493f]">
            {t('legal.privacy.sections.contact.body')}
            {'\n'}
            <a href={`mailto:${operatorConfig.email}`} className="text-[#00652c] underline">
              {operatorConfig.email}
            </a>
          </p>
        </section>
      </div>
    </AppPageShell>
  );
}
