export type CustomOrderPaymentLinkEmailParams = {
  brandName: string;
  orderLabel?: string | null;
  ctaUrl: string;
  amountCents: number;
  currency?: string | null;
  shippingCents?: number | null;
  thumbnailUrl?: string | null;
  description?: string | null;
};

export function renderCustomOrderPaymentLinkEmailHtml(
  params: CustomOrderPaymentLinkEmailParams
): string {
  const brand = params.brandName || 'Order';
  const orderLabel = params.orderLabel || '';
  const showOrderLabel = !!orderLabel;
  const baseFont = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const baseColor = '#111827';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';
  const shippingCents =
    Number.isFinite(params.shippingCents as number) && (params.shippingCents as number) >= 0
      ? Number(params.shippingCents)
      : 0;
  const subtotalCents = Number.isFinite(params.amountCents as number) ? Number(params.amountCents) : 0;
  const totalCents = subtotalCents + shippingCents;
  const itemLabel = params.orderLabel ? `Custom Order ${params.orderLabel}` : 'Custom Order';
  const note = (params.description || '').trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#ffffff; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; }
    body, table, td, a, p, div, span { font-family:${baseFont}; }
    .container { width:100%; background:#ffffff; }
    .inner { width:600px; max-width:600px; }
    .items-table { width:100%; table-layout:fixed; }
    .pad { padding:32px 16px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; }
    .subtitle { font-size:14px; color:${mutedColor}; margin:8px 0 0; }
    .button { display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; }
    .subhead { font-size:14px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:12px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-text { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-desc { font-size:13px; color:${mutedColor}; margin-top:4px; line-height:1.5; font-weight:400; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-desc { font-size:13px; color:${mutedColor}; margin-top:4px; line-height:1.5; font-weight:400; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .footer { padding-top:16px; font-size:12px; color:${mutedColor}; }
  </style>
</head>
<body>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" class="pad">
        <table role="presentation" class="inner" width="600" cellspacing="0" cellpadding="0">
          <tr>
            <td class="section brand">${escapeHtml(brand)}</td>
            <td class="section order-label" align="right" style="white-space:nowrap;">${showOrderLabel ? `ORDER # ${escapeHtml(orderLabel)}` : ''}</td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="title">Click the link below for your custom order!</p>
              <a href="${escapeHtml(params.ctaUrl)}" class="button" style="display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff !important; text-decoration:none !important; border-radius:9999px; font-size:14px; font-weight:600;">Pay Now</a>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="subhead">Order summary</p>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <table role="presentation" class="items-table" cellspacing="0" cellpadding="0">
                <tr class="item-row">
                  <td style="padding:16px 0; vertical-align:top;">
                    <div class="item-name">${escapeHtml(itemLabel)}</div>
                    ${note ? `<div class="item-desc">${escapeHtml(note)}</div>` : ''}
                  </td>
                  <td class="item-price" align="right" style="padding:16px 0; vertical-align:top; white-space:nowrap; width:120px;">
                    ${formatMoney(subtotalCents)}
                  </td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Subtotal</td>
                  <td class="totals-value" align="right">${formatMoney(subtotalCents)}</td>
                </tr>
                <tr>
                  <td class="totals-label" align="right">Shipping</td>
                  <td class="totals-value" align="right">${formatMoney(shippingCents)}</td>
                </tr>
                <tr class="total-row">
                  <td align="right">Total</td>
                  <td align="right">${formatMoney(totalCents)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer" colspan="2">If you have any questions, reply to this email.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderCustomOrderPaymentLinkEmailText(
  params: CustomOrderPaymentLinkEmailParams
): string {
  const shippingCents =
    Number.isFinite(params.shippingCents as number) && (params.shippingCents as number) >= 0
      ? Number(params.shippingCents)
      : 0;
  const subtotalCents = Number.isFinite(params.amountCents as number) ? Number(params.amountCents) : 0;
  const totalCents = subtotalCents + shippingCents;
  const lines = [
    `${params.brandName || 'The Chesapeake Shell'} Custom Order Payment`,
    params.orderLabel ? `Order: ${params.orderLabel}` : null,
    params.description ? `Details: ${params.description}` : null,
    `Subtotal: ${formatMoney(subtotalCents)}`,
    `Shipping: ${formatMoney(shippingCents)}`,
    `Total: ${formatMoney(totalCents)}`,
    '',
    `Pay Now: ${params.ctaUrl}`,
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
