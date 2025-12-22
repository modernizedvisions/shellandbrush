type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CustomOrderPayload = {
  customerName?: string;
  customerEmail?: string;
  description?: string;
  amount?: number | null;
  messageId?: string | null;
  status?: 'pending' | 'paid';
  paymentLink?: string | null;
};

export async function onRequestPatch(context: { env: { DB: D1Database }; request: Request; params: Record<string, string> }): Promise<Response> {
  try {
    await ensureCustomOrdersSchema(context.env.DB);
    const columns = await getCustomOrdersColumns(context.env.DB);
    const emailCol = columns.emailCol;
    console.log('[custom-orders/:id] ensured schema (patch)', { columns: columns.allColumns, emailCol });
    const id = context.params?.id;
    if (!id) return jsonResponse({ error: 'Missing id' }, 400);

    const body = (await context.request.json().catch(() => null)) as Partial<CustomOrderPayload> | null;
    if (!body) return jsonResponse({ error: 'Invalid body' }, 400);

    const existing = await context.env.DB
      .prepare(`SELECT id FROM custom_orders WHERE id = ?`)
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.customerName !== undefined) {
      fields.push('customer_name = ?');
      values.push(body.customerName.trim());
    }
    if (body.customerEmail !== undefined) {
      if (emailCol) {
        fields.push(`${emailCol} = ?`);
        values.push(body.customerEmail.trim());
      } else {
        console.warn('[custom-orders/:id] no email column found; skipping email update');
      }
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description.trim());
    }
    if (body.amount !== undefined) {
      fields.push('amount = ?');
      values.push(body.amount);
    }
    if (body.messageId !== undefined) {
      fields.push('message_id = ?');
      values.push(body.messageId);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status === 'paid' ? 'paid' : 'pending');
    }
    if (body.paymentLink !== undefined) {
      fields.push('payment_link = ?');
      values.push(body.paymentLink);
    }

    if (!fields.length) return jsonResponse({ error: 'No fields to update' }, 400);

    const stmt = context.env.DB.prepare(
      `UPDATE custom_orders SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id);

    const result = await stmt.run();
    if (!result.success) {
      console.error('Failed to update custom order', result.error);
      return jsonResponse({ error: 'Failed to update custom order', detail: result.error || 'unknown error' }, 500);
    }

    // TODO: Add Stripe reconciliation when payments are wired.
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Failed to update custom order', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Failed to update custom order', detail: message }, 500);
  }
}

async function ensureCustomOrdersSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_orders (
    id TEXT PRIMARY KEY,
    display_custom_order_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    description TEXT,
    amount INTEGER,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    payment_link TEXT,
    paid_at TEXT,
    shipping_name TEXT,
    shipping_line1 TEXT,
    shipping_line2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_postal_code TEXT,
    shipping_country TEXT,
    shipping_phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  const hasDisplayId = names.includes('display_custom_order_id');
  if (!hasDisplayId) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN display_custom_order_id TEXT;`).run();
  }
  if (!names.includes('paid_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN paid_at TEXT;`).run();
  }
  const shippingCols = [
    'shipping_name',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
    'shipping_phone',
  ];
  for (const col of shippingCols) {
    if (!names.includes(col)) {
      await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
    }
  }

  await db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_orders_display_id ON custom_orders(display_custom_order_id);`
  ).run();
}

async function getCustomOrdersColumns(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const allColumns = (results || []).map((c) => c.name);
  const emailCol = allColumns.includes('customer_email')
    ? 'customer_email'
    : allColumns.includes('customer_email1')
    ? 'customer_email1'
    : null;
  return { allColumns, emailCol };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });
}
