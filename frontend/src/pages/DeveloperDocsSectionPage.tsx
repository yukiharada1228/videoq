import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { ApiEndpointList } from '@/components/docs/ApiEndpointList';
import { OpenAiSdkExampleList } from '@/components/docs/OpenAiSdkExampleList';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  Breadcrumbs,
  BreadcrumbsLabel,
} from '@/components/ui/breadcrumbs';
import { Heading, HeadingTitle } from '@/components/ui/heading';

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
      <Breadcrumbs className="mb-6" aria-label={t('docs.backToHome')}>
        <BreadcrumbsLabel className="sr-only">{t('docs.backToHome')}</BreadcrumbsLabel>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/docs">{t('docs.home.title')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrent>{sectionTitle}</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumbs>

      <AppPageHeader
        badge={t('docs.section.autoLabel')}
        title={sectionTitle}
        description={sectionDescription}
      />

      <section className="mb-12">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('docs.section.checklistTitle')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">
          {t('docs.section.checklistDescription')}
        </p>
        <ul className="list-disc space-y-3 border-t border-solid-gray-420 py-4 pl-6 marker:text-key-900">
          {bullets.map((bullet) => (
            <li key={bullet} className="text-std-16N-170 text-solid-gray-800">
              {bullet}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">
            {t(isOpenAi ? 'docs.openai.exampleTitle' : 'docs.section.autoExampleTitle')}
          </HeadingTitle>
        </Heading>
        <p className="mb-6 text-std-16N-170 text-solid-gray-700">
          {t(
            isOpenAi
              ? 'docs.openai.exampleDescription'
              : 'docs.section.autoExampleDescription',
          )}
        </p>
        {isOpenAi ? <OpenAiSdkExampleList /> : <ApiEndpointList section={section} />}
      </section>
    </AppPageShell>
  );
}
