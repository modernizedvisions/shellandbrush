export type OwnerNewSaleItem = {
  name: string;
  qtyLabel?: string | null;
  lineTotal: string;
  imageUrl?: string | null;
};

export type OwnerNewSaleParams = {
  orderNumber: string;
  orderDate: string;
  orderTypeLabel: string;
  statusLabel: string;
  customerName: string;
  customerEmail: string;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  items: OwnerNewSaleItem[];
  subtotal: string;
  shipping: string;
  total: string;
  adminUrl: string;
  stripeUrl?: string | null;
};

export function renderOwnerNewSaleEmailHtml(params: OwnerNewSaleParams): string {
  const itemsHtml =
    params.items && params.items.length
      ? params.items
          .map((item) => {
            const safeName = escapeHtml(item.name);
            const qty = item.qtyLabel ? `<div style="color:#6b7280; font-size:12px; margin-top:2px;">${escapeHtml(item.qtyLabel)}</div>` : '';
            const image = item.imageUrl
              ? `<td style="width:56px; padding-right:12px; vertical-align:top;">
                  <img src="${escapeHtml(item.imageUrl || '')}" alt="${safeName}" width="48" height="48" style="display:block; border-radius:12px; object-fit:cover; border:1px solid #e5e7eb;">
                </td>`
              : '';
            return `
              <tr>
                <td style="padding:10px 0; border-bottom:1px solid #ece8e2;">
                  <table role="presentation" style="width:100%; border-collapse:collapse;">
                    <tr>
                      ${image}
                      <td style="vertical-align:top;">
                        <div style="font-family: Georgia, 'Times New Roman', serif; font-size:16px; color:#111827; font-weight:700; margin:0 0 2px;">${safeName}</div>
                        ${qty}
                      </td>
                      <td style="vertical-align:top; text-align:right; font-family:'Helvetica Neue', Arial, sans-serif; font-size:14px; color:#111827; font-weight:700; white-space:nowrap;">${escapeHtml(item.lineTotal)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td style="padding:10px 0; color:#6b7280; font-size:14px;">No items found.</td></tr>`;

  const shippingBlock =
    params.shippingAddressLine1 || params.shippingAddressLine2
      ? `
      <div style="margin-top:8px;">
        <div style="font-size:13px; color:#6b7280; margin-bottom:2px;">Shipping</div>
        <div style="font-size:14px; color:#111827; line-height:1.5;">${escapeHtml(
          [params.shippingAddressLine1, params.shippingAddressLine2].filter(Boolean).join('\n')
        ).replace(/\n/g, '<br>')}</div>
      </div>`
      : `<div style="margin-top:8px; font-size:13px; color:#6b7280;">Shipping: Not provided</div>`;

  const stripeButton = params.stripeUrl
    ? `<a href="${escapeHtml(params.stripeUrl)}" style="display:inline-block; padding:11px 16px; background:#f3f4f6; color:#111827; text-decoration:none; border-radius:12px; font-weight:700; font-size:13px; margin-left:8px;">Open in Stripe ↗</a>`
    : '';

  return `
  <div style="background:#f9f7f3; padding:24px; font-family:'Helvetica Neue', Arial, sans-serif; color:#111827;">
    <div style="max-width:720px; margin:0 auto; padding:0 12px;">
      <div style="text-align:left; margin-bottom:16px;">
        <div style="font-family: Georgia, 'Times New Roman', serif; font-size:22px; color:#111827; font-weight:700; margin:0;">NEW SALE — The Chesapeake Shell</div>
        <div style="font-size:13px; color:#6b7280; margin-top:4px;">A new order has been paid.</div>
      </div>

      <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
        <table role="presentation" style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; padding-bottom:6px;">Order</td>
            <td style="text-align:right; font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; padding-bottom:6px;">${escapeHtml(
              params.orderTypeLabel
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; font-size:15px; color:#111827; font-weight:700;">${escapeHtml(params.orderNumber)}</td>
            <td style="padding:4px 0; text-align:right; font-size:14px; color:#16a34a; font-weight:700;">${escapeHtml(
              params.statusLabel
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; font-size:13px; color:#6b7280;">Placed</td>
            <td style="padding:4px 0; text-align:right; font-size:13px; color:#111827;">${escapeHtml(params.orderDate)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0; font-size:13px; color:#6b7280;">Total</td>
            <td style="padding:4px 0; text-align:right; font-size:15px; color:#111827; font-weight:700;">${escapeHtml(
              params.total
            )}</td>
          </tr>
        </table>
      </div>

      <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
        <div style="font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">Customer</div>
        <div style="font-family: Georgia, 'Times New Roman', serif; font-size:18px; color:#111827; font-weight:700; margin-bottom:4px;">${escapeHtml(
          params.customerName || 'Customer'
        )}</div>
        ${
          params.customerEmail
            ? `<div style="font-size:14px; margin-bottom:6px;"><a href="mailto:${escapeHtml(
                params.customerEmail
              )}" style="color:#2563eb; text-decoration:none;">${escapeHtml(params.customerEmail)}</a></div>`
            : ''
        }
        ${shippingBlock}
      </div>

      <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:12px;">
        <div style="font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Items</div>
        <table role="presentation" style="width:100%; border-collapse:collapse;">
          ${itemsHtml}
        </table>
      </div>

      <div style="background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); padding:20px; margin-bottom:16px;">
        <div style="font-size:13px; color:#6b7280; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Totals</div>
        <table role="presentation" style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0; font-size:14px; color:#374151;">Subtotal</td>
            <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${escapeHtml(
              params.subtotal
            )}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; font-size:14px; color:#374151;">Shipping</td>
            <td style="padding:6px 0; text-align:right; font-size:14px; color:#111827; font-weight:600;">${escapeHtml(
              params.shipping
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0; font-size:16px; color:#111827; font-weight:700;">Total</td>
            <td style="padding:10px 0 0; text-align:right; font-size:16px; color:#111827; font-weight:700;">${escapeHtml(
              params.total
            )}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center; margin-bottom:10px;">
        <a href="${escapeHtml(params.adminUrl)}" style="display:inline-block; padding:12px 18px; background:#111827; color:#ffffff; text-decoration:none; border-radius:12px; font-weight:700; font-size:14px; letter-spacing:0.02em;">View in Admin</a>
        ${stripeButton}
      </div>

      <div style="text-align:center; font-size:12px; color:#6b7280; line-height:1.6; margin-top:4px;">
        If this wasn’t you, you can safely ignore this email.
      </div>
    </div>
  </div>
  `;
}

export function renderOwnerNewSaleEmailText(params: OwnerNewSaleParams): string {
  const lines = [
    'NEW SALE — The Chesapeake Shell',
    `Order: ${params.orderNumber}`,
    `Type: ${params.orderTypeLabel}`,
    `Status: ${params.statusLabel}`,
    `Placed: ${params.orderDate}`,
    `Total: ${params.total}`,
    `Customer: ${params.customerName}`,
    params.customerEmail ? `Email: ${params.customerEmail}` : null,
    params.shippingAddressLine1 || params.shippingAddressLine2
      ? `Shipping: ${[params.shippingAddressLine1, params.shippingAddressLine2].filter(Boolean).join(', ')}`
      : 'Shipping: Not provided',
    '',
    'Items:',
    ...(params.items || []).map((item) => {
      const qty = item.qtyLabel ? ` (${item.qtyLabel})` : '';
      return `- ${item.name}${qty}: ${item.lineTotal}`;
    }),
    '',
    `Subtotal: ${params.subtotal}`,
    `Shipping: ${params.shipping}`,
    `Total: ${params.total}`,
    '',
    `Admin: ${params.adminUrl}`,
    params.stripeUrl ? `Stripe: ${params.stripeUrl}` : null,
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

