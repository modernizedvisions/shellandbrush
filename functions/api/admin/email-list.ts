import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type EmailListRow = {
  id: string;
  email: string;
  created_at?: string | null;
  createdAt?: string | null;
};

export async function onRequestGet(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  try {
    const result = await context.env.DB.prepare(
      'SELECT id, email, created_at FROM email_list ORDER BY created_at DESC'
    ).all<EmailListRow>();
    const rows = result.results ?? [];
    const signups = rows.map((row) => ({
      id: row.id,
      email: row.email ?? '',
      createdAt: row.created_at ?? row.createdAt ?? '',
    }));

    return new Response(JSON.stringify({ signups }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/admin/email-list] error loading signups', err);
    return new Response(JSON.stringify({ error: 'Failed to load email list' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
