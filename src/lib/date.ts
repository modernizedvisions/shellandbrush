const EASTERN_TIME_ZONE = 'America/New_York';

const toDate = (value?: string | number | Date | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
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
