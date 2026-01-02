import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../../lib/api';
import type { Product } from '../../lib/types';
import { ProductCard } from '../../components/ProductCard';

export function FeaturedWorksSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await fetchProducts({ visible: true });
        const availableProducts = (allProducts || []).filter((product) => !product.isSold);
        setProducts(availableProducts);
      } catch (error) {
        console.error('Error loading featured works:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, []);

  const featured = useMemo(() => products.slice(0, 3), [products]);

  return (
    <section id="featured" className="py-16 md:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-serif font-semibold text-gray-900">
            FEATURED WORKS
          </h2>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading featured works...</div>
        ) : featured.length ? (
          <div className="grid gap-8 md:grid-cols-3">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No featured works available yet.</div>
        )}

        <div className="mt-10 flex justify-center">
          <Link
            to="/shop#top"
            className="text-lg md:text-xl uppercase tracking-[0.3em] text-gray-500 hover:text-gray-700 underline underline-offset-4"
          >
            Shop All Featured Works
          </Link>
        </div>
      </div>
    </section>
  );
}
