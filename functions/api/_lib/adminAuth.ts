type Env = {
  ADMIN_PASSWORD?: string;
};

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export function requireAdmin(req: Request, env: Env): Response | null {
  const expected = env.ADMIN_PASSWORD || '';
  if (!expected) {
    return json({ error: 'ADMIN_PASSWORD not configured' }, 500);
  }

  const provided = req.headers.get('x-admin-password') || '';
  if (!provided || provided !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return null;
}