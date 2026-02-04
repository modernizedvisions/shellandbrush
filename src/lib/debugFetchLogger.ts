import { debugUploadsEnabled, truncate } from './debugUploads';

let installed = false;

const getRequestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
};

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.toString();
  return String(input);
};

const resolveUrl = (rawUrl: string): string => {
  if (typeof window === 'undefined') return rawUrl;
  try {
    return new URL(rawUrl, window.location.href).toString();
  } catch {
    return rawUrl;
  }
};

const isSameOriginApi = (rawUrl: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(rawUrl, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

export function installDebugFetchLogger(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  if (!debugUploadsEnabled()) return;
  if (typeof window.fetch !== 'function') return;

  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = getRequestMethod(input, init);
    const rawUrl = getRequestUrl(input);
    const url = resolveUrl(rawUrl);
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const response = await originalFetch(input, init);
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = Math.round(end - start);
      console.log(`[UPLOAD-DEBUG-FETCH] ${method} ${url} -> ${response.status} (${duration}ms)`);

      if (!response.ok && isSameOriginApi(rawUrl)) {
        const text = await response.clone().text().catch(() => '');
        const snippet = text ? truncate(text) : '(empty)';
        console.warn(
          `[UPLOAD-DEBUG-FETCH] ${method} ${url} -> ${response.status} response: ${snippet}`
        );
      }

      return response;
    } catch (err) {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const duration = Math.round(end - start);
      const name = err instanceof Error ? err.name : 'Error';
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[UPLOAD-DEBUG-FETCH] ERROR ${method} ${url}: ${name} ${message} (${duration}ms)`);
      throw err;
    }
  };
}
