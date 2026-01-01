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
  const expected = env.ADMIN_PASSWORD ?? '';
  const provided = req.headers.get('x-admin-password') ?? '';
  const expectedNorm = expected.trim();
  const providedNorm = provided.trim();
  const shouldLog = opts?.log !== false;

  if (!expectedNorm) {
    if (shouldLog) {
      console.warn('[requireAdmin] missing env ADMIN_PASSWORD');
    }
    return json(
      {
        ok: false,
        code: 'UNAUTHORIZED',
        expectedLength: expected.length,
        providedLength: provided.length,
        hasExpected: false,
        hasProvided: !!providedNorm,
      },
      401
    );
  }

  if (!providedNorm) {
    if (shouldLog) {
      console.warn('[requireAdmin] missing header x-admin-password');
    }
    return json(
      {
        ok: false,
        code: 'UNAUTHORIZED',
        expectedLength: expected.length,
        providedLength: provided.length,
        hasExpected: true,
        hasProvided: false,
      },
      401
    );
  }

  if (providedNorm !== expectedNorm) {
    if (shouldLog) {
      console.warn(`[requireAdmin] password mismatch (expectedLen=${expected.length} providedLen=${provided.length})`);
    }
    return json(
      {
        ok: false,
        code: 'UNAUTHORIZED',
        expectedLength: expected.length,
        providedLength: provided.length,
        hasExpected: true,
        hasProvided: true,
      },
      401
    );
  }

  return null;
}
