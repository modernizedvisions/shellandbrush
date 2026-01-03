import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../lib/api';
import { Category, Product } from '../lib/types';
import { ProductGrid } from '../components/ProductGrid';

const BASE_CATEGORY_ORDER: Category[] = [
  { id: 'other-items', name: 'Featured Works', slug: 'other-items', showOnHomePage: true },
  { id: 'ornaments', name: 'Ornaments', slug: 'ornaments', showOnHomePage: true },
  { id: 'ring-dish', name: 'Ring Dishes', slug: 'ring-dish', showOnHomePage: true },
  { id: 'decor', name: 'Decor', slug: 'decor', showOnHomePage: true },
  { id: 'wine-stopper', name: 'Wine Stoppers', slug: 'wine-stopper', showOnHomePage: true },
];

const OTHER_ITEMS_CATEGORY: Category = {
  id: 'other-items',
  name: 'Featured Works',
  slug: 'other-items',
  showOnHomePage: true,
};

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const orderCategorySummaries = (items: Category[]): Category[] => {
  const normalize = (value: string) => toSlug(value);
  const used = new Set<string>();
  const ordered: Category[] = [];

  BASE_CATEGORY_ORDER.forEach((base) => {
    const match = items.find(
      (item) => normalize(item.slug) === normalize(base.slug) || normalize(item.name) === normalize(base.name)
    );
    if (match) {
      const key = normalize(match.slug);
      if (!used.has(key)) {
        ordered.push(match);
        used.add(key);
      }
    }
  });

  const remaining = items
    .filter((item) => !used.has(normalize(item.slug)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const combined = [...ordered, ...remaining];
  const otherItemsKey = normalize(OTHER_ITEMS_CATEGORY.slug);
  const featuredWorksKey = normalize(OTHER_ITEMS_CATEGORY.name);
  const isOtherItems = (item: Category) => {
    const slugKey = normalize(item.slug);
    const nameKey = normalize(item.name);
    return slugKey === otherItemsKey || nameKey === otherItemsKey || nameKey === featuredWorksKey;
  };
  const otherItems = combined.filter(isOtherItems);
  const withoutOtherItems = combined.filter((item) => !isOtherItems(item));
  return [...withoutOtherItems, ...otherItems];
};

const isFeaturedWorksCategory = (category: Category) => {
  const slugKey = toSlug(category.slug || '');
  const nameKey = toSlug(category.name || '');
  const featuredWorksKey = toSlug(OTHER_ITEMS_CATEGORY.name);
  return (
    slugKey === OTHER_ITEMS_CATEGORY.slug ||
    nameKey === OTHER_ITEMS_CATEGORY.slug ||
    nameKey === featuredWorksKey
  );
};

const ensureCategoryDefaults = (category: Category): Category => {
  const normalized = {
    ...category,
    name: category.name || category.slug,
    slug: category.slug || toSlug(category.name || ''),
    showOnHomePage: category.showOnHomePage ?? true,
  };
  if (isFeaturedWorksCategory(normalized)) {
    return {
      ...normalized,
      name: OTHER_ITEMS_CATEGORY.name,
      slug: OTHER_ITEMS_CATEGORY.slug,
    };
  }
  return normalized;
};

const mergeCategories = (apiCategories: Category[], derivedCategories: Category[]): Category[] => {
  const merged = new Map<string, Category>();
  const upsert = (category: Category, preferOverride = false) => {
    const normalizedKey = toSlug(category.slug || category.name || '');
    if (!normalizedKey) return;
    const next = ensureCategoryDefaults(category);
    if (preferOverride || !merged.has(normalizedKey)) {
      merged.set(normalizedKey, next);
    }
  };

  derivedCategories.forEach((category) => upsert(category, false));
  apiCategories.forEach((category) => upsert(category, true));

  return Array.from(merged.values());
};

const dedupeCategories = (categories: Category[]): Category[] => {
  const seen = new Set<string>();
  const result: Category[] = [];
  categories.forEach((category) => {
    const key = toSlug(category.slug || category.name || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(ensureCategoryDefaults(category));
  });
  return result;
};

const deriveCategoriesFromProducts = (items: Product[]): Category[] => {
  const names = new Map<string, string>();
  const addName = (name?: string | null) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const slug = toSlug(trimmed);
    if (!names.has(slug)) names.set(slug, trimmed);
  };

  items.forEach((product) => {
    addName(product.type);
    addName((product as any).category);
    if (Array.isArray(product.categories)) {
      product.categories.forEach((c) => addName(c));
    }
    if (Array.isArray((product as any).categories)) {
      (product as any).categories.forEach((c: unknown) => {
        if (typeof c === 'string') addName(c);
      });
    }
  });

  const derived = Array.from(names.entries()).map(
    ([slug, name]): Category => ({ id: slug, slug, name, showOnHomePage: true })
  );
  return orderCategorySummaries(derived);
};

const getProductCategoryNames = (product: Product): string[] => {
  const names = new Set<string>();
  const addName = (name?: string | null) => {
    const trimmed = (name || '').trim();
    if (trimmed) names.add(trimmed);
  };

  addName(product.type);
  addName((product as any).category);
  if (Array.isArray(product.categories)) {
    product.categories.forEach((c) => addName(c));
  }
  if (Array.isArray((product as any).categories)) {
    (product as any).categories.forEach((c: unknown) => {
      if (typeof c === 'string') addName(c);
    });
  }

  return Array.from(names);
};

const buildCategoryLookups = (categoryList: Category[]) => {
  const slugLookup = new Map<string, string>();
  const nameLookup = new Map<string, string>();
  categoryList.forEach((cat) => {
    const normalizedSlug = toSlug(cat.slug);
    const normalizedName = toSlug(cat.name);
    if (normalizedSlug) slugLookup.set(normalizedSlug, cat.slug);
    if (normalizedName) nameLookup.set(normalizedName, cat.slug);
  });
  return { slugLookup, nameLookup };
};

const ensureOtherItemsCategory = (categories: Category[], products: Product[]): Category[] => {
  const normalizedOtherItems = toSlug(OTHER_ITEMS_CATEGORY.slug);
  const normalizedFeaturedWorks = toSlug(OTHER_ITEMS_CATEGORY.name);
  const hasOtherItems = categories.some(
    (cat) =>
      toSlug(cat.slug) === normalizedOtherItems ||
      toSlug(cat.name) === normalizedOtherItems ||
      toSlug(cat.name) === normalizedFeaturedWorks
  );
  const lookups = buildCategoryLookups(categories);
  const needsFallback = products.some((product) => {
    const resolution = resolveCategorySlugForProduct(product, categories, lookups);
    return !resolution.slug;
  });

  if (hasOtherItems || !needsFallback) return categories;

  return [...categories, OTHER_ITEMS_CATEGORY];
};

const resolveCategorySlugForProduct = (
  product: Product,
  categoryList: Category[],
  lookups: { slugLookup: Map<string, string>; nameLookup: Map<string, string> },
  fallbackSlug?: string
): {
  slug: string | null;
  matchedBy: 'slug' | 'name' | 'fallback' | 'none';
  candidateNames: string[];
  normalizedCandidates: string[];
} => {
  const candidateNames = getProductCategoryNames(product);
  const normalizedCandidates = candidateNames.map((name) => toSlug(name)).filter(Boolean);
  const candidateSet = new Set(normalizedCandidates);

  for (const category of categoryList) {
    const normalizedSlug = toSlug(category.slug);
    const normalizedName = toSlug(category.name);
    if (normalizedSlug && candidateSet.has(normalizedSlug)) {
      return { slug: category.slug, matchedBy: 'slug', candidateNames, normalizedCandidates };
    }
    if (normalizedName && candidateSet.has(normalizedName)) {
      return { slug: category.slug, matchedBy: 'name', candidateNames, normalizedCandidates };
    }
  }

  for (const normalized of normalizedCandidates) {
    if (lookups.slugLookup.has(normalized)) {
      return {
        slug: lookups.slugLookup.get(normalized)!,
        matchedBy: 'slug',
        candidateNames,
        normalizedCandidates,
      };
    }
    if (lookups.nameLookup.has(normalized)) {
      return {
        slug: lookups.nameLookup.get(normalized)!,
        matchedBy: 'name',
        candidateNames,
        normalizedCandidates,
      };
    }
  }

  if (fallbackSlug) return { slug: fallbackSlug, matchedBy: 'fallback', candidateNames, normalizedCandidates };

  return { slug: null, matchedBy: 'none', candidateNames, normalizedCandidates };
};

const CATEGORY_COPY: Record<string, { title: string; description: string }> = {
  ornaments: {
    title: 'ORNAMENTS',
    description: 'Hand-crafted coastal keepsakes for every season.',
  },
  'ring-dish': {
    title: 'RING DISHES',
    description: 'Functional coastal art designed for your jewelry & keepsakes.',
  },
  'ring dishes': {
    title: 'RING DISHES',
    description: 'Functional coastal art designed for your jewelry & keepsakes.',
  },
  decor: {
    title: 'DECOR',
    description: 'Coastal artistry to brighten your space with shoreline charm.',
  },
  'wine-stopper': {
    title: 'WINE STOPPERS',
    description: 'Hand-crafted shell stoppers for your favorite bottles.',
  },
  'wine stoppers': {
    title: 'WINE STOPPERS',
    description: 'Hand-crafted shell stoppers for your favorite bottles.',
  },
  'other-items': {
    title: 'FEATURED WORKS',
    description: 'Explore our collection of handcrafted shell art pieces, each uniquely designed and ready to find its perfect home',
  },
  'other items': {
    title: 'FEATURED WORKS',
    description: 'Explore our collection of handcrafted shell art pieces, each uniquely designed and ready to find its perfect home',
  },
  'featured-works': {
    title: 'FEATURED WORKS',
    description: 'Explore our collection of handcrafted shell art pieces, each uniquely designed and ready to find its perfect home',
  },
  'featured works': {
    title: 'FEATURED WORKS',
    description: 'Explore our collection of handcrafted shell art pieces, each uniquely designed and ready to find its perfect home',
  },
};

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const categoryList = useMemo(() => {
    const baseList = categories.length ? categories : deriveCategoriesFromProducts(products);
    const deduped = dedupeCategories(baseList);
    const withFallback = ensureOtherItemsCategory(deduped, products);
    return orderCategorySummaries(dedupeCategories(withFallback));
  }, [categories, products]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (location.hash !== '#top') return;
    const target = document.getElementById('shop-top');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.hash]);

  const loadProducts = async () => {
    try {
      const allProducts = await fetchProducts({ visible: true });
      const normalizedProducts = Array.isArray(allProducts) ? allProducts : [];
      const availableProducts = normalizedProducts.filter((p) => !p.isSold);
      setProducts(availableProducts);

      let apiCategories: Category[] = [];
      try {
        const fetchedCategories = await fetchCategories();
        apiCategories = Array.isArray(fetchedCategories) ? fetchedCategories : [];
      } catch (categoryError) {
        console.error('Error loading categories:', categoryError);
      }

      const orderedCategories = orderCategorySummaries(dedupeCategories(apiCategories));
      setCategories(orderedCategories);
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    if (!categoryList.length) return groups;

    categoryList.forEach((c) => {
      groups[c.slug] = [];
    });

    const fallbackSlug = OTHER_ITEMS_CATEGORY.slug;
    const lookups = buildCategoryLookups(categoryList);

    products.forEach((product) => {
      const resolution = resolveCategorySlugForProduct(product, categoryList, lookups, fallbackSlug);
      const key = resolution.slug || fallbackSlug;
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });

    return groups;
  }, [categoryList, products]);
  const visibleCategories = useMemo(() => {
    if (!categoryList.length) return [];
    return categoryList.filter((category) => (groupedProducts[category.slug] || []).length > 0);
  }, [categoryList, groupedProducts]);

  useEffect(() => {
    const typeParam = searchParams.get('type');
    const normalized = typeParam ? toSlug(typeParam) : '';
    const match = normalized
      ? visibleCategories.find(
          (c) => toSlug(c.slug) === normalized || toSlug(c.name) === normalized
        )
      : undefined;

    if (match) {
      if (activeCategorySlug !== match.slug) {
        setActiveCategorySlug(match.slug);
      }
      return;
    }

    if (!visibleCategories.length) {
      if (activeCategorySlug) {
        setActiveCategorySlug('');
        searchParams.delete('type');
        setSearchParams(searchParams, { replace: true });
      }
      return;
    }

    const fallbackSlug = visibleCategories[0].slug;
    if (!activeCategorySlug || !visibleCategories.some((c) => c.slug === activeCategorySlug)) {
      setActiveCategorySlug(fallbackSlug);
      searchParams.set('type', fallbackSlug);
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, visibleCategories, activeCategorySlug, setSearchParams]);

  const orderedSections = useMemo(() => {
    const resolvedActiveSlug = activeCategorySlug || categoryList[0]?.slug;
    const active = resolvedActiveSlug
      ? categoryList.find((c) => c.slug === resolvedActiveSlug)
      : undefined;
    if (!active) return categoryList;
    return [active, ...categoryList.filter((c) => c.slug !== active.slug)];
  }, [activeCategorySlug, categoryList]);

  return (
    <div id="shop-top" className="py-12 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {visibleCategories.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {visibleCategories.map((category) => {
              const hasItems = (groupedProducts[category.slug] || []).length > 0;
              if (category.slug === OTHER_ITEMS_CATEGORY.slug && !hasItems) {
                return null;
              }
              const isActive = activeCategorySlug === category.slug;
              return (
                <button
                  key={category.slug}
                  onClick={() => {
                    setActiveCategorySlug(category.slug);
                    searchParams.set('type', category.slug);
                    setSearchParams(searchParams, { replace: true });
                  }}
                  className={`px-4 py-1.5 rounded-full border text-sm transition ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-serif text-slate-900">No products available yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Please check back soon for new coastal pieces.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {orderedSections.map((category) => {
              const items = groupedProducts[category.slug] || [];
              if (items.length === 0) return null;

              const copyKey = category.slug.toLowerCase();
              const copy =
                CATEGORY_COPY[copyKey] ||
                CATEGORY_COPY[(category.name || '').toLowerCase()] ||
                null;
              const description = copy?.description ?? category.description ?? '';
              return (
                <section key={category.slug} className="mb-10">
                  <div className="text-center mb-4">
                    <h2 className="text-2xl md:text-3xl font-serif tracking-tight text-slate-900 uppercase">
                      {copy?.title || category.name}
                    </h2>
                    {description && (
                      <p className="mt-1 text-sm md:text-base font-sans text-slate-600 uppercase">
                        {description}
                      </p>
                    )}
                  </div>
                  <ProductGrid products={items} />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

