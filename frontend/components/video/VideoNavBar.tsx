'use client';

import { useRouter } from 'next/navigation';

interface VideoNavBarProps {
  onUploadClick: () => void;
}

export function VideoNavBar({ onUploadClick }: VideoNavBarProps) {
  const router = useRouter();

  return (
    <div className="bg-white border-b">
      <div className="px-4 py-3">
        <nav className="flex items-center gap-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← ホーム
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={onUploadClick}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ＋ 動画をアップロード
          </button>
        </nav>
      </div>
    </div>
  );
}

