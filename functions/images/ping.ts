export async function onRequestGet(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, route: '/images/ping' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
