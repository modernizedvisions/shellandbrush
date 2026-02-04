export function debugUploadsEnabled(): boolean {
  if (import.meta.env?.VITE_DEBUG_UPLOADS === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('debugUploads');
  } catch {
    return false;
  }
}

export function dlog(...args: unknown[]): void {
  if (!debugUploadsEnabled()) return;
  console.log('[UPLOAD-DEBUG]', ...args);
}

export function derr(...args: unknown[]): void {
  if (!debugUploadsEnabled()) return;
  console.error('[UPLOAD-DEBUG]', ...args);
}

export function maskLen(value?: string | null): number {
  if (!value) return 0;
  return value.length;
}

export function truncate(value: string, max = 800): string {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function isWwwHost(host: string): boolean {
  return host.toLowerCase().startsWith('www.');
}

export function formatUploadDebugError(err: unknown): string {
  const error = err as Error & { debug?: Record<string, unknown> };
  const debug = error?.debug ?? {};
  const url = typeof debug.url === 'string' ? debug.url : undefined;
  const status = typeof debug.status === 'number' ? debug.status : null;
  const statusText = typeof debug.statusText === 'string' ? debug.statusText : undefined;
  const responseText = typeof debug.responseText === 'string' ? debug.responseText : undefined;
  const name = error instanceof Error ? error.name : undefined;
  const message = error instanceof Error ? error.message : String(err);

  const parts: string[] = [];
  if (url) parts.push(`url=${url}`);
  if (status !== null && status !== undefined) {
    parts.push(`status=${status}${statusText ? ` ${statusText}` : ''}`);
  } else if (name) {
    parts.push(`error=${name}`);
  }
  if (responseText) parts.push(`response=${truncate(responseText)}`);
  if (parts.length > 0 && message) parts.push(`message=${message}`);

  return parts.filter(Boolean).join(' | ') || message || 'Upload failed.';
}
