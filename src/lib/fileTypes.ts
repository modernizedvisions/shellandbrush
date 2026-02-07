const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

const normalizeMime = (value: string) => {
  const lower = (value || '').trim().toLowerCase();
  if (lower === 'image/jpg') return 'image/jpeg';
  return lower;
};

export function getFileExtension(filename: string): string {
  const match = (filename || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

export function isAllowedImageFile(
  file: File
): { ok: boolean; reason?: string; normalizedMime?: string; code?: string } {
  const extension = getFileExtension(file?.name || '');
  if (extension && HEIC_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: "HEIC isn\u2019t supported. Export as JPG/PNG and retry.",
      code: 'FILE_TYPE_HEIC',
    };
  }

  const rawMime = normalizeMime(file?.type || '');
  const extensionAllowed = !!extension && ALLOWED_EXTENSIONS.has(extension);
  const mimeAllowed = !!rawMime && ALLOWED_MIME_TYPES.has(rawMime);

  if (!extensionAllowed && !mimeAllowed) {
    return {
      ok: false,
      reason: 'Unsupported file type. Use JPG/PNG/WEBP.',
      code: 'FILE_TYPE_BLOCKED',
    };
  }

  let normalizedMime: string | undefined;
  if (mimeAllowed) {
    normalizedMime = rawMime;
  } else if (extensionAllowed) {
    if (extension === 'jpg' || extension === 'jpeg') normalizedMime = 'image/jpeg';
    if (extension === 'png') normalizedMime = 'image/png';
    if (extension === 'webp') normalizedMime = 'image/webp';
  }

  return { ok: true, normalizedMime };
}
