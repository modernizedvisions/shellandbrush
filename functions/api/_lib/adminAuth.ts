type Env = {
  ADMIN_PASSWORD?: string;
};

type RequireAdminOptions = {
  log?: boolean;
};

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function requireAdmin(req: Request, env: Env, opts?: RequireAdminOptions): Response | null {
  const expected = (env.ADMIN_PASSWORD ?? '').trim();
  const provided = (req.headers.get('x-admin-password') ?? '').trim();
  const shouldLog = opts?.log !== false;

  if (!expected) {
    if (shouldLog) {
      console.warn('[requireAdmin] missing env ADMIN_PASSWORD');
    }
    return json({ error: 'Admin not configured' }, 401);
  }

  if (!provided) {
    if (shouldLog) {
      console.warn('[requireAdmin] missing header x-admin-password');
    }
    return json({ error: 'Unauthorized' }, 401);
  }

  if (provided !== expected) {
    if (shouldLog) {
      console.warn(
        `[requireAdmin] password mismatch (expectedLen=${expected.length} providedLen=${provided.length})`
      );
    }
    return json({ error: 'Unauthorized' }, 401);
  }

  return null;
}
