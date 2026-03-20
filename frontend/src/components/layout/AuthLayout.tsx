import type { ReactNode } from 'react';
import { PlayCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      {/* Left Panel: Branding */}
      <section className="relative hidden md:flex md:w-1/2 bg-[#15803d] p-12 flex-col items-center justify-center overflow-hidden">
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl">
            <PlayCircle className="text-white w-16 h-16" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1
              className="font-extrabold text-4xl text-white tracking-tight mb-2"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              VideoQ
            </h1>
            <p className="text-white/70 text-sm font-medium tracking-wide">
              {t('layout.authBranding.tagline')}
            </p>
          </div>
        </div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </section>

      {/* Right Panel */}
      <section className="flex-1 bg-white flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-[440px] flex flex-col">
          {/* Mobile Logo */}
          <div className="md:hidden flex items-center gap-2 mb-8 justify-center">
            <PlayCircle className="text-[#00652c] w-8 h-8" strokeWidth={1.5} />
            <span
              className="font-extrabold text-2xl text-[#00652c] tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              VideoQ
            </span>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
