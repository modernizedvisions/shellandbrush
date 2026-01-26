import { useEffect, useMemo, useState } from 'react';
import { EmailSignupBand } from '../components/EmailSignupBand';
import { MarqueeBand, type MarqueeTile } from '../components/MarqueeBand';
import { fetchSoldProducts } from '../lib/api';
import type { Product } from '../lib/types';

export function EmailListPage() {
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const data = await fetchSoldProducts();
        if (isMounted) setSoldProducts(data);
      } catch (err) {
        console.error('[EmailListPage] Failed to load sold products', err);
        if (isMounted) setSoldProducts([]);
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const marqueeTiles = useMemo<MarqueeTile[]>(() => {
    return soldProducts
      .map((product, idx) => {
        const url =
          product.imageUrl ||
          product.imageUrls?.[0] ||
          product.imageThumbUrls?.[0] ||
          product.imageMediumUrls?.[0] ||
          '';
        if (!url) return null;
        return {
          id: product.id || `sold-${idx}`,
          url,
          alt: product.name || 'Sold piece',
        };
      })
      .filter(Boolean) as MarqueeTile[];
  }, [soldProducts]);

  return (
    <div className="min-h-full flex items-center">
      <div className="w-full">
        <EmailSignupBand
          withBackground={false}
          sectionClassName="w-full py-8 md:py-12"
          containerClassName="max-w-3xl"
        />
        {marqueeTiles.length > 0 && (
          <div className="mt-2 pb-10">
            <MarqueeBand tiles={marqueeTiles} />
          </div>
        )}
      </div>
    </div>
  );
}
