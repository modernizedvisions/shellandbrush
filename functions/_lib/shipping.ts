export type ShippingCategoryConfig = {
  slug?: string | null;
  name?: string | null;
  shippingCents?: number | null;
};

export type CartCategoryItem = {
  category?: string | null;
  categories?: string[] | null;
};

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const toCategoryNames = (item: CartCategoryItem): string[] => {
  const names = new Set<string>();
  const addName = (value?: string | null) => {
    const trimmed = (value || '').trim();
    if (trimmed) names.add(trimmed);
  };
  addName(item.category);
  if (Array.isArray(item.categories)) {
    item.categories.forEach((c) => addName(c));
  }
  return Array.from(names);
};

const buildShippingLookup = (categories: ShippingCategoryConfig[]) => {
  const lookup = new Map<string, number>();
  categories.forEach((category) => {
    const shipping = Number.isFinite(category.shippingCents as number)
      ? Math.max(0, Number(category.shippingCents))
      : 0;
    if (category.slug) lookup.set(normalizeCategoryKey(category.slug), shipping);
    if (category.name) lookup.set(normalizeCategoryKey(category.name), shipping);
  });
  return lookup;
};

const resolveShippingForNames = (names: string[], lookup: Map<string, number>): number => {
  if (!names.length) return 0;
  const shippingValues = names
    .map((name) => lookup.get(normalizeCategoryKey(name)))
    .filter((value): value is number => typeof value === 'number');
  if (!shippingValues.length) return 0;
  return Math.min(...shippingValues);
};

export function calculateShippingCentsForCart(
  items: CartCategoryItem[],
  categories: ShippingCategoryConfig[]
): number {
  if (!items.length) return 0;
  const lookup = buildShippingLookup(categories);
  const itemShipping = items.map((item) => resolveShippingForNames(toCategoryNames(item), lookup));
  if (!itemShipping.length) return 0;
  return Math.min(...itemShipping);
}
