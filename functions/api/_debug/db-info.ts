type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
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

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return json({ ok: false, error: 'missing_d1_binding', tables: [], productColumns: [] }, 500);
  }
  try {
    const { results: tableRows } = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC;`)
      .all<{ name: string }>();
    const tables = (tableRows || []).map((row) => row.name);
    const { results: productColumns } = await db
      .prepare(`PRAGMA table_info(products);`)
      .all<{ name: string }>();
    const productColumnNames = (productColumns || []).map((row) => row.name);

    return json(
      {
        ok: true,
        tables,
        productColumns: productColumnNames,
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: 'db_query_failed', message, tables: [], productColumns: [] }, 500);
  }
}
