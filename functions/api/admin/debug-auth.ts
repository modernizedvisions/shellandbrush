type Env = {
  ADMIN_PASSWORD?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const expected = env.ADMIN_PASSWORD ?? '';
  const provided = request.headers.get('x-admin-password') ?? '';
  const expectedTrimmed = expected.trim();
  const providedTrimmed = provided.trim();

  return new Response(
    JSON.stringify({
      ok: true,
      envHasAdminPassword: expected.length > 0,
      envAdminPasswordLength: expected.length,
      envAdminPasswordTrimmedLength: expectedTrimmed.length,
      headerHasPassword: provided.length > 0,
      headerPasswordLength: provided.length,
      headerPasswordTrimmedLength: providedTrimmed.length,
      matches: expectedTrimmed.length > 0 && expectedTrimmed === providedTrimmed,
      notes: [
        'If envHasAdminPassword=false in local dev, you are not running wrangler pages dev with .dev.vars',
        'If trimmed lengths differ, you have whitespace/quotes/newlines in the stored value',
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
