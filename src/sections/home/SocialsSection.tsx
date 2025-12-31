const TIKTOK_EMBED_URL = 'https://www.tiktok.com/embed/v2/7534342632328138039';
const INSTAGRAM_EMBED_URL = 'https://www.instagram.com/reel/DOPL8YYAQsB/embed';

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
              Follow on TikTok →
            </a>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="aspect-[9/16] w-full">
                <iframe
                  title="TikTok embed"
                  src={TIKTOK_EMBED_URL}
                  className="h-full w-full border-0"
                  loading="lazy"
                  allow="encrypted-media"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="https://www.instagram.com/thechesapeakeshell"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700"
            >
              Follow on Instagram →
            </a>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="aspect-[4/5] w-full">
                <iframe
                  title="Instagram embed"
                  src={INSTAGRAM_EMBED_URL}
                  className="h-full w-full border-0"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
