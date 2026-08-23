import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import {
  MenuList,
  MenuListItem,
  menuListItemVariants,
} from '@/components/ui/menu-list';
import { LandingTryDemo } from '@/components/landing/LandingTryDemo';
import { cn } from '@/lib/digital-agency/cn';

const FEATURE_KEYS = ['ask', 'transcribe', 'share', 'analytics'] as const;
const STEP_KEYS = ['upload', 'index', 'ask'] as const;
const USE_KEYS = ['lectures', 'flipped'] as const;

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <AppPageShell activePage="home" isPublic>
      <AppPageHeader
        badge={t('landing.badge')}
        title={t('landing.title')}
        description={t('landing.lead')}
        action={(
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-3">
              <Button variant="solid" size="lg" asChild>
                <Link href="/signup">{t('landing.start')}</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">{t('landing.login')}</Link>
              </Button>
            </div>
            <p className="text-std-16N-170 text-solid-gray-700">{t('landing.startNote')}</p>
          </div>
        )}
      />

      <LandingTryDemo />

      <section className="mb-12">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('landing.features.title')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.features.intro')}</p>
        <MenuList className="border-t border-solid-gray-420">
          {FEATURE_KEYS.map((key) => (
            <MenuListItem key={key} className="border-b border-solid-gray-200">
              <div className="flex w-full flex-col items-start gap-1 py-4">
                <span className="text-std-16B-170 text-solid-gray-800">
                  {t(`landing.features.${key}.title`)}
                </span>
                <span className="text-std-16N-170 text-solid-gray-700">
                  {t(`landing.features.${key}.body`)}
                </span>
              </div>
            </MenuListItem>
          ))}
        </MenuList>
      </section>

      <section className="mb-12">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('landing.steps.title')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.steps.intro')}</p>
        <ol className="border-t border-solid-gray-420">
          {STEP_KEYS.map((key, index) => (
            <li
              key={key}
              className="flex flex-col gap-1 border-b border-solid-gray-200 py-4 sm:flex-row sm:gap-6"
            >
              <span className="text-std-16B-170 text-solid-gray-800 sm:w-40">
                {index + 1}. {t(`landing.steps.${key}.title`)}
              </span>
              <span className="text-std-16N-170 text-solid-gray-700">
                {t(`landing.steps.${key}.body`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('landing.uses.title')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.uses.intro')}</p>
        <MenuList className="border-t border-solid-gray-420">
          {USE_KEYS.map((key) => (
            <MenuListItem key={key} className="border-b border-solid-gray-200">
              <div className="flex w-full flex-col items-start gap-1 py-4">
                <span className="text-std-16B-170 text-solid-gray-800">
                  {t(`landing.uses.${key}.title`)}
                </span>
                <span className="text-std-16N-170 text-solid-gray-700">
                  {t(`landing.uses.${key}.body`)}
                </span>
              </div>
            </MenuListItem>
          ))}
        </MenuList>
      </section>

      <section className="mb-8">
        <Heading size="18" hasChip className="mb-4">
          <HeadingTitle level="h2">{t('landing.next.title')}</HeadingTitle>
        </Heading>
        <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.next.intro')}</p>
        <ul className="border-t border-solid-gray-420">
          <li className="border-b border-solid-gray-200">
            <Link
              href="/pricing"
              className={cn(menuListItemVariants(), 'w-full justify-between gap-4 py-4 no-underline')}
              data-type="box"
              data-size="regular"
            >
              <span>
                <span className="block text-std-16B-170 text-solid-gray-800">
                  {t('landing.next.pricing.title')}
                </span>
                <span className="mt-1 block text-std-16N-170 text-solid-gray-700">
                  {t('landing.next.pricing.body')}
                </span>
              </span>
            </Link>
          </li>
          <li className="border-b border-solid-gray-200">
            <Link
              href="/docs"
              className={cn(menuListItemVariants(), 'w-full justify-between gap-4 py-4 no-underline')}
              data-type="box"
              data-size="regular"
            >
              <span>
                <span className="block text-std-16B-170 text-solid-gray-800">
                  {t('landing.next.docs.title')}
                </span>
                <span className="mt-1 block text-std-16N-170 text-solid-gray-700">
                  {t('landing.next.docs.body')}
                </span>
              </span>
            </Link>
          </li>
        </ul>
        <div className="mt-6 flex flex-col items-start gap-2">
          <Button variant="solid" size="lg" asChild>
            <Link href="/signup">{t('landing.tryOwn')}</Link>
          </Button>
          <p className="text-std-16N-170 text-solid-gray-700">{t('landing.startNote')}</p>
        </div>
      </section>
    </AppPageShell>
  );
}
