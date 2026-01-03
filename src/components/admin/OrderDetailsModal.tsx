import React, { useEffect, useMemo, useState } from 'react';
import type { AdminOrder } from '../../lib/db/orders';
import { formatDateTimeEastern } from '../../lib/date';

interface OrderDetailsModalProps {
  open: boolean;
  order: AdminOrder | null;
  onClose: () => void;
}

const formatCurrency = (cents: number | null | undefined) => {
  const amount = (cents ?? 0) / 100;
  return `$${amount.toFixed(2)}`;
};

export function OrderDetailsModal({ open, order, onClose }: OrderDetailsModalProps) {
  if (!open || !order) return null;

  const idLabel = order.displayOrderId || order.id?.slice(0, 8) || 'Order';
  const placedAt = order.createdAt ? formatDateTimeEastern(order.createdAt) : 'Unknown date';
  const customerName = order.shippingName || order.customerName || 'Customer';
  const customerEmail = order.customerEmail || 'No email provided';

  const shipping = order.shippingAddress;
  const hasShipping = !!shipping;

  const [itemImages, setItemImages] = useState<Record<string, string>>({});

  const isShippingItem = (item: any) => {
    const name = (item.productName || '').toLowerCase();
    const pid = (item.productId || '').toLowerCase();
    return name.includes('shipping') || pid === 'shipping' || pid === 'ship' || pid === 'shipping_line';
  };

  const rawItems = useMemo(() => {
    if (Array.isArray(order.items) && order.items.length) return order.items;
    return [
      {
        productId: 'item',
        productName: 'Item',
        quantity: 1,
        priceCents: order.totalCents || 0,
      },
    ];
  }, [order]);

  useEffect(() => {
    const fetchImages = async () => {
      const missing = rawItems.filter(
        (i) =>
          i.productId &&
          !isShippingItem(i) &&
          !i.productImageUrl &&
          !itemImages[i.productId as string]
      );
      for (const itm of missing) {
        try {
          const res = await fetch(`/api/products/${itm.productId}`);
          if (!res.ok) continue;
          const data = await res.json();
          const url =
            data?.image_url ||
            (Array.isArray(data?.images) ? data.images[0] : null) ||
            (Array.isArray(data?.image_urls) ? data.image_urls[0] : null) ||
            null;
          if (url) {
            setItemImages((prev) => ({ ...prev, [itm.productId as string]: url }));
          }
        } catch {
          // ignore failures
        }
      }
    };
    fetchImages();
  }, [rawItems, itemImages]);

  const shippingFromItems = rawItems
    .filter(isShippingItem)
    .reduce((sum, item) => sum + (item.priceCents || 0) * (item.quantity || 1), 0);

  const items = rawItems
    .filter((i) => !isShippingItem(i))
    .map((i) => ({
      ...i,
      productImageUrl: i.productImageUrl || (i.productId ? itemImages[i.productId] : undefined),
    }));

  const lineTotal = (qty: number, priceCents: number) => formatCurrency((qty || 0) * (priceCents || 0));
  const subtotalCents = items.reduce((sum, item) => sum + (item.priceCents || 0) * (item.quantity || 1), 0);
  const totalCents = order.totalCents ?? subtotalCents;
  const inferredShippingFromTotal = totalCents - subtotalCents;
  const shippingCents =
    order.shippingCents && order.shippingCents > 0
      ? order.shippingCents
      : shippingFromItems > 0
      ? shippingFromItems
      : inferredShippingFromTotal > 0
      ? inferredShippingFromTotal
      : 0;

  const formattedAddress = hasShipping
    ? [
        shipping?.line1,
        shipping?.line2,
        [shipping?.city, shipping?.state, shipping?.postal_code].filter(Boolean).join(', '),
        shipping?.country,
      ]
        .filter((line) => (line || '').toString().trim().length > 0)
        .join('\n') || 'Shipping address not provided'
    : 'No shipping address provided.';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-3 py-6">
      <div className="relative w-full max-w-xl max-h-[calc(100vh-3rem)] rounded-2xl bg-white shadow-xl border border-slate-100 p-6 overflow-hidden flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          CLOSE
        </button>

        <div className="pb-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-1">Order</p>
          <div className="text-xl font-semibold text-slate-900">Order {idLabel}</div>
          <p className="text-sm text-slate-600">Placed {placedAt}</p>
        </div>

        <div className="overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">Customer</p>
              <div className="space-y-1 text-sm text-slate-700">
                <div className="font-medium text-slate-900">{customerName}</div>
                <div className="text-slate-600">{customerEmail}</div>
                <div className="text-slate-600 whitespace-pre-line">{formattedAddress}</div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-2">Order Status</p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 border border-emerald-100">
                  Completed
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-blue-700 border border-blue-100">
                  Paid
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-700 border border-slate-200">
                  {placedAt}
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-2">Items</p>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-md bg-slate-100 border border-slate-200 overflow-hidden">
                        {item.productImageUrl ? (
                          <img
                            src={item.productImageUrl}
                            alt={item.productName || 'Product'}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {item.productName || item.productId || 'Item'}
                        </div>
                        <div className="text-xs text-slate-600">
                          Qty: {item.quantity || 0}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                      {lineTotal(item.quantity, item.priceCents)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mb-2">Totals</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">{formatCurrency(subtotalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Shipping</span>
                  <span className="font-medium text-slate-900">{formatCurrency(shippingCents)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="font-semibold text-slate-900">Total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totalCents)}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
