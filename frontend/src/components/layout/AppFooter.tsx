import { GraduationCap } from 'lucide-react';
import { APP_CONTAINER_CLASS } from '@/components/layout/layoutTokens';

export function AppFooter() {
  return (
    <footer className="w-full border-t border-stone-200 bg-[#f8faf5]">
      <div className={`flex flex-col md:flex-row justify-between items-center py-8 gap-4 mx-auto w-full ${APP_CONTAINER_CLASS}`}>
        <div
          className="flex items-center gap-2 text-lg font-bold text-stone-900"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          <GraduationCap className="text-[#00652c] w-5 h-5" />
          <span>VideoQ</span>
        </div>
        <p className="text-xs uppercase tracking-widest font-semibold text-stone-500">
          © 2026 VideoQ. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
