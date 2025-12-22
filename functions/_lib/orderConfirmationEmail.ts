export type OrderConfirmationEmailItem = {
  name: string;
  qty?: number | null;
  unitAmount?: number | null;
  lineTotal: number;
  imageUrl?: string | null;
};

export type OrderConfirmationEmailParams = {
  brandName: string;
  orderNumber: string;
  orderDate: string;
  customerName?: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  items: OrderConfirmationEmailItem[];
  subtotal: number;
  shipping: number;
  total: number;
  primaryCtaUrl: string;
  primaryCtaLabel?: string;
};

export function renderOrderConfirmationEmailHtml(params: OrderConfirmationEmailParams): string {
  const brand = params.brandName || 'Order';
  const orderLabel = params.orderNumber || 'Order';
  const customerName = params.customerName || 'Customer';
  const customerEmail = params.customerEmail || '';
  const shippingAddress = params.shippingAddress || '';
  const primaryCtaLabel = params.primaryCtaLabel || 'View order details';

  const itemRows = (params.items || []).map((item) => {
    const qty = item.qty && item.qty > 1 ? `x${item.qty}` : '';
    const unit = item.unitAmount && item.unitAmount > 0 ? `${formatMoney(item.unitAmount)} ea` : '';
    const img = item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="48" height="48" style="border-radius:10px; object-fit:cover; display:block; border:1px solid #e5e7eb;" />` : '';
    return `
      <tr>
        <td style="padding:12px 0; border-bottom:1px solid #ece8e2;">
          <table role="presentation" style="width:100%; border-collapse:collapse;">
            <tr>
              ${img ? `<td style="width:56px; padding-right:12px; vertical-align:top;">${img}</td>` : ''}
              <td style="vertical-align:top;">
                <div style="font-family: Georgia, 'Times New Roman', serif; font-size:16px; color:#1f2937; font-weight:600; margin:0 0 4px;">${escapeHtml(item.name)}</div>
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; margin:0;">${[qty, unit].filter(Boolean).join(' · ')}</div>
              </td>
              <td style="vertical-align:top; text-align:right; font-family:'Helvetica Neue', Arial, sans-serif; font-size:14px; color:#1f2937; font-weight:600; white-space:nowrap;">${formatMoney(item.lineTotal)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td style="padding:12px 0; color:#6b7280; font-family:'Helvetica Neue', Arial, sans-serif; font-size:14px;">No items found.</td>
    </tr>
  `;

  const shippingBlock = shippingAddress
    ? `<div style="margin-top:12px;">
        <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; margin-bottom:4px;">Shipping address</div>
        <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:14px; color:#1f2937; line-height:1.5;">${escapeHtml(shippingAddress)}</div>
      </div>`
    : '';

  return `
    <div style="background:#faf9f7; padding:24px; font-family:'Helvetica Neue', Arial, sans-serif; color:#111827;">
      <div style="max-width:680px; margin:0 auto; padding:0 12px;">
        <div style="text-align:left; margin-bottom:18px;">
          <div style="font-family: Georgia, 'Times New Roman', serif; font-size:24px; font-weight:700; color:#1f2937; margin:0 0 6px;">Order Confirmed</div>
          <div style="font-size:14px; color:#6b7280; margin:0;">Thank you for your purchase from ${escapeHtml(brand)}.</div>
        </div>

        <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
          <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Order details</div>
          <table role="presentation" style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0; font-size:14px; color:#111827;">Order</td>
              <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${escapeHtml(orderLabel)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0; font-size:14px; color:#111827;">Placed</td>
              <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${escapeHtml(params.orderDate)}</td>
            </tr>
          </table>
        </div>

        <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
          <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Customer</div>
          <div style="font-family: Georgia, 'Times New Roman', serif; font-size:18px; color:#1f2937; font-weight:700; margin-bottom:6px;">${escapeHtml(customerName)}</div>
          ${customerEmail ? `<div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:14px; color:#1f2937; margin:0 0 4px;">${escapeHtml(customerEmail)}</div>` : ''}
          ${shippingBlock}
        </div>

        <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
          <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Items</div>
          <table role="presentation" style="width:100%; border-collapse:collapse;">
            ${itemRows}
          </table>
        </div>

        <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:16px;">
          <div style="font-family:'Helvetica Neue', Arial, sans-serif; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Summary</div>
          <table role="presentation" style="width:100%; border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0; font-size:14px; color:#374151;">Subtotal</td>
              <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${formatMoney(params.subtotal)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0; font-size:14px; color:#374151;">Shipping</td>
              <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${formatMoney(params.shipping)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0 0; font-size:16px; color:#111827; font-weight:700;">Total</td>
              <td style="padding:10px 0 0; text-align:right; font-size:16px; color:#111827; font-weight:700;">${formatMoney(params.total)}</td>
            </tr>
          </table>
        </div>

        <div style="text-align:center; margin-bottom:20px;">
          <a href="${escapeHtml(params.primaryCtaUrl)}" style="display:inline-block; padding:12px 18px; background:#111827; color:#ffffff; text-decoration:none; border-radius:12px; font-weight:700; font-size:14px; letter-spacing:0.02em;">${escapeHtml(primaryCtaLabel)}</a>
        </div>

        <div style="text-align:center; font-size:12px; color:#6b7280; line-height:1.5; margin-top:8px;">
          If you didn\u2019t request this, you can ignore this message.
        </div>
      </div>
    </div>
  `;
}

export function renderOrderConfirmationEmailText(params: OrderConfirmationEmailParams): string {
  const primaryCtaLabel = params.primaryCtaLabel || 'View order details';
  const lines = [
    `${params.brandName || 'Order'} — Order Confirmed`,
    `Order: ${params.orderNumber || ''}`.trim(),
    `Placed: ${params.orderDate || ''}`.trim(),
    `Customer: ${params.customerName || 'Customer'}`,
    params.customerEmail ? `Email: ${params.customerEmail}` : null,
    params.shippingAddress ? `Shipping: ${params.shippingAddress}` : 'Shipping: Not provided',
    '',
    'Items:',
    ...(params.items || []).map((item) => {
      const qty = item.qty && item.qty > 1 ? ` x${item.qty}` : '';
      return `- ${item.name}${qty}: ${formatMoney(item.lineTotal)}`;
    }),
    '',
    `Subtotal: ${formatMoney(params.subtotal)}`,
    `Shipping: ${formatMoney(params.shipping)}`,
    `Total: ${formatMoney(params.total)}`,
    '',
    `${primaryCtaLabel}: ${params.primaryCtaUrl}`,
    "If you didn't request this, you can ignore this message.",
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

export function formatMoney(cents: number | null | undefined): string {
  const value = Number.isFinite(cents as number) ? Number(cents) / 100 : 0;
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
