'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';
import { useState } from 'react';

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const router = useRouter();
  const { user } = useAuth({ redirectToLogin: false });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    apiClient.logout();
    router.push('/login');
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
        {/* デスクトップナビゲーション */}
        <nav className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Ask Video
            </Link>
            {user && (
              <>
                <button
                  onClick={() => router.push('/videos')}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  動画一覧
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => router.push('/videos/groups')}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  チャットグループ
              </button>
              </>
            )}
            {children}
          </div>

          {user && (
            <div className="flex items-center gap-6">
              <span className="text-gray-600">ようこそ、{user.username}さん</span>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => router.push('/settings')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                設定
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </nav>

        {/* モバイルナビゲーション */}
        <nav className="md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Ask Video
            </Link>
            {user && (
              <button
                onClick={toggleMobileMenu}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="メニューを開く"
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

          {/* モバイルメニュー */}
          {isMobileMenuOpen && user && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              <div className="px-2 py-2 text-sm text-gray-600 border-b border-gray-100">
                ようこそ、{user.username}さん
              </div>
              <button
                onClick={() => {
                  router.push('/videos');
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                動画一覧
              </button>
              <button
                onClick={() => {
                  router.push('/videos/groups');
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                チャットグループ
              </button>
              <button
                onClick={() => {
                  router.push('/settings');
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                設定
              </button>
              <button
                onClick={() => {
                  handleLogout();
                  closeMobileMenu();
                }}
                className="block w-full text-left px-2 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

