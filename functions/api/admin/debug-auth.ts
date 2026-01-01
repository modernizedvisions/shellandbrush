type Env = {
  ADMIN_PASSWORD?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const normalizePassword = (value: string) => {
    let trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    return trimmed;
  };
  const expected = normalizePassword(env.ADMIN_PASSWORD ?? '');
  const provided = normalizePassword(request.headers.get('x-admin-password') ?? '');

  return new Response(
    JSON.stringify({
      envHasAdminPassword: expected.length > 0,
      envAdminPasswordLength: expected.length,
      headerHasPassword: provided.length > 0,
      headerPasswordLength: provided.length,
      matches: expected.length > 0 && expected === provided,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
