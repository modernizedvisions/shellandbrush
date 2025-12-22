import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSoldProducts } from '../lib/api';
import { Product } from '../lib/types';
import { useGalleryImages } from '../lib/hooks/useGalleryImages';

export function GalleryPage() {
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);
  const [isLoadingSold, setIsLoadingSold] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { images: galleryImages, isLoading: isLoadingGallery } = useGalleryImages();

  useEffect(() => {
    const loadSold = async () => {
      try {
        const sold = await fetchSoldProducts();
        setSoldProducts(sold);
      } catch (error) {
        console.error('Error loading gallery data:', error);
      } finally {
        setIsLoadingSold(false);
      }
    };
    loadSold();
  }, []);

  const isLoading = isLoadingGallery || isLoadingSold;

  return (
    <div className="py-12 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-center text-3xl md:text-4xl font-semibold uppercase tracking-wide text-slate-900 mb-2">
          Gallery
        </h1>
        <p className="text-center text-slate-600 text-sm md:text-base mb-10">
          Explore our collection of art pieces and sold works.
        </p>
        <div className="flex justify-center mb-8">
          <Link
            to="/shop"
            className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-md transition hover:bg-gray-800"
          >
            Shop The Collection
          </Link>
        </div>
        <div className="mt-8"></div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading gallery...</p>
          </div>
        ) : (
          <>
            <section className="mb-12">
              {galleryImages.length === 0 ? (
                <div className="text-gray-500">No images yet.</div>
              ) : (
                <div className="gallery-grid grid grid-cols-2 landscape:grid-cols-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {galleryImages.map((item) => (
                    <div key={item.id} className="relative group cursor-pointer">
                      <div
                        className="aspect-square overflow-hidden rounded-lg bg-gray-100"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title || 'Gallery item'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Sold Products</h2>
              {soldProducts.length === 0 ? (
                <div className="text-gray-500">No sold products yet.</div>
              ) : (
                <div className="sold-grid grid grid-cols-2 landscape:grid-cols-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {soldProducts.map((item) => (
                    <div key={item.id} className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div
                        className="relative aspect-square overflow-hidden bg-gray-100 cursor-pointer"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <h3 className="text-sm font-serif font-medium text-slate-900 truncate">{item.name}</h3>
                          <span className="text-sm font-serif font-medium text-slate-800 whitespace-nowrap">SOLD</span>
                        </div>
                        {item.collection && (
                          <p className="text-xs text-slate-600">{item.collection}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt="Gallery item"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
