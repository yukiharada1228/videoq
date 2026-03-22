import { useState } from 'react';
import { GraduationCap, LogOut, Menu, X } from 'lucide-react';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

export type ActivePage = 'home' | 'videos' | 'groups' | 'docs' | 'settings';

interface AppNavProps {
  activePage?: ActivePage;
}

export function AppNav({ activePage }: AppNavProps) {
  const { t } = useTranslation();
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: async () => await apiClient.logout(),
    onSettled: async () => {
      queryClient.clear();
    },
  });

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      navigate('/login');
    }
  };

  const navLinks: { href: string; label: string; key: ActivePage }[] = [
    { href: '/', label: t('navigation.home'), key: 'home' },
    { href: '/videos', label: t('navigation.videosNav'), key: 'videos' },
    { href: '/videos/groups', label: t('navigation.groupsNav'), key: 'groups' },
    { href: '/docs', label: t('navigation.docs'), key: 'docs' },
    { href: '/settings', label: t('navigation.settings'), key: 'settings' },
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

        <div className="flex items-center gap-1 shrink-0">
          {/* Desktop logout */}
          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-red-600 transition-colors px-2"
            aria-label={t('navigation.logout')}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">{t('navigation.logout')}</span>
          </button>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-stone-600 hover:text-[#00652c] transition-colors rounded-lg hover:bg-[#f2f4ef]"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-stone-200/60 bg-white/95 backdrop-blur-xl">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navLinks.map(({ href, label, key }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                  activePage === key
                    ? 'text-[#00652c] bg-[#00652c]/8'
                    : 'text-stone-600 hover:text-[#00652c] hover:bg-[#f2f4ef]'
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-stone-200/60 mt-2 pt-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  void handleLogout();
                }}
                className="w-full text-left py-2.5 px-3 rounded-lg text-sm font-semibold text-stone-600 hover:text-red-600 hover:bg-red-50/50 transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                {t('navigation.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
