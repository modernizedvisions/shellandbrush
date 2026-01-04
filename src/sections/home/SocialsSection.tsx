import { useEffect, useState } from 'react';

const TIKTOK_VIDEO_ID = '7534342632328138039';
const TIKTOK_CITE_URL = 'https://www.tiktok.com/@thechesapeakeshell/video/7534342632328138039';
const TIKTOK_EMBED_URL = `https://www.tiktok.com/embed/v2/${TIKTOK_VIDEO_ID}?lang=en-US`;
const INSTAGRAM_EMBED_URL = 'https://www.instagram.com/reel/DOPL8YYAQsB/embed';
const CLICK_TO_LOAD_ON_MOBILE = true;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateMatch = () => setIsMobile(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, []);

  return isMobile;
}

type EmbedStatus = 'loading' | 'loaded' | 'failed';

interface ReliableEmbedFrameProps {
  title: string;
  src: string;
  openUrl: string;
  openLabel: string;
  minHeightMobile: string;
  minHeightDesktop: string;
  deferOnMobile?: boolean;
  deferLabel?: string;
}

function ReliableEmbedFrame({
  title,
  src,
  openUrl,
  openLabel,
  minHeightMobile,
  minHeightDesktop,
  deferOnMobile = false,
  deferLabel = 'Load embed',
}: ReliableEmbedFrameProps) {
  const isMobile = useIsMobile();
  const [activated, setActivated] = useState(!deferOnMobile);
  const [status, setStatus] = useState<EmbedStatus>('loading');
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    if (!deferOnMobile) {
      setActivated(true);
      return;
    }
    setActivated(!isMobile);
  }, [deferOnMobile, isMobile]);

  useEffect(() => {
    if (!activated) return;
    setStatus('loading');

    if (import.meta.env.DEV) {
      console.log(`[${title}] start load`, src);
    }

    const timer = window.setTimeout(() => {
      setStatus((current) => {
        if (current !== 'loading') return current;
        if (import.meta.env.DEV) {
          console.log(`[${title}] timeout -> fallback`);
        }
        return 'failed';
      });
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [activated, frameKey, src, title]);

  const handleLoad = () => {
    if (import.meta.env.DEV) {
      console.log(`[${title}] iframe loaded`);
    }
    setStatus('loaded');
  };

  const handleError = () => {
    setStatus('failed');
  };

  const showSkeleton = activated && status === 'loading';
  const showFallback = !activated || status === 'failed';

  const retryLoad = () => {
    setStatus('loading');
    setFrameKey((key) => key + 1);
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white min-h-[var(--min-h-mobile)] md:min-h-[var(--min-h-desktop)]"
      style={{
        ['--min-h-mobile' as never]: minHeightMobile,
        ['--min-h-desktop' as never]: minHeightDesktop,
      }}
    >
      {showSkeleton && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            Loading {title}...
          </div>
        </div>
      )}

      {!showFallback && (
        <iframe
          key={frameKey}
          title={title}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {showFallback && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
          <p className="text-sm text-gray-600">
            {activated
              ? `${title} didn't load (often blocked by ad blockers or privacy settings).`
              : `Tap to load ${title}.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!activated && (
              <button
                type="button"
                onClick={() => {
                  setActivated(true);
                  retryLoad();
                }}
                className="rounded-full border border-gray-300 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-700 hover:border-gray-400"
              >
                {deferLabel}
              </button>
            )}
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-gray-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-900 hover:bg-gray-900 hover:text-white"
            >
              {openLabel}
            </a>
            {activated && status === 'failed' && (
              <button
                type="button"
                onClick={retryLoad}
                className="rounded-full border border-gray-300 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-700 hover:border-gray-400"
              >
                Try loading again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SocialsSection() {
  return (
    <section className="py-16 md:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
            SOCIALS
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <a
              href="https://www.tiktok.com/@thechesapeakeshell"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700"
            >
              Follow on TikTok ?
            </a>
            <ReliableEmbedFrame
              title="TikTok"
              src={TIKTOK_EMBED_URL}
              openUrl={TIKTOK_CITE_URL}
              openLabel="Open on TikTok"
              minHeightMobile="520px"
              minHeightDesktop="640px"
              deferOnMobile={CLICK_TO_LOAD_ON_MOBILE}
              deferLabel="Load TikTok"
            />
          </div>

          <div className="space-y-4">
            <a
              href="https://www.instagram.com/thechesapeakeshell"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700"
            >
              Follow on Instagram ?
            </a>
            <ReliableEmbedFrame
              title="Instagram"
              src={INSTAGRAM_EMBED_URL}
              openUrl="https://www.instagram.com/thechesapeakeshell"
              openLabel="Open on Instagram"
              minHeightMobile="520px"
              minHeightDesktop="640px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
