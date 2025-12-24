import { requireAdmin } from '../../../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  RESEND_OWNER_TO?: string;
  RESEND_REPLY_TO?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_IMAGES_API_TOKEN?: string;
  PUBLIC_IMAGES_BASE_URL?: string;
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
};

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  let tables: string[] = [];
  let canConnect = false;
  try {
    const { results } = await context.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    ).all<{ name: string }>();
    tables = (results || []).map((row) => row.name);
    canConnect = true;
  } catch {
    canConnect = false;
    tables = [];
  }

  const hasR2Binding = !!context.env.IMAGES_BUCKET || !!context.env.MV_IMAGES;
  const hasCloudflareImagesConfig = !!context.env.CLOUDFLARE_ACCOUNT_ID && !!context.env.CLOUDFLARE_IMAGES_API_TOKEN;
  const modeDetected = hasR2Binding ? 'r2' : hasCloudflareImagesConfig ? 'cloudflare-images' : 'unknown';

  const body = {
    ok: true,
    env: {
      hasAdminPassword: !!context.env.ADMIN_PASSWORD,
      hasStripeSecretKey: !!context.env.STRIPE_SECRET_KEY,
      hasStripeWebhookSecret: !!context.env.STRIPE_WEBHOOK_SECRET,
      hasResendApiKey: !!context.env.RESEND_API_KEY,
      hasResendFrom: !!context.env.RESEND_FROM,
      hasResendOwnerTo: !!context.env.RESEND_OWNER_TO,
      hasResendReplyTo: !!context.env.RESEND_REPLY_TO,
      hasPublicSiteUrl: !!context.env.PUBLIC_SITE_URL,
      hasVitePublicSiteUrl: !!context.env.VITE_PUBLIC_SITE_URL,
      hasCloudflareAccountId: !!context.env.CLOUDFLARE_ACCOUNT_ID,
      hasCloudflareImagesToken: !!context.env.CLOUDFLARE_IMAGES_API_TOKEN,
      hasPublicImagesBaseUrl: !!context.env.PUBLIC_IMAGES_BASE_URL,
    },
    db: {
      canConnect,
      tables,
    },
    uploads: {
      modeDetected,
      hasR2Binding,
      hasCloudflareImagesConfig,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
