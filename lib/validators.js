const EMAIL_REGEX = /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/i;

export function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

export function sanitizeString(value, fallback = '') {
  if (!value) return fallback;
  return String(value).trim();
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isIsoDate(value) {
  return !Number.isNaN(Date.parse(value));
}
