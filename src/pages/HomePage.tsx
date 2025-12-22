import { useEffect, useMemo, useState } from 'react';
import { fetchCategories, fetchHomeHeroConfig, fetchShopCategoryTiles } from '../lib/api';
import { Category, CustomOrdersImage, HeroCollageImage, ShopCategoryTile } from '../lib/types';
import { ContactForm } from '../components/ContactForm';
import { Link } from 'react-router-dom';
import HomeHero from '../components/HomeHero';
import { TikTokEmbed } from '../components/TikTokEmbed';
import { WaveDivider } from '../components/WaveDivider';

function TikTokProfileCard() {
  return (
    <a
      href="https://www.tiktok.com/@thechesapeakeshell"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-between gap-3 rounded-2xl bg-black px-4 py-3 md:px-5 md:py-3.5 shadow-md hover:shadow-lg hover:opacity-95 transition"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-8 w-8 rounded-full overflow-hidden bg-slate-800">
          <img
            src="/images/logo-circle.png"
            alt="The Chesapeake Shell"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col leading-tight text-left">
          <span className="text-sm font-semibold text-white">TheChesapeakeShell</span>
          <span className="text-xs text-slate-300">@thechesapeakeshell</span>
        </div>
      </div>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
        <span className="text-white text-base">♪</span>
      </div>
    </a>
  );
}

function InstagramProfileCard() {
  return (
    <a
      href="https://www.instagram.com/thechesapeakeshell"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 md:px-5 md:py-3.5 shadow-md border border-slate-200 hover:shadow-lg hover:bg-slate-50 transition"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-8 w-8 rounded-full overflow-hidden bg-slate-200">
          <img
            src="/images/logo-circle.png"
            alt="The Chesapeake Shell"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col leading-tight text-left">
          <span className="text-sm font-semibold text-slate-900">TheChesapeakeShell</span>
          <span className="text-xs text-slate-500">@thechesapeakeshell</span>
        </div>
      </div>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90">
          <div className="relative h-3.5 w-3.5 rounded-lg border border-slate-700">
            <div className="absolute inset-[3px] rounded-full border border-slate-700" />
            <div className="absolute right-[2px] top-[2px] h-1 w-1 rounded-full bg-slate-700" />
          </div>
        </div>
      </div>
    </a>
  );
}

const fallbackCustomShellImages: CustomOrdersImage[] = [
  { imageUrl: '/images/custom-1.jpg', alt: 'Custom hand-painted oyster shell gift' },
  { imageUrl: '/images/custom-2.jpg', alt: 'Coastal oyster shell with bespoke colors' },
  { imageUrl: '/images/custom-3.jpg', alt: 'Personalized oyster shell keepsake' },
  { imageUrl: '/images/custom-4.jpg', alt: 'Custom decoupage oyster shell art' },
];

const customShellCards = [
  {
    title: 'Something Just for You',
    body: 'Have a favorite color palette, pattern, or idea? Share your inspiration and we’ll design a shell that feels like it was made just for you.',
  },
  {
    title: 'Weddings & Bridesmaids',
    body: 'Custom sets for bridesmaids, place settings, or coastal wedding favors — we can match colors, names, and dates to your day.',
  },
  {
    title: 'Names, Dates & Initials',
    body: 'Add a meaningful touch with initials, important dates, or short phrases that turn each shell into a keepsake.',
  },
  {
    title: 'Events, Clients & Host Gifts',
    body: 'Perfect for client thank-yous, host gifts, or small event favors when you want something more thoughtful than a standard gift card.',
  },
];

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tiles, setTiles] = useState<ShopCategoryTile[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingTiles, setIsLoadingTiles] = useState(true);
  const [customOrderImages, setCustomOrderImages] = useState<CustomOrdersImage[]>([]);
  const [heroImages, setHeroImages] = useState<HeroCollageImage[]>([]);
  const [heroRotationEnabled, setHeroRotationEnabled] = useState(false);

  useEffect(() => {
    loadCategories();
    loadTiles();
    loadHeroImages();
  }, []);

  const loadCategories = async () => {
    try {
      const loaded = await fetchCategories();
      setCategories(Array.isArray(loaded) ? loaded : []);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadTiles = async () => {
    try {
      const loaded = await fetchShopCategoryTiles();
      setTiles(Array.isArray(loaded) ? loaded : []);
    } catch (error) {
      console.error('Error loading category tiles:', error);
    } finally {
      setIsLoadingTiles(false);
    }
  };

  const loadHeroImages = async () => {
    try {
      const config = await fetchHomeHeroConfig();
      setCustomOrderImages((config.customOrdersImages || []).slice(0, 4));
      setHeroImages(config.heroImages || []);
      setHeroRotationEnabled(!!config.heroRotationEnabled);
    } catch (error) {
      console.error('Error loading hero images:', error);
    } finally {
      // Even on failure we want to unblock the UI and let fallbacks render.
    }
  };

  const orderedTiles = useMemo(() => {
    if (!tiles?.length) return [];
    return [...tiles]
      .map((tile, index) => ({
        ...tile,
        slotIndex: tile.slotIndex ?? index,
        __index: index,
      }))
      .sort((a, b) => (a.slotIndex ?? a.__index) - (b.slotIndex ?? b.__index));
  }, [tiles]);

  const featuredCards = orderedTiles
    .map((tile) => {
      const byId = tile.categoryId ? categories.find((c) => c.id === tile.categoryId) : undefined;
      const bySlug =
        !byId && tile.categorySlug
          ? categories.find((c) => (c.slug || '').toLowerCase() === tile.categorySlug.toLowerCase())
          : undefined;
      const category = byId || bySlug;
      if (!category) return null;
      return { slot: tile.slotIndex ?? 0, category, tile };
    })
    .filter(Boolean)
    .slice(0, 4) as { slot: number; category: Category; tile: ShopCategoryTile }[];

  const handleScrollToContact = () => {
    const el = document.getElementById('contact');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const customImagesToShow = customOrderImages.length ? customOrderImages : fallbackCustomShellImages;
  const followBg = 'var(--follow-bg, #f1f5f9)';

  // DEBUG: log divider layout/styling to diagnose seam/orientation issues. Remove after diagnosis.
  useEffect(() => {
    const ids = ['divider-hero', 'divider-custom-follow'];
    ids.forEach((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      if (!el) {
        console.log(`[DEBUG wave] ${id} not found`);
        return;
      }
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      console.log(`[DEBUG wave] ${id}`, {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        display: styles.display,
        lineHeight: styles.lineHeight,
        backgroundColor: styles.backgroundColor,
        className: el.className,
        position: styles.position,
        overflow: styles.overflow,
      });
      const svg = el.querySelector('svg');
      if (svg) {
        const svgRect = svg.getBoundingClientRect();
        const svgStyles = window.getComputedStyle(svg);
        console.log(`[DEBUG wave] ${id} svg`, {
          rect: { x: svgRect.x, y: svgRect.y, width: svgRect.width, height: svgRect.height },
          marginTop: svgStyles.marginTop,
          marginBottom: svgStyles.marginBottom,
          paddingTop: svgStyles.paddingTop,
          paddingBottom: svgStyles.paddingBottom,
          display: svgStyles.display,
          lineHeight: svgStyles.lineHeight,
          backgroundColor: svgStyles.backgroundColor,
          transform: svgStyles.transform,
        });
      }
    });

    const containers = ['section-hero-shop', 'section-custom-orders', 'divider-bridge', 'section-follow'];
    containers.forEach((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      if (!el) {
        console.log(`[DEBUG wave] ${id} not found`);
        return;
      }
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      console.log(`[DEBUG wave] container ${id}`, {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        display: styles.display,
        lineHeight: styles.lineHeight,
        backgroundColor: styles.backgroundColor,
        className: el.className,
        position: styles.position,
        overflow: styles.overflow,
      });
    });

    const roots = [
      { label: 'documentElement', el: document.documentElement },
      { label: 'body', el: document.body },
    ];
    roots.forEach(({ label, el }) => {
      const styles = window.getComputedStyle(el);
      console.log(`[DEBUG wave] root ${label}`, {
        backgroundColor: styles.backgroundColor,
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
      });
    });
  }, []);

  return (
    <div className="bg-white">
      <HomeHero heroImages={heroImages} heroRotationEnabled={heroRotationEnabled} />

      <section className="pt-0 pb-16 bg-white" data-testid="section-hero-shop">
        <WaveDivider direction="down" fill="#ffffff" className="bg-[#F6F1E7]" dataTestId="divider-hero" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-serif font-semibold text-gray-900 mb-8 text-center">
              SHOP THE COLLECTION
            </h2>

          {isLoadingCategories || isLoadingTiles ? (
            <div className="text-center py-12">
              <p className="text-gray-500 font-sans">Loading categories...</p>
            </div>
          ) : featuredCards.length ? (
            <>
              <div className="grid grid-cols-2 mobile-landscape:grid-cols-4 sm:grid-cols-3 xl:grid-cols-4 gap-6">
                {featuredCards.map(({ category, tile, slot }) => {
                  const image =
                    category.heroImageUrl ||
                    category.imageUrl ||
                    tile.imageUrl ||
                    '/images/category-placeholder.jpg';
                  return (
                    <Link
                      key={`${category.slug || category.id || slot}`}
                      to={`/shop?type=${encodeURIComponent(category.slug || tile.categorySlug || '')}`}
                      className="group relative block w-full overflow-hidden rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                    >
                      <div className="aspect-[4/5] sm:aspect-square w-full bg-white border border-gray-200">
                        {image ? (
                          <img
                            src={image}
                            alt={category.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                            Image
                          </div>
                        )}
                      </div>

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />

                      <div className="absolute inset-x-0 bottom-4 flex justify-center">
                        <span className="pointer-events-auto inline-flex items-center rounded-full bg-white px-6 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors group-hover:bg-gray-900 group-hover:text-white">
                          {`Shop ${category.name}`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="flex justify-center mt-10">
                <Link
                  to="/shop"
                  className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3 text-base font-medium text-white shadow-md transition hover:bg-gray-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                >
                  Explore the Whole Collection
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 font-sans">No categories available yet.</p>
            </div>
          )}
        </div>
      </section>

      <section className="w-full bg-white py-16 md:py-20" data-testid="section-custom-orders">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">CUSTOM ORDERS</h2>
            <p className="mt-3 text-sm md:text-base text-slate-600 max-w-2xl mx-auto">
              Have something specific in mind? From wedding parties to special dates and colors, I’m happy to create custom oyster shell pieces that feel personal to you — or to someone you love.
            </p>
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {customImagesToShow.map((img, idx) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-2xl shadow-md border border-slate-100"
                  >
                    <div className="relative aspect-[4/5] sm:aspect-square">
                      <img
                        src={img.imageUrl}
                        alt={img.alt || 'Custom hand-painted oyster shell art'}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 max-w-xl md:ml-8">
              <div className="space-y-4 w-full">
                {customShellCards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-2xl bg-white/80 border border-slate-100 shadow-md md:shadow-lg backdrop-blur-sm p-5 md:p-6 transition-transform hover:-translate-y-1 hover:shadow-xl"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
                      {card.title}
                    </h3>
                    <p className="text-xs md:text-sm text-slate-600">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-10">
            <button
              onClick={handleScrollToContact}
              className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3 text-base font-medium text-white shadow-md transition hover:bg-gray-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              Start a Custom Order
            </button>
          </div>
        </div>
      </section>

      <div
        className="w-full bg-white leading-[0] m-0 p-0 overflow-hidden -mb-px"
        data-testid="divider-bridge"
      >
        <WaveDivider
          direction="up"
          fill={followBg}
          className="block"
          dataTestId="divider-custom-follow"
        />
      </div>

      <section
        className="w-full pt-0 pb-16 md:pb-20 -mt-px"
        style={{ backgroundColor: followBg }}
        data-testid="section-follow"
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">FOLLOW ALONG</h2>
            <p className="mt-3 text-sm md:text-base text-slate-600 max-w-xl mx-auto">
              See new pieces and find out where I’ll be for craft shows and pop-ups — follow on social to stay up to date.
            </p>
          </div>

          <div className="flex flex-row items-center justify-center gap-6 mb-10 flex-wrap">
            <a
              href="https://instagram.com/thechesapeakeshell"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white border border-slate-200 shadow-md rounded-xl px-6 py-3 hover:opacity-90 transition"
            >
              <img
                src="https://files.reimage.dev/modernizedvisions/d8f83b8f2c6e/original"
                alt="Instagram Icon"
                className="w-8 h-8 rounded-full object-cover"
              />
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800">TheChesapeakeShell</span>
                <span className="text-sm text-slate-500">@thechesapeakeshell</span>
              </div>
            </a>

            <a
              href="https://www.tiktok.com/@thechesapeakeshell"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-black text-white shadow-md rounded-xl px-6 py-3 hover:opacity-90 transition"
            >
              <img
                src="https://files.reimage.dev/modernizedvisions/e5eaa1654c4f/original"
                alt="TikTok Icon"
                className="w-8 h-8 rounded-full object-cover"
              />
              <div className="flex flex-col">
                <span className="font-semibold">TheChesapeakeShell</span>
                <span className="text-sm text-gray-300">@thechesapeakeshell</span>
              </div>
            </a>
          </div>

          <div className="mb-10 flex justify-center">
            <div className="w-full max-w-4xl rounded-2xl border border-slate-200 shadow-lg bg-white overflow-hidden p-4">
              <TikTokEmbed
                videoId="7582267436842487070"
                citeUrl="https://www.tiktok.com/@thechesapeakeshell/video/7582267436842487070"
              />
            </div>
          </div>
        </div>
      </section>

      <ContactForm />
    </div>
  );
}
