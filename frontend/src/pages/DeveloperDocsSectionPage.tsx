import { Navigate, useParams } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { Link } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiEndpointList } from '@/components/docs/ApiEndpointList';
import { useTranslation } from 'react-i18next';

const sectionIds = ['auth', 'videos', 'chat'] as const;
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

  return (
    <PageLayout fullWidth>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <Link href="/docs" className="underline-offset-2 hover:underline">
            {t('docs.backToHome')}
          </Link>
          <span>/</span>
          <span>{sectionTitle}</span>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-8 text-white">
          <h1 className="text-3xl font-bold md:text-4xl">{sectionTitle}</h1>
          <p className="mt-3 text-sm text-slate-200 md:text-base">{sectionDescription}</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t('docs.section.checklistTitle')}</CardTitle>
            <CardDescription>{t('docs.section.checklistDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('docs.section.autoExampleTitle')}</CardTitle>
            <CardDescription>{t('docs.section.autoExampleDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ApiEndpointList section={section} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
