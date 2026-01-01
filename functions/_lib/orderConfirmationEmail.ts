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
  billingAddress?: string | null;
  paymentMethod?: string | null;
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
  const shippingAddress = params.shippingAddress || '';
  const billingAddress = params.billingAddress || '';
  const paymentMethod = params.paymentMethod || 'Card';
  const primaryCtaLabel = params.primaryCtaLabel || 'View Order Details';
  const baseFont = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const baseColor = '#111827';
  const mutedColor = '#6b7280';
  const borderColor = '#e5e7eb';

  const itemRows =
    (params.items || [])
      .map((item) => {
        const qty = item.qty && item.qty > 1 ? `x ${item.qty}` : '';
        const imageMarkup = item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="56" height="56" class="item-img" />`
          : '<span class="item-placeholder"></span>';
        return `
      <tr class="item-row">
        <td class="item-info">
          <span class="item-media">${imageMarkup}</span>
          <span class="item-text">
            <span class="item-name">${escapeHtml(item.name)}${qty ? ` <span class="item-qty">${escapeHtml(qty)}</span>` : ''}</span>
          </span>
        </td>
        <td class="item-price" align="right">${formatMoney(item.lineTotal)}</td>
      </tr>
    `;
      })
      .join('') ||
    `
      <tr>
        <td class="item-empty" colspan="2">No items found.</td>
      </tr>
    `;

  const totalsRows = `
      <tr>
        <td class="totals-label" align="right">Subtotal</td>
        <td class="totals-value" align="right">${formatMoney(params.subtotal)}</td>
      </tr>
      <tr>
        <td class="totals-label" align="right">Shipping</td>
        <td class="totals-value" align="right">${formatMoney(params.shipping)}</td>
      </tr>
      <tr class="total-row">
        <td align="right">Total</td>
        <td align="right">${formatMoney(params.total)}</td>
      </tr>
    `;

  const shippingLines = formatAddressLines(shippingAddress);
  const billingLines = formatAddressLines(billingAddress);
  const shippingBlock = shippingLines.length
    ? renderAddressLines(shippingLines)
    : 'Not provided';
  const billingBlock = billingLines.length
    ? renderAddressLines(billingLines)
    : shippingLines.length
    ? 'Same as shipping'
    : 'Not provided';

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
    .pad { padding:32px 16px; }
    .section { padding-bottom:24px; }
    .brand { font-size:20px; font-weight:600; color:${baseColor}; }
    .order-label { font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; white-space:nowrap; }
    .title { font-size:28px; font-weight:600; color:${baseColor}; margin:0 0 6px; }
    .button { display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff; text-decoration:none; border-radius:9999px; font-size:14px; font-weight:600; }
    .subhead { font-size:14px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 8px; }
    .item-row td { padding:12px 0; border-bottom:1px solid #ededed; vertical-align:top; }
    .item-info { width:100%; }
    .item-media { display:inline-block; width:56px; height:56px; vertical-align:top; }
    .item-text { display:inline-block; vertical-align:top; margin-left:12px; max-width:420px; }
    .item-img { width:56px; height:56px; border:1px solid ${borderColor}; object-fit:cover; display:block; }
    .item-placeholder { width:56px; height:56px; border:1px solid ${borderColor}; background:#f3f4f6; display:block; }
    .item-name { font-size:16px; font-weight:600; color:${baseColor}; }
    .item-qty { font-size:13px; font-weight:500; color:${mutedColor}; }
    .item-price { font-size:15px; font-weight:600; color:${baseColor}; white-space:nowrap; }
    .item-empty { padding:12px 0; font-size:14px; color:${mutedColor}; }
    .totals-label { padding:4px 0; font-size:14px; color:${mutedColor}; }
    .totals-value { padding:4px 0; font-size:14px; color:${baseColor}; font-weight:600; }
    .total-row td { padding-top:10px; font-size:16px; font-weight:700; color:${baseColor}; }
    .info-title { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:${mutedColor}; margin:0 0 6px; white-space:nowrap; }
    .info { font-size:14px; color:${baseColor}; line-height:1.5; margin:0; }
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
            <td class="section order-label" align="right" style="white-space:nowrap;">ORDER # ${escapeHtml(orderLabel)}</td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="title">Thank you for your purchase!</p>
              <a href="${escapeHtml(params.primaryCtaUrl)}" class="button" style="display:inline-block; padding:12px 20px; background:${baseColor}; color:#ffffff !important; text-decoration:none !important; border-radius:9999px; font-size:14px; font-weight:600;">${escapeHtml(primaryCtaLabel)}</a>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="subhead">Order summary</p>
            </td>
          </tr>
          ${itemRows}
          ${totalsRows}
          <tr>
            <td class="section" colspan="2" style="padding-top:12px;">
              <p class="subhead">Customer information</p>
            </td>
          </tr>
          <tr>
            <td class="section" style="width:50%; vertical-align:top; padding-right:16px;">
              <p class="info-title" style="white-space:nowrap;">Shipping address</p>
              <p class="info">${shippingBlock}</p>
            </td>
            <td class="section" style="width:50%; vertical-align:top; padding-left:16px;">
              <p class="info-title" style="white-space:nowrap;">Billing address</p>
              <p class="info">${billingBlock}</p>
            </td>
          </tr>
          <tr>
            <td class="section" colspan="2">
              <p class="info-title">Payment method</p>
              <p class="info">${escapeHtml(paymentMethod)}</p>
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

export function renderOrderConfirmationEmailText(params: OrderConfirmationEmailParams): string {
  const primaryCtaLabel = params.primaryCtaLabel || 'Visit Store';
  const lines = [
    `${params.brandName || 'Order'} - Order Confirmed`,
    `Order: ${params.orderNumber || ''}`.trim(),
    `Placed: ${params.orderDate || ''}`.trim(),
    `Customer: ${params.customerName || 'Customer'}`,
    params.customerEmail ? `Email: ${params.customerEmail}` : null,
    params.shippingAddress ? `Shipping: ${params.shippingAddress}` : 'Shipping: Not provided',
    params.billingAddress ? `Billing: ${params.billingAddress}` : 'Billing: Same as shipping',
    params.paymentMethod ? `Payment: ${params.paymentMethod}` : 'Payment: Card',
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
    'If you have any questions, reply to this email.',
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

function formatAddressLines(value: string) {
  if (!value) return [];
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderAddressLines(lines: string[]) {
  return lines.map((line) => escapeHtml(line)).join('<br/>');
}
