type Env = {
  ADMIN_PASSWORD?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const expected = (env.ADMIN_PASSWORD ?? '').trim();
  const provided = (request.headers.get('x-admin-password') ?? '').trim();

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
