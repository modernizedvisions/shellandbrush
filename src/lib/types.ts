export interface Product {
  id: string;
  stripeProductId?: string | null;
  name: string;
  slug?: string;
  description: string;
  imageUrls: string[];
  imageUrl: string;
  thumbnailUrl?: string;
  type: string;
  /**
   * Optional category aliases for flexibility while we transition away from a fixed set.
   * `type` remains the primary category field in most of the UI/API.
   */
  category?: string;
  categories?: string[];
  collection?: string;
  oneoff: boolean;
  quantityAvailable?: number;
  visible: boolean;
  isSold: boolean;
  stripePriceId?: string | null;
  priceCents?: number;
  soldAt?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string;
  oneoff?: boolean;
  quantityAvailable?: number | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
}

export interface CartItemLegacy {
  stripeProductId: string;
  stripePriceId: string;
  name: string;
  priceCents: number;
  quantity: number;
  imageUrl?: string;
  oneoff: boolean;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
}

export interface Order {
  id: string;
  customer: Customer;
  items: CartItem[];
  totalCents: number;
  status: 'paid' | 'pending' | 'canceled';
  createdAt: string;
}

export interface GalleryImage {
  id: string;
  imageUrl: string;
  hidden: boolean;
  alt?: string;
  title?: string;
  position?: number;
  createdAt?: string;
}

// Collage images for the homepage hero
export interface HeroCollageImage {
  id: string;
  imageUrl: string;
  alt?: string;
  createdAt?: string;
}

export interface CustomOrdersImage {
  imageUrl: string;
  alt?: string;
}

export interface HeroConfig {
  heroImages: HeroCollageImage[]; // up to 3
  customOrdersImages?: CustomOrdersImage[]; // up to 4 for custom shells grid
  heroRotationEnabled?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  showOnHomePage: boolean;
}

export type ShopCategoryTile = {
  id: string;
  label: string;
  ctaLabel: string;
  categorySlug: string;
  imageUrl: string;
  slotIndex?: number;
  categoryId?: string;
};

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number; // 1–5
  comment: string;
  createdAt: string; // ISO date
}
