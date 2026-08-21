import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { getApiOrigin } from '@/lib/api';
import { useOpenApiSchema } from '@/hooks/useOpenApiSchema';
import { countEndpointsBySection, docsSectionIds } from '@/lib/docs/sections';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import {
  MenuList,
  MenuListItem,
  menuListItemVariants,
} from '@/components/ui/menu-list';
import { UtilityLink } from '@/components/ui/utility-link';
import { cn } from '@/lib/digital-agency/cn';

export default function DeveloperDocsPage() {
  const { t } = useTranslation();
  const { schema } = useOpenApiSchema();
  const endpointCounts = countEndpointsBySection(schema);
  const apiOrigin = getApiOrigin();

  const sections = docsSectionIds.map((id) => ({
    id,
    href: `/docs/${id}`,
    title: t(`docs.sections.${id}.title`),
    description: t(`docs.sections.${id}.description`),
    endpointCount: endpointCounts[id],
  }));

  const references = [
    {
      key: 'reference',
      href: `${apiOrigin}/api/docs`,
      label: t('docs.home.references.reference'),
      hint: '/api/docs',
    },
    {
      key: 'openapi',
      href: `${apiOrigin}/api/openapi.json`,
      label: t('docs.home.references.openapi'),
      hint: '/api/openapi.json · /api/schema',
    },
    {
      key: 'redoc',
      href: `${apiOrigin}/api/redoc`,
      label: t('docs.home.references.redoc'),
      hint: '/api/redoc',
    },
    {
      key: 'health',
      href: `${apiOrigin}/health`,
      label: t('docs.home.references.health'),
      hint: '/health · /ready',
    },
  ];

  return (
    <AppPageShell activePage="docs">
      <AppPageHeader
        badge={t('docs.home.title')}
        title={t('docs.home.title')}
        description={t('docs.home.subtitle')}
      />

      <section className="mb-12">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('docs.home.quickLinksTitle')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">
          {t('docs.home.quickLinksDescription')}
        </p>
        <MenuList className="border-t border-solid-gray-420">
          {sections.map(({ id, href, title, description, endpointCount }) => (
            <MenuListItem key={id} className="border-b border-solid-gray-200">
              <Link
                href={href}
                className={cn(menuListItemVariants(), 'w-full flex-col items-start gap-1 py-4 no-underline')}
                data-type="box"
                data-size="regular"
              >
                <span className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-std-16B-170 text-solid-gray-800">{title}</span>
                  {endpointCount > 0 && (
                    <span className="font-mono text-dns-14N-130 font-normal text-solid-gray-600">
                      {t('docs.home.endpointCount', { count: endpointCount })}
                    </span>
                  )}
                </span>
                <span className="text-std-16N-170 font-normal text-solid-gray-700">
                  {description}
                </span>
              </Link>
            </MenuListItem>
          ))}
        </MenuList>
      </section>

      <section className="mb-8">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('docs.home.referencesTitle')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">
          {t('docs.home.referencesDescription')}
        </p>
        <ul className="space-y-3 border-t border-solid-gray-420 pt-4">
          {references.map(({ key, href, label, hint }) => (
            <li key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <UtilityLink href={href} target="_blank" rel="noreferrer">
                {label}
              </UtilityLink>
              <span className="font-mono text-dns-14N-130 text-solid-gray-600">{hint}</span>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-std-16N-170 text-solid-gray-800">
              {t('docs.home.references.mcp')}
            </span>
            <span className="font-mono text-dns-14N-130 text-solid-gray-600">
              {`${apiOrigin}/api/mcp`}
            </span>
          </li>
          <li>
            <UtilityLink asChild>
              <Link href="/settings">{t('docs.home.createApiKey')}</Link>
            </UtilityLink>
          </li>
        </ul>
      </section>
    </AppPageShell>
  );
}
