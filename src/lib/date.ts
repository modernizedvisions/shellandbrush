const EASTERN_TIME_ZONE = 'America/New_York';

const hasTimezoneSuffix = (value: string) =>
  /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);

const normalizeDateString = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  return hasTimezoneSuffix(normalized) ? normalized : `${normalized}Z`;
};

const toDate = (value?: string | number | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  const raw = typeof value === 'string' ? normalizeDateString(value) : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatDateTimeEastern = (value?: string | number | Date | null): string => {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatDateEastern = (value?: string | number | Date | null): string => {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    dateStyle: 'medium',
  }).format(date);
};
