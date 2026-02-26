import { useState, useRef, useEffect, useCallback } from 'react';
import { type PopularScene } from '@/lib/api';

interface UseShortsScrollOptions {
  scenes: PopularScene[];
  showPlayOverlay: boolean;
  onIndexChange?: (newIndex: number) => void;
}

interface UseShortsScrollReturn {
  currentIndex: number;
  videoOffset: number;
  isScrolling: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  slideRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  currentIndexRef: React.MutableRefObject<number>;
}

export function useShortsScroll({ scenes, showPlayOverlay, onIndexChange }: UseShortsScrollOptions): UseShortsScrollReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef(new Map<number, HTMLDivElement>());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoOffset, setVideoOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const currentIndexRef = useRef(currentIndex);

  // Keep ref in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleIndexChange = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    setVideoOffset(0);
    onIndexChange?.(newIndex);
  }, [onIndexChange]);

  // IntersectionObserver for scroll-based slide detection
  useEffect(() => {
    if (scenes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const newIndex = Number((entry.target as HTMLElement).dataset.index);
            if (newIndex !== currentIndexRef.current) {
              handleIndexChange(newIndex);
            }
          }
        }
      },
      { threshold: 0.6, root: containerRef.current }
    );
    requestAnimationFrame(() => {
      if (slideRefs.current && slideRefs.current.size > 0) {
        slideRefs.current.forEach((s) => { if (s) observer.observe(s); });
      }
    });
    return () => observer.disconnect();
  }, [scenes.length, handleIndexChange]);

  // Track scroll position for smooth video following
  useEffect(() => {
    const container = containerRef.current;
    if (!container || showPlayOverlay) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      setIsScrolling(true);
      clearTimeout(scrollTimeout);

      const scrollTop = container.scrollTop;
      const slideHeight = container.clientHeight;
      const currentSlideTop = currentIndexRef.current * slideHeight;

      const offset = scrollTop - currentSlideTop;
      setVideoOffset(-offset);

      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
        setVideoOffset(0);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [showPlayOverlay]);

  return {
    currentIndex,
    videoOffset,
    isScrolling,
    containerRef,
    slideRefs,
    currentIndexRef,
  };
}
