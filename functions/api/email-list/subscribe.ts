type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  all<T>(): Promise<{ results?: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type EmailListEnv = {
  DB: D1Database;
};

type EmailListInput = {
  email?: string;
};

type EmailListRow = {
  id: string;
  email: string;
  created_at?: string | null;
  createdAt?: string | null;
};

export async function onRequestPost(context: { env: EmailListEnv; request: Request }): Promise<Response> {
  try {
    await ensureEmailListSchema(context.env.DB);
    const body = (await context.request.json().catch(() => null)) as EmailListInput | null;
    const email = (body?.email ?? '').trim().toLowerCase();

    if (!email) {
      return jsonResponse({ success: false, error: 'Email is required.' }, 400);
    }
    if (email.length > 254) {
      return jsonResponse({ success: false, error: 'Email is too long (max 254 characters).' }, 400);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ success: false, error: 'Please enter a valid email address.' }, 400);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await context.env.DB.prepare(
      `INSERT OR IGNORE INTO email_list (id, email, created_at)
       VALUES (?, ?, ?)`
    ).bind(id, email, createdAt).run();

    const result = await context.env.DB.prepare(
      `SELECT id, email, created_at FROM email_list WHERE email = ?`
    ).bind(email).all<EmailListRow>();

    const row = result.results?.[0];
    const storedId = row?.id || id;
    const storedCreatedAt = row?.created_at ?? row?.createdAt ?? createdAt;
    const alreadySubscribed = !!row && row.id !== id;

    return jsonResponse({
      success: true,
      alreadySubscribed,
      signup: {
        id: storedId,
        email,
        createdAt: storedCreatedAt,
      },
    });
  } catch (err) {
    console.error('[email-list] Error handling signup', err);
    return jsonResponse({ success: false, error: 'Server error saving signup.' }, 500);
  }
}

async function ensureEmailListSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_list (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_created_at ON email_list(created_at);`).run();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function isValidEmail(value: string): boolean {
  if (!value || value.length > 254) return false;
  const at = value.indexOf('@');
  if (at < 1 || at === value.length - 1) return false;
  const domain = value.slice(at + 1);
  if (!domain.includes('.')) return false;
  return !/\s/.test(value);
}
