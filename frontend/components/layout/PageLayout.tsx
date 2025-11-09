import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface PageLayoutProps {
  children: ReactNode;
  headerContent?: ReactNode;
  centered?: boolean;
  fullWidth?: boolean;
}

export function PageLayout({ children, headerContent, centered = false, fullWidth = false }: PageLayoutProps) {
  const mainClasses = centered 
    ? "flex flex-1 items-center justify-center px-4"
    : fullWidth
      ? "flex-1 w-full px-6 py-6"
      : "container mx-auto flex-1 px-4 py-12";

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header>{headerContent}</Header>
      <main className={mainClasses}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

