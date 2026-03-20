import { GraduationCap } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

export type ActivePage = 'home' | 'videos' | 'groups' | 'settings' | 'docs';

interface AppNavProps {
  activePage?: ActivePage;
}

export function AppNav({ activePage }: AppNavProps) {
  const { t } = useTranslation();

  const navLinks: { href: string; label: string; key: ActivePage }[] = [
    { href: '/', label: t('navigation.home'), key: 'home' },
    { href: '/videos', label: t('navigation.videosNav'), key: 'videos' },
    { href: '/videos/groups', label: t('navigation.groupsNav'), key: 'groups' },
    { href: '/settings', label: t('navigation.settings'), key: 'settings' },
    { href: '/docs', label: t('navigation.docs'), key: 'docs' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-stone-200/60">
      <div className={`flex justify-between items-center py-4 mx-auto w-full ${APP_CONTAINER_CLASS}`}>
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-stone-900 shrink-0"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <GraduationCap className="text-[#00652c] w-6 h-6" />
          <span>VideoQ</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(({ href, label, key }) => (
            <Link
              key={key}
              href={href}
              className={`text-sm font-semibold transition-colors pb-0.5 ${
                activePage === key
                  ? 'text-[#00652c] border-b-2 border-[#00652c]'
                  : 'text-stone-600 hover:text-[#00652c]'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="w-[120px] shrink-0" />
      </div>
    </nav>
  );
}
