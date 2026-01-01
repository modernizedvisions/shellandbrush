type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const createSiteConfigTable = `
  CREATE TABLE IF NOT EXISTS site_config (
    id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return json({ ok: false, error: 'missing_d1_binding', table: 'site_config', row: null }, 500);
  }
  try {
    await db.prepare(createSiteConfigTable).run();
    const row = await db
      .prepare(`SELECT id, config_json, updated_at FROM site_config WHERE id = ?;`)
      .bind('home')
      .first<{ id: string; config_json: string | null; updated_at: string | null }>();

    return json(
      {
        ok: true,
        table: 'site_config',
        row,
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: 'db_query_failed', message, table: 'site_config', row: null }, 500);
  }
}
