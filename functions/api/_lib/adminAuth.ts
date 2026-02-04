type Env = {
  ADMIN_PASSWORD?: string;
  DEBUG_UPLOADS?: string;
};

type RequireAdminOptions = {
  log?: boolean;
};

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const isDebugUploads = (req: Request, env: Env) => {
  const url = new URL(req.url);
  return url.searchParams.get('debug') === '1' || env.DEBUG_UPLOADS === '1' || env.DEBUG_UPLOADS === 'true';
};

const getRefererHost = (req: Request) => {
  const referer = req.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
};

const buildDebugFields = (req: Request) => ({
  debug: true,
  host: req.headers.get('host'),
  origin: req.headers.get('origin'),
  refererHost: getRefererHost(req),
  method: req.method,
  isOptions: req.method.toUpperCase() === 'OPTIONS',
  adminHeaderPresent: !!(req.headers.get('x-admin-password') || '').trim(),
  contentType: req.headers.get('content-type'),
  contentLength: req.headers.get('content-length'),
  requestId: req.headers.get('x-upload-request-id') || null,
});

export function requireAdmin(req: Request, env: Env, opts?: RequireAdminOptions): Response | null {
  const expected = env.ADMIN_PASSWORD ?? '';
  const provided = req.headers.get('x-admin-password') ?? '';
  const expectedNorm = expected.trim();
  const providedNorm = provided.trim();
  const shouldLog = opts?.log !== false;
  const debugEnabled = isDebugUploads(req, env);

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
        ...(debugEnabled ? buildDebugFields(req) : {}),
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
        ...(debugEnabled ? buildDebugFields(req) : {}),
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
        ...(debugEnabled ? buildDebugFields(req) : {}),
      },
      401
    );
  }

  return null;
}
