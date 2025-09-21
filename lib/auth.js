import crypto from 'node:crypto';
import { setCookie, clearCookie } from './utils.js';

const TOKEN_NAME = 'padel_session';
const TOKEN_TTL_SECONDS = 60 * 60 * 4; // 4 hours

const APP_SECRET = process.env.APP_SECRET || 'padel-paradise-secret-key';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password, salt) {
  const hashed = crypto.scryptSync(password, salt, 64);
  return hashed.toString('hex');
}

export function verifyPassword(password, storedHash, salt) {
  const hash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function signToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tokenPayload = { ...payload, exp };
  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(tokenPayload));
  const signature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEncoded, payloadEncoded, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export function attachSessionCookie(res, sessionPayload) {
  const token = signToken(sessionPayload);
  setCookie(res, TOKEN_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function revokeSession(res) {
  clearCookie(res, TOKEN_NAME);
}

export function getTokenFromCookies(cookies = {}) {
  return cookies[TOKEN_NAME];
}

export function getSessionDuration() {
  return TOKEN_TTL_SECONDS;
}
