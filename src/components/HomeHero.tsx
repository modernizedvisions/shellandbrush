import { Link } from 'react-router-dom';
import type { HeroCollageImage } from '../lib/types';
import HeroSlideshow from './HeroSlideshow';

interface HomeHeroProps {
  heroImages?: HeroCollageImage[];
  heroRotationEnabled?: boolean;
}

export default function HomeHero({ heroImages = [], heroRotationEnabled = false }: HomeHeroProps) {
  const heroImage = heroImages.find((img) => !!img?.imageUrl);

  if (import.meta.env.DEV) {
    console.debug('[HomeHero] heroImages', heroImages.length, heroImages[0] ? Object.keys(heroImages[0]) : null);
  }
  // Root cause: description text was hardcoded in this component and hero images were falling back to mock data.
  // We now remove the description block and rely solely on admin-uploaded hero images.

  return (
    <section
      id="hero"
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: '#F6F1E7' }}
    >
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-slate-900">
              PIECES OF THE COAST, BRUSHED WITH COLOR.
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-white/70"
              >
                Shop New Art
              </Link>
              <Link
                to="/gallery"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-white/70"
              >
                View Gallery
              </Link>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="w-full max-w-[620px] aspect-[5/4] min-h-[320px] md:min-h-[420px] lg:min-h-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-lg flex items-center justify-center">
              {heroImages.length > 1 && heroRotationEnabled ? (
                <HeroSlideshow
                  images={heroImages.map((img, idx) => ({
                    id: img.id || `hero-${idx}`,
                    imageUrl: img.imageUrl,
                    title: img.alt,
                  }))}
                  intervalMs={7000}
                />
              ) : heroImage ? (
                <img src={heroImage.imageUrl} alt={heroImage.alt || 'Featured hero'} className="h-full w-full object-cover" />
              ) : (
                <div className="text-slate-400 text-sm">Hero image will appear here</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
