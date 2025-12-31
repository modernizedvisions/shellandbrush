import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHomeHeroConfig } from '../../lib/api';

const HERO_IMAGE_SRC = '/images/hero-bg.jpg';

export default function HeroSection() {
  const [imageFailed, setImageFailed] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState<string>(HERO_IMAGE_SRC);

  useEffect(() => {
    let cancelled = false;
    const loadHero = async () => {
      try {
        const config = await fetchHomeHeroConfig();
        const first = Array.isArray(config?.heroImages) ? config.heroImages.find((img: any) => img?.imageUrl) : null;
        if (!cancelled && first?.imageUrl) {
          setHeroImageUrl(first.imageUrl);
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

  const handleScrollToFeatured = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = document.getElementById('featured');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
              <a
                href="#featured"
                onClick={handleScrollToFeatured}
                className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 transition"
              >
                Shop Featured Works
              </a>
              <Link
                to="/shop"
                className="inline-flex items-center justify-center rounded-full border border-gray-300 px-6 py-2 text-sm font-medium text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition"
              >
                View Gallery
              </Link>
            </div>
          </div>

          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <div className="w-full max-w-sm sm:max-w-md md:max-w-lg">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm">
                {imageFailed ? (
                  <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em] text-gray-400">
                    Hero Image
                  </div>
                ) : (
                  <img
                    src={heroImageUrl}
                    alt="Artist holding artwork"
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
