import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import {
  MenuList,
  MenuListItem,
  menuListItemVariants,
} from '@/components/ui/menu-list';
import { UtilityLink } from '@/components/ui/utility-link';
import { cn } from '@/lib/utils';

const sectionIds = ['auth', 'videos', 'chat', 'openai'] as const;

export default function DeveloperDocsPage() {
  const { t } = useTranslation();

  const sections = sectionIds.map((id) => ({
    id,
    href: `/docs/${id}`,
    title: t(`docs.sections.${id}.title`),
    description: t(`docs.sections.${id}.description`),
  }));

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
          {sections.map(({ id, href, title, description }) => (
            <MenuListItem key={id} className="border-b border-solid-gray-200">
              <Link
                href={href}
                className={cn(menuListItemVariants(), 'w-full flex-col items-start gap-1 py-4 no-underline')}
                data-type="box"
                data-size="regular"
              >
                <span className="text-std-16B-170 text-solid-gray-800">{title}</span>
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
          <HeadingTitle level="h2">API</HeadingTitle>
        </Heading>
        <ul className="space-y-3 border-t border-solid-gray-420 pt-4">
          <li>
            <UtilityLink href="/api/docs/" target="_blank" rel="noreferrer">
              OpenAPI (Swagger UI)
            </UtilityLink>
          </li>
          <li>
            <UtilityLink href="/api/redoc/" target="_blank" rel="noreferrer">
              ReDoc
            </UtilityLink>
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
