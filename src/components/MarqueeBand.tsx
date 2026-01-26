import { useMemo, useState } from 'react';

export type MarqueeTile = {
  id: string;
  url: string;
  alt: string;
};

type MarqueeBandProps = {
  tiles: MarqueeTile[];
  durationSeconds?: number;
  className?: string;
};

export function MarqueeBand({ tiles, durationSeconds = 70, className = '' }: MarqueeBandProps) {
  const [isPaused, setIsPaused] = useState(false);
  const looped = useMemo(() => [...tiles, ...tiles], [tiles]);

  if (!tiles.length) return null;

  return (
    <div
      className={`relative marquee ${className}`.trim()}
      style={{ ['--marquee-duration' as any]: `${durationSeconds}s` }}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onPointerLeave={() => setIsPaused(false)}
    >
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-[#F8F5F0]/95 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-[#F8F5F0]/95 to-transparent pointer-events-none" />
      <div className="overflow-hidden">
        <div className={`marqueeTrack ${isPaused ? 'animate-none' : ''}`}>
          {looped.map((tile, idx) => (
            <div
              key={`${tile.id}-${idx}`}
              className="px-3 py-2"
            >
              <div className="w-[120px] sm:w-[140px] md:w-[160px] aspect-[4/5] sm:aspect-square rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-100">
                <img
                  src={tile.url}
                  alt={tile.alt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
