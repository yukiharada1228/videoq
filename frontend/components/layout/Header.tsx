'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';

interface HeaderProps {
  children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
  const router = useRouter();
  const { user } = useAuth({ redirectToLogin: false });

  const handleLogout = () => {
    apiClient.logout();
    router.push('/login');
  };

  return (
    <header className="border-b bg-white">
      <div className="px-4 py-3">
        <nav className="flex items-center justify-between">
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
                  グループ
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
      </div>
    </header>
  );
}

