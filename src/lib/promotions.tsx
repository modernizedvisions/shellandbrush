import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PromotionPublic } from './types';

type PromotionContextValue = {
  promotion: PromotionPublic | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const PromotionContext = createContext<PromotionContextValue | undefined>(undefined);

export const normalizePromotionValue = (value?: string | null) =>
  (value || '').trim().toLowerCase();

export const getDiscountedCents = (priceCents: number, percentOff: number) =>
  Math.round(priceCents * (100 - percentOff) / 100);

export const isPromotionEligible = (
  promotion: PromotionPublic | null,
  item: { category?: string | null; type?: string | null; categories?: string[] | null }
): boolean => {
  if (!promotion) return false;
  if (promotion.scope === 'global') return true;
  const slugs = promotion.categorySlugs.map((slug) => normalizePromotionValue(slug));
  if (!slugs.length) return false;
  const candidate = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = normalizePromotionValue(value);
    if (normalized) candidate.add(normalized);
  };
  add(item.category);
  add(item.type);
  if (Array.isArray(item.categories)) {
    item.categories.forEach((value) => add(value));
  }
  return Array.from(candidate).some((value) => slugs.includes(value));
};

export const fetchActivePromotion = async (): Promise<PromotionPublic | null> => {
  const response = await fetch('/api/promotions/active', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Promotions API responded with ${response.status}`);
  }
  const data = await response.json();
  return data?.promotion ?? null;
};

export function PromotionProvider({ children }: { children: React.ReactNode }) {
  const [promotion, setPromotion] = useState<PromotionPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const promo = await fetchActivePromotion();
      setPromotion(promo);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load promotion');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const value = useMemo(
    () => ({ promotion, isLoading, error, refresh }),
    [promotion, isLoading, error, refresh]
  );

  return <PromotionContext.Provider value={value}>{children}</PromotionContext.Provider>;
}

export const usePromotion = () => {
  const context = useContext(PromotionContext);
  if (!context) {
    throw new Error('usePromotion must be used within PromotionProvider');
  }
  return context;
};
