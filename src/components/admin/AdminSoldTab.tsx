import React from 'react';
import type { Product } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';

export interface AdminSoldTabProps {
  soldProducts: Product[];
}

export function AdminSoldTab({ soldProducts }: AdminSoldTabProps) {
  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="Sold Products"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {soldProducts.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 py-12">No sold products yet</div>
        ) : (
          soldProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg overflow-hidden shadow-sm">
              <div className="aspect-square bg-gray-100">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-medium text-gray-900 mb-1">{product.name}</h3>
                <p className="text-sm text-gray-500">
                  {product.soldAt ? `Sold on ${new Date(product.soldAt).toLocaleDateString()}` : 'Sold'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
