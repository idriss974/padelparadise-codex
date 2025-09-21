import { StringDecoder } from 'node:string_decoder';

export function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.split('=');
    if (!key) {
      return acc;
    }
    acc[key.trim()] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

export async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve({});
      return;
    }

    const decoder = new StringDecoder('utf8');
    let buffer = '';

    req.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      buffer += decoder.end();
      if (!buffer) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(buffer);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

export function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendText(res, statusCode, text, headers = {}) {
  const body = text || '';
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

export function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  else parts.push('SameSite=Lax');
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  else parts.push('Path=/');
  if (options.secure) parts.push('Secure');

  const headerValue = parts.join('; ');
  res.setHeader('Set-Cookie', headerValue);
}

export function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax', path: '/' });
}

export function getQueryParams(url) {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return {};
  const queryString = url.substring(queryIndex + 1);
  return Object.fromEntries(new URLSearchParams(queryString));
}

export function toISODate(date = new Date()) {
  return new Date(date).toISOString();
}

export function padelPriceForSlot(startHour, durationMinutes) {
  const slots = [];
  const start = startHour;
  const durationHours = durationMinutes / 60;
  const end = start + durationHours;
  let total = 0;
  for (let hour = start; hour < end; hour += 0.5) {
    const effectiveHour = Math.floor(hour);
    const minute = hour % 1 !== 0 ? 30 : 0;
    const isPeak = effectiveHour >= 17 && effectiveHour < 20;
    const rate = isPeak ? 32 : 24;
    total += rate / 2; // half hour increments
    slots.push({ hour: effectiveHour, minute, rate });
  }
  return { total: Number(total.toFixed(2)), slots };
}

export function formatTimeLabel(hour, minute = 0) {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${h}h${m}`;
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}
