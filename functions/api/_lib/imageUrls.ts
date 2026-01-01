export function isBlockedImageUrl(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 2000) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:');
}

export function resolvePublicImageUrl(
  publicUrl?: string | null,
  storageKey?: string | null,
  baseUrl?: string
): string {
  if (publicUrl && /^https?:\/\//i.test(publicUrl)) return publicUrl;
  if (storageKey && baseUrl) return `${baseUrl}/${storageKey}`;
  return publicUrl || '';
}
