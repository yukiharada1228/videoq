import { PageLayout } from '@/components/layout/PageLayout';
import { Link } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

const sectionIds = ['auth', 'videos', 'chat'] as const;

export default function DeveloperDocsPage() {
  const { t } = useTranslation();

  const sections = sectionIds.map((id) => ({
    id,
    href: `/docs/${id}`,
    title: t(`docs.sections.${id}.title`),
    description: t(`docs.sections.${id}.description`),
  }));

  return (
    <PageLayout fullWidth>
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-8 text-white">
          <h1 className="text-3xl font-bold md:text-4xl">{t('docs.home.title')}</h1>
          <p className="mt-3 text-sm text-slate-200 md:text-base">{t('docs.home.subtitle')}</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t('docs.home.quickLinksTitle')}</CardTitle>
            <CardDescription>{t('docs.home.quickLinksDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <a
              href="/api/docs/"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              OpenAPI (Swagger UI)
            </a>
            <a
              href="/api/redoc/"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              ReDoc
            </a>
            <Link
              href="/settings"
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('docs.home.createApiKey')}
            </Link>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Link key={section.id} href={section.href}>
              <Card className="h-full border-2 border-slate-200 transition hover:border-slate-300 hover:shadow-md">
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
