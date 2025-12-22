export const BASE_SHIPPING_CENTS = 500;

// Centralized shipping rule for frontend display (must match server helper).
export function calculateShippingCents(subtotalCents: number): number {
  // Flat $5 shipping for now; adjust here for future rules (e.g., free over threshold).
  return BASE_SHIPPING_CENTS;
}

