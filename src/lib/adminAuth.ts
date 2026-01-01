export type AdminAuthStatus = {
  envHasAdminPassword: boolean;
  envAdminPasswordLength: number;
  headerHasPassword: boolean;
  headerPasswordLength: number;
  matches: boolean;
  status: number;
};

const ADMIN_PASSWORD_KEY = 'admin_password';

// Local dev: run Cloudflare Pages Functions with `wrangler pages dev --proxy 5173`
// and provide `.dev.vars` with ADMIN_PASSWORD=... (plus PUBLIC_IMAGES_BASE_URL).

export function getStoredAdminPassword(): string {
  try {
    return localStorage.getItem(ADMIN_PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAdminPassword(password: string): void {
  try {
    localStorage.setItem(ADMIN_PASSWORD_KEY, password.trim());
  } catch {
    // Ignore storage failures (private mode, etc.)
  }
}

export function clearStoredAdminPassword(): void {
  try {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const password = getStoredAdminPassword();
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined)
  );

  if (password) {
    headers.set('x-admin-password', password);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    const text = await response.clone().text().catch(() => '');
    const url = input instanceof Request ? input.url : String(input);
    console.error('[admin] unauthorized', { url, status: response.status, bodyText: text });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('admin-auth-failed', {
          detail: { url, status: response.status, bodyText: text },
        })
      );
    }
  }
  return response;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const trimmed = password.trim();
  if (!trimmed) return false;
  const response = await fetch('/api/admin/debug-auth', {
    headers: { 'x-admin-password': trimmed },
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return !!data?.matches;
}

export async function getAdminAuthStatus(password?: string): Promise<AdminAuthStatus> {
  const trimmed = (password ?? getStoredAdminPassword()).trim();
  const headers = trimmed ? { 'x-admin-password': trimmed } : undefined;
  const response = await fetch('/api/admin/debug-auth', { headers });
  const data = await response.json().catch(() => ({}));
  return {
    envHasAdminPassword: !!data.envHasAdminPassword,
    envAdminPasswordLength: Number(data.envAdminPasswordLength) || 0,
    headerHasPassword: !!data.headerHasPassword,
    headerPasswordLength: Number(data.headerPasswordLength) || 0,
    matches: !!data.matches,
    status: response.status,
  };
}
