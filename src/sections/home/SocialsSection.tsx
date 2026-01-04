import { useEffect, useState } from 'react';

const TIKTOK_VIDEO_ID = '7534342632328138039';
const TIKTOK_CITE_URL = 'https://www.tiktok.com/@thechesapeakeshell/video/7534342632328138039';
const TIKTOK_EMBED_URL = `https://www.tiktok.com/embed/v2/${TIKTOK_VIDEO_ID}?lang=en-US`;
const INSTAGRAM_EMBED_URL = 'https://www.instagram.com/reel/DOPL8YYAQsB/embed';

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const updateMatch = () => setIsMobile(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, [breakpoint]);

  return isMobile;
}

type EmbedStatus = 'loading' | 'loaded' | 'failed';

interface EmbedFrameProps {
  title: string;
  src: string;
  openUrl: string;
  openLabel: string;
  containerClassName?: string;
}

function EmbedFrame({ title, src, openUrl, openLabel, containerClassName }: EmbedFrameProps) {
  const [status, setStatus] = useState<EmbedStatus>('loading');
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
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
  }, [frameKey, src, title]);

  const handleLoad = () => {
    if (import.meta.env.DEV) {
      console.log(`[${title}] iframe loaded`);
    }
    setStatus('loaded');
  };

  const handleError = () => {
    setStatus('failed');
  };

  const retryLoad = () => {
    setStatus('loading');
    setFrameKey((key) => key + 1);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-xl ${containerClassName ?? ''}`.trim()}>
      {status !== 'failed' && (
        <iframe
          key={frameKey}
          title={title}
          src={src}
          className="h-full w-full border-0"
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          scrolling="no"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            Loading {title}...
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-gray-600">Having trouble loading this.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-gray-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-900 hover:bg-gray-900 hover:text-white"
            >
              {openLabel}
            </a>
            <button
              type="button"
              onClick={retryLoad}
              className="rounded-full border border-gray-300 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-700 hover:border-gray-400"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PreviewFrameProps {
  title: string;
  onOpen: () => void;
}

function PreviewFrame({ title, onOpen }: PreviewFrameProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-[360px] w-full flex-col items-center justify-center gap-3 rounded-xl text-center transition hover:text-gray-800"
    >
      <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{title}</p>
      <p className="text-sm text-gray-600">Tap to open.</p>
      <span className="rounded-full border border-gray-900 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-900 hover:bg-gray-900 hover:text-white">
        Open {title}
      </span>
    </button>
  );
}

export function SocialsSection() {
  const isMobile = useIsMobile(1024);
  const [activeModal, setActiveModal] = useState<'tiktok' | 'instagram' | null>(null);

  useEffect(() => {
    if (!activeModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal]);

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
            <div className="mx-auto max-w-[420px]">
              <a
                href="https://www.tiktok.com/@thechesapeakeshell"
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700"
              >
                Follow on TikTok ?
              </a>
            </div>
            {isMobile ? (
              <PreviewFrame
                title="TikTok"
                onOpen={() => setActiveModal('tiktok')}
              />
            ) : (
              <EmbedFrame
                title="TikTok"
                src={TIKTOK_EMBED_URL}
                openUrl={TIKTOK_CITE_URL}
                openLabel="Open on TikTok"
                containerClassName="h-[720px]"
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="mx-auto max-w-[420px]">
              <a
                href="https://www.instagram.com/thechesapeakeshell"
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700"
              >
                Follow on Instagram ?
              </a>
            </div>
            {isMobile ? (
              <PreviewFrame
                title="Instagram"
                onOpen={() => setActiveModal('instagram')}
              />
            ) : (
              <EmbedFrame
                title="Instagram"
                src={INSTAGRAM_EMBED_URL}
                openUrl="https://www.instagram.com/thechesapeakeshell"
                openLabel="Open on Instagram"
                containerClassName="h-[720px]"
              />
            )}
          </div>
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative h-[90vh] w-[min(520px,92vw)] rounded-2xl bg-white">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="absolute right-3 top-3 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-700 hover:text-gray-900"
            >
              Close
            </button>
            <div className="h-full w-full overflow-hidden rounded-2xl">
              {/* Mobile renders embeds in a tall modal to avoid provider iframe overflow/scrollbars. */}
              {activeModal === 'tiktok' ? (
                <EmbedFrame
                  title="TikTok"
                  src={TIKTOK_EMBED_URL}
                  openUrl={TIKTOK_CITE_URL}
                  openLabel="Open on TikTok"
                  containerClassName="h-full"
                />
              ) : (
                <EmbedFrame
                  title="Instagram"
                  src={INSTAGRAM_EMBED_URL}
                  openUrl="https://www.instagram.com/thechesapeakeshell"
                  openLabel="Open on Instagram"
                  containerClassName="h-full"
                />
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close socials embed modal"
            className="absolute inset-0"
            onClick={() => setActiveModal(null)}
          />
        </div>
      )}
    </section>
  );
}

