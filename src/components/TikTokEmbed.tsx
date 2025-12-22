import { useEffect, useRef, useState } from 'react';

const TIKTOK_SCRIPT_SRC = 'https://www.tiktok.com/embed.js';
let tiktokScriptPromise: Promise<void> | null = null;

function loadTikTokScript() {
  if (tiktokScriptPromise) return tiktokScriptPromise;

  // If script already in the DOM, reuse it
  const existing = document.querySelector(`script[src="${TIKTOK_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
  if (existing) {
    tiktokScriptPromise = existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', () => {
            existing.dataset.loaded = 'true';
            resolve();
          });
          existing.addEventListener('error', () => reject(new Error('TikTok embed failed to load')));
        });
    return tiktokScriptPromise;
  }

  tiktokScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TIKTOK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('TikTok embed failed to load'));
    document.body.appendChild(script);
  });

  return tiktokScriptPromise;
}

interface TikTokEmbedProps {
  videoId: string;
  citeUrl: string;
}

export function TikTokEmbed({ videoId, citeUrl }: TikTokEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadTikTokScript()
      .then(() => {
        if (!mounted) return;
        if ((window as any).tiktokEmbed?.load) {
          (window as any).tiktokEmbed.load();
        }
        setReady(true);
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Re-run load when re-rendered after script load.
  useEffect(() => {
    if (!ready) return;
    if ((window as any).tiktokEmbed?.load) {
      (window as any).tiktokEmbed.load();
    }
  }, [ready]);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <blockquote
        className="tiktok-embed"
        cite={citeUrl}
        data-video-id={videoId}
        style={{ maxWidth: 605, minWidth: 280, width: '100%' }}
      >
        <section>
          <a
            target="_blank"
            rel="noreferrer noopener"
            title="@thechesapeakeshell"
            href="https://www.tiktok.com/@thechesapeakeshell?refer=embed"
          >
            @thechesapeakeshell
          </a>
          {' '}Packing up orders is as much fun for me as it is to make the orders!{' '}
          <a
            title="christmasornaments"
            target="_blank"
            rel="noreferrer noopener"
            href="https://www.tiktok.com/tag/christmasornaments?refer=embed"
          >
            #christmasornaments
          </a>{' '}
          <a
            title="shellart"
            target="_blank"
            rel="noreferrer noopener"
            href="https://www.tiktok.com/tag/shellart?refer=embed"
          >
            #shellart
          </a>{' '}
          <a
            title="crafttok"
            target="_blank"
            rel="noreferrer noopener"
            href="https://www.tiktok.com/tag/crafttok?refer=embed"
          >
            #crafttok
          </a>{' '}
          <a
            title="coastaldecor"
            target="_blank"
            rel="noreferrer noopener"
            href="https://www.tiktok.com/tag/coastaldecor?refer=embed"
          >
            #coastaldecor
          </a>{' '}
          <a
            title="handmadegifts"
            target="_blank"
            rel="noreferrer noopener"
            href="https://www.tiktok.com/tag/handmadegifts?refer=embed"
          >
            #handmadegifts
          </a>{' '}
          <a
            target="_blank"
            rel="noreferrer noopener"
            title="♬ Gabrielle (From Paris When It Sizzles) - Audrey Hepburn / Nelson Riddle"
            href="https://www.tiktok.com/music/Gabrielle-From-Paris-When-It-Sizzles-239015199201030144?refer=embed"
          >
            ♬ Gabrielle (From Paris When It Sizzles) - Audrey Hepburn / Nelson Riddle
          </a>
        </section>
      </blockquote>
    </div>
  );
}
