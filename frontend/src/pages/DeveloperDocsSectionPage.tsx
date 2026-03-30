import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { ApiEndpointList } from '@/components/docs/ApiEndpointList';
import { OpenAiSdkExampleList } from '@/components/docs/OpenAiSdkExampleList';
import { SeoHead } from '@/components/seo/SeoHead';
import { CheckCircle, ClipboardCheck, Braces } from 'lucide-react';

const sectionIds = ['auth', 'videos', 'chat', 'openai'] as const;
type SectionId = (typeof sectionIds)[number];

function isSectionId(value: string): value is SectionId {
  return sectionIds.includes(value as SectionId);
}


export default function DeveloperDocsSectionPage() {
  const { t } = useTranslation();
  const { section } = useParams<{ section: string }>();

  if (!section || !isSectionId(section)) {
    return <Navigate to="/docs" replace />;
  }

  const sectionTitle = t(`docs.sections.${section}.title`);
  const sectionDescription = t(`docs.sections.${section}.description`);
  const bullets = t(`docs.sections.${section}.bullets`, { returnObjects: true }) as string[];

  const isOpenAi = section === 'openai';

  return (
    <AppPageShell activePage="docs">
      <SeoHead
        title={t(`seo.docs.sections.${section}.title`)}
        description={t(`seo.docs.sections.${section}.description`)}
        path={`/docs/${section}`}
      />
      <nav className="flex items-center gap-2 text-sm font-medium text-[#6f7a6e] mb-6">
        <Link href="/docs" className="hover:text-[#00652c] transition-colors">
          ← {t('docs.backToHome')}
        </Link>
        <span className="opacity-30">/</span>
        <span className="text-[#191c19]">{sectionTitle}</span>
      </nav>

      <AppPageHeader
        title={sectionTitle}
        description={sectionDescription}
        action={(
          <span className="inline-flex items-center gap-2 rounded-full bg-[#d3ffd5] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#006d30]">
            <Braces className="w-4 h-4" />
            {t('docs.section.autoLabel')}
          </span>
        )}
      />

      <div className="space-y-6">
        <section className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#f0fdf4] flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-[#00652c]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#191c19]">{t('docs.section.checklistTitle')}</h2>
              <p className="text-sm text-[#6f7a6e]">{t('docs.section.checklistDescription')}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-4 p-4 rounded-xl bg-[#f2f4ef] hover:bg-[#ecefea] transition-colors">
                <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <span className="text-sm text-[#191c19] leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5">
          <div className="flex items-center justify-between mb-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#f0fdf4] flex items-center justify-center">
                <Braces className="w-5 h-5 text-[#00652c]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#191c19]">
                  {t(isOpenAi ? 'docs.openai.exampleTitle' : 'docs.section.autoExampleTitle')}
                </h2>
                <p className="text-sm text-[#6f7a6e]">
                  {t(isOpenAi ? 'docs.openai.exampleDescription' : 'docs.section.autoExampleDescription')}
                </p>
              </div>
            </div>
          </div>
          {isOpenAi ? <OpenAiSdkExampleList /> : <ApiEndpointList section={section} />}
        </section>
      </div>
    </AppPageShell>
  );
}
