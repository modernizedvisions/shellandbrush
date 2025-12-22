import React from 'react';
import { AdminSectionHeader } from './AdminSectionHeader';
import type { AdminOrder } from '../../lib/db/orders';

export interface AdminOrdersTabProps {
  searchQuery: string;
  filteredOrders: AdminOrder[];
  onSearchChange: (value: string) => void;
  onSelectOrder: (order: AdminOrder) => void;
  loading?: boolean;
  error?: string | null;
}

export function AdminOrdersTab({ searchQuery, filteredOrders, onSearchChange, onSelectOrder, loading, error }: AdminOrdersTabProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 pt-6">
        <AdminSectionHeader
          title="Orders"
          subtitle="View and manage storefront orders."
        />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3 px-6 pt-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by order ID, customer, or product..."
          className="w-full sm:max-w-md border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
        />
      </div>
      {loading ? (
        <div className="p-8 text-center text-gray-600">Loading orders...</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">
          Failed to load orders{error ? `: ${error}` : ''}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <div>No orders found</div>
          <div className="text-xs text-gray-400 mt-1">Endpoint: /api/admin/orders</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date / Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                    {order.displayOrderId || order.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(order.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div>{order.shippingName || order.customerName || 'Customer'}</div>
                    <div className="text-gray-500">{order.customerEmail || 'No email'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{order.items?.length || 0} items</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${(order.totalCents / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectOrder(order)}
                      className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
