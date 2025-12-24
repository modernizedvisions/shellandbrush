import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type MessageRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  status?: string | null;
};

export async function onRequestGet(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  const db = context.env.DB;

  try {
    let result;
    try {
      result = await db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all<MessageRow>();
    } catch {
      result = await db.prepare('SELECT * FROM messages ORDER BY id DESC').all<MessageRow>();
    }

    const rows = result.results ?? [];
    const messages = rows.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      email: row.email ?? '',
      message: row.message ?? '',
      imageUrl: row.image_url ?? row.imageUrl ?? null,
      createdAt: row.created_at ?? row.createdAt ?? '',
      status: row.status ?? 'new',
    }));

    console.log('[/api/admin/messages] loaded messages count', messages.length);

    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/admin/messages] error loading messages', err);
    return new Response(JSON.stringify({ error: 'Failed to load messages' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
