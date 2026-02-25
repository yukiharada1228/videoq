import { useEffect, useState } from 'react';

type MobileTab = 'videos' | 'player' | 'chat';

interface UseMobileTabReturn {
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;
  isMobile: boolean;
}

export function useMobileTab(defaultTab: MobileTab = 'player'): UseMobileTabReturn {
  const [mobileTab, setMobileTab] = useState<MobileTab>(defaultTab);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return { mobileTab, setMobileTab, isMobile };
}
