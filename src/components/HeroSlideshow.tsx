import { useEffect, useMemo, useState } from 'react';
import type { GalleryImage } from '../lib/types';

interface HeroSlideshowProps {
  images: GalleryImage[];
  intervalMs?: number;
}

export function HeroSlideshow({ images, intervalMs = 3000 }: HeroSlideshowProps) {
  const slides = useMemo(
    () => (images || []).filter((img) => img?.imageUrl).map((img) => ({ ...img, hidden: false })),
    [images]
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(false);

  const hasMultiple = slides.length > 1;

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setIsDocumentHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!hasMultiple) return;
    setIndex((current) => (current >= slides.length ? 0 : current));
  }, [hasMultiple, slides.length]);

  useEffect(() => {
    if (!hasMultiple || paused || prefersReducedMotion || isDocumentHidden) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [hasMultiple, paused, prefersReducedMotion, isDocumentHidden, intervalMs, slides.length]);

  useEffect(() => {
    if (!hasMultiple) return;
    const nextIndex = (index + 1) % slides.length;
    const next = slides[nextIndex];
    if (next?.imageUrl) {
      const img = new Image();
      img.src = next.imageUrl;
    }
  }, [index, slides, hasMultiple]);

  if (slides.length === 0) {
    return (
      <div className="w-full max-w-[620px] aspect-[5/4] min-h-[320px] md:min-h-[420px] lg:min-h-[460px] rounded-2xl border border-slate-200 bg-white/80 shadow-lg flex items-center justify-center text-slate-400 text-sm">
        Gallery images will appear here
      </div>
    );
  }

  const trackStyle: React.CSSProperties = {
    width: `${slides.length * 100}%`,
    transform: `translateX(-${index * 100}%)`,
    transition: prefersReducedMotion ? 'none' : 'transform 600ms ease-in-out',
  };

  return (
    <div
      className="w-full max-w-[620px] aspect-[5/4] min-h-[320px] md:min-h-[420px] lg:min-h-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="h-full w-full overflow-hidden">
        <div className="flex h-full" style={trackStyle}>
          {slides.map((slide, idx) => (
            <div key={slide.id || idx} className="h-full w-full flex-shrink-0">
              <img
                src={slide.imageUrl}
                alt={slide.title || 'Gallery image'}
                className="h-full w-full object-cover"
                loading={idx === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HeroSlideshow;
