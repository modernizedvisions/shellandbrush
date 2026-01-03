import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHomeHeroConfig } from '../../lib/api';

export default function HeroSection() {
  const [imageFailed, setImageFailed] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const loadHero = async () => {
      try {
        const config = await fetchHomeHeroConfig();
        const heroUrl =
          (config?.heroImageUrl ?? '').trim() ||
          (config?.heroImages?.[0]?.imageUrl ?? '').trim() ||
          '';
        if (!cancelled) {
          setHeroImageUrl(heroUrl);
          setImageFailed(false);
        }
      } catch {
        // Keep fallback image on failure.
      }
    };
    void loadHero();
    return () => {
      cancelled = true;
    };
  }, []);

  const showImage = !!heroImageUrl && !imageFailed;

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div className="order-2 md:order-1 text-center md:text-left">
            <h1 className="text-[14px] md:text-[20px] font-sans font-semibold uppercase tracking-[0.18em] md:tracking-[0.25em] text-gray-900">
              Shell & Brush
            </h1>
            <p className="mt-5 text-[15px] md:text-base font-sans font-normal normal-case text-gray-600 max-w-xl mx-auto md:mx-0">
              Shell and Brush is the studio of Lauren, a self-taught artist drawn to coastal textures and the language of color. Each hand-painted shell explores energy, balance, and mood through playful palettes.
            </p>
            <p className="mt-4 text-[15px] md:text-base font-sans font-normal normal-case text-gray-600 max-w-xl mx-auto md:mx-0">
              Pieces are mounted on canvas and finished with care—meant to bring a little color conversation to your space. Every shell is unique, capturing the organic beauty of the coast with a modern, artistic twist.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center md:items-start gap-4">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 transition"
              >
                Shop Featured Works
              </Link>
              <Link
                to="/gallery"
                className="inline-flex items-center justify-center rounded-full border border-gray-300 px-6 py-2 text-sm font-medium text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition"
              >
                View Gallery
              </Link>
            </div>
          </div>

          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <div className="w-full max-w-sm sm:max-w-md md:max-w-2xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm">
                {showImage ? (
                  <img
                    src={heroImageUrl}
                    alt="Artist holding artwork"
                    className="absolute inset-0 h-full w-full object-cover z-0"
                    onLoad={() => console.log('[hero] loaded', heroImageUrl)}
                    onError={() => {
                      console.error('[hero] failed', heroImageUrl);
                      setImageFailed(true);
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-50 z-0" />
                )}
                {!showImage && (
                  <div className="relative z-20 flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em] text-gray-400">
                    Hero Image
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
