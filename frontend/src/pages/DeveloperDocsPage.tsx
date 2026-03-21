import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Lock, Video, MessageCircle, Sparkles, ArrowRight, FileCode2, KeyRound } from 'lucide-react';

const sectionIds = ['auth', 'videos', 'chat', 'openai'] as const;

const SECTION_ICONS = {
  auth: Lock,
  videos: Video,
  chat: MessageCircle,
  openai: Sparkles,
};

export default function DeveloperDocsPage() {
  const { t } = useTranslation();

  const sections = sectionIds.map((id) => ({
    id,
    href: `/docs/${id}`,
    title: t(`docs.sections.${id}.title`),
    description: t(`docs.sections.${id}.description`),
    Icon: SECTION_ICONS[id],
  }));

  return (
    <AppPageShell activePage="docs">
      <AppPageHeader
        title={t('docs.home.title')}
        description={t('docs.home.subtitle')}
      />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <a
          href="/api/docs/"
          target="_blank"
          rel="noreferrer"
          className="group rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(28,25,23,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)]"
        >
          <div className="w-11 h-11 rounded-xl bg-[#e5f1ff] flex items-center justify-center mb-4">
            <FileCode2 className="w-5 h-5 text-[#005b8c]" />
          </div>
          <h2 className="text-base font-bold text-[#191c19] mb-2">OpenAPI (Swagger UI)</h2>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#005b8c] group-hover:gap-2 transition-all">
            Open
            <ArrowRight className="w-4 h-4" />
          </span>
        </a>
        <a
          href="/api/redoc/"
          target="_blank"
          rel="noreferrer"
          className="group rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(28,25,23,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)]"
        >
          <div className="w-11 h-11 rounded-xl bg-[#fff0e3] flex items-center justify-center mb-4">
            <FileCode2 className="w-5 h-5 text-[#904d00]" />
          </div>
          <h2 className="text-base font-bold text-[#191c19] mb-2">ReDoc</h2>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#904d00] group-hover:gap-2 transition-all">
            Open
            <ArrowRight className="w-4 h-4" />
          </span>
        </a>
        <Link
          href="/settings"
          className="group rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(28,25,23,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)]"
        >
          <div className="w-11 h-11 rounded-xl bg-[#f0fdf4] flex items-center justify-center mb-4">
            <KeyRound className="w-5 h-5 text-[#00652c]" />
          </div>
          <h2 className="text-base font-bold text-[#191c19] mb-2">{t('docs.home.createApiKey')}</h2>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#00652c] group-hover:gap-2 transition-all">
            {t('docs.home.readMore')}
            <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </section>

      <section className="mb-4">
        <div className="mb-5">
          <h2 className="text-base font-bold text-[#191c19] mb-1">{t('docs.home.quickLinksTitle')}</h2>
          <p className="text-sm text-[#6f7a6e]">{t('docs.home.quickLinksDescription')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map(({ id, href, title, description, Icon }) => (
            <Link key={id} href={href} className="group flex flex-col bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)] transition-all duration-200 hover:-translate-y-0.5 overflow-hidden">
              <div className="p-5 flex-1">
                <div className="w-10 h-10 rounded-xl bg-[#f0fdf4] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-[#00652c]" />
                </div>
                <h3 className="text-base font-bold text-[#191c19] mb-2">{title}</h3>
                <p className="text-sm text-[#6f7a6e] leading-relaxed mb-4">{description}</p>
              </div>
              <div className="px-5 pb-5">
                <span className="inline-flex items-center gap-1 text-sm font-bold text-[#00652c] group-hover:gap-2 transition-all">
                  {t('docs.home.readMore')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppPageShell>
  );
}
