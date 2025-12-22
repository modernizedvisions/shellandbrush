import { FLAT_SHIPPING_CENTS, SHIPPING_MODE } from '../api/config/shippingConfig';

export function calculateShippingCents(subtotalCents: number): number {
  if (SHIPPING_MODE === 'none') return 0;
  if (SHIPPING_MODE === 'flat') return FLAT_SHIPPING_CENTS;
  // Conditional rules can be added later; keep current flat behavior as default.
  return FLAT_SHIPPING_CENTS;
}
