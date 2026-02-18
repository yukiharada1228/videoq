'use client';

import { Link, useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const navigate = useI18nNavigate();
  const { user } = useAuth({ redirectToLogin: false });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      navigate('/login');
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="border-b bg-white">
      <div className="px-4 py-3">
        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              {t('navigation.brand')}
            </Link>
            {user && (
              <>
                <button
                  onClick={() => navigate('/videos')}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('navigation.videos')}
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => navigate('/videos/groups')}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('navigation.videoGroups')}
                </button>
              </>
            )}
            {children}
          </div>

          {user && (
            <div className="flex items-center gap-6">
              <span className="text-gray-600">
                {t('navigation.welcome', { username: user.username })}
              </span>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                {t('navigation.logout')}
              </button>
            </div>
          )}
        </nav>

        {/* Mobile navigation */}
        <nav className="md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-gray-900">
              {t('navigation.brand')}
            </Link>
            {user && (
              <button
                onClick={toggleMobileMenu}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                aria-label={t('common.actions.openMenu')}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isMobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
            )}
          </div>

          {/* Mobile menu */}
          {isMobileMenuOpen && user && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              <div className="px-2 py-2 text-sm text-gray-600 border-b border-gray-100">
                {t('navigation.welcome', { username: user.username })}
              </div>
              <button
                onClick={() => {
                  navigate('/videos');
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                {t('navigation.videos')}
              </button>
              <button
                onClick={() => {
                  navigate('/videos/groups');
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                {t('navigation.videoGroups')}
              </button>
              <button
                onClick={() => {
                  handleLogout();
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                {t('navigation.logout')}
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

