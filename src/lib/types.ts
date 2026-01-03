export interface Product {
  id: string;
  stripeProductId?: string | null;
  name: string;
  slug?: string;
  description: string;
  imageUrls: string[];
  imageUrl: string;
  primaryImageId?: string;
  imageIds?: string[];
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
  category?: string | null;
  categories?: string[] | null;
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
  imageId?: string;
  hidden: boolean;
  alt?: string;
  title?: string;
  position?: number;
  createdAt?: string;
  uploading?: boolean;
  uploadError?: string;
}

export interface GallerySoldItem {
  id: string;
  imageUrl: string;
  title?: string;
  sourceType?: string;
  sourceId?: string;
  soldAt?: string;
  createdAt?: string;
}

// Collage images for the homepage hero
export interface HeroCollageImage {
  id: string;
  imageUrl: string;
  imageId?: string;
  alt?: string;
  createdAt?: string;
  uploading?: boolean;
  uploadError?: string;
}

export interface CustomOrdersImage {
  imageUrl: string;
  imageId?: string;
  alt?: string;
  uploading?: boolean;
  uploadError?: string;
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
  description?: string | null;
  imageUrl?: string;
  heroImageUrl?: string;
  imageId?: string;
  heroImageId?: string;
  showOnHomePage: boolean;
  shippingCents?: number | null;
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
  rating: number; // 1â€“5
  comment: string;
  createdAt: string; // ISO date
}

