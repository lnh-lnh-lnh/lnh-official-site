export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  }
});

export const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

export const readJson = async (request, maxBytes = 32768) => {
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    const error = new Error('JSON 요청만 허용됩니다.');
    error.status = 415;
    throw error;
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    const error = new Error('요청 내용이 너무 큽니다.');
    error.status = 413;
    throw error;
  }

  const raw = await request.text();
  if (encoder.encode(raw).byteLength > maxBytes) {
    const error = new Error('요청 내용이 너무 큽니다.');
    error.status = 413;
    throw error;
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    const error = new Error('JSON 형식을 확인해 주세요.');
    error.status = 400;
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('요청 형식을 확인해 주세요.');
    error.status = 400;
    throw error;
  }
  return value;
};

export const getCookie = (request, name) => {
  const value = request.headers.get('cookie') || '';
  const match = value.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

export const sameOrigin = request => {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
};
const accessIdentity = (request, env) => {
  const email = clean(request.headers.get('Cf-Access-Authenticated-User-Email'), 254).toLowerCase();
  const allowed = clean(env.ADMIN_EMAILS || 'info@lnh-universe.com', 2000)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return email && allowed.includes(email) ? { id: `access:${email}`, method: 'email' } : null;
};

export const requireAdmin = async (request, env) => {
  const access = accessIdentity(request, env);
  if (access) return access;
  if (!env.DB) return null;
  const token = getCookie(request, 'LNH_ADMIN_SESSION');
  if (!token || token.length < 40) return null;
  const tokenHash = await hashToken(token);
  const session = await env.DB.prepare('SELECT id, expires_at FROM admin_sessions WHERE token_hash=?').bind(tokenHash).first();
  if (!session || Date.parse(session.expires_at) <= Date.now()) return null;
  return { id: session.id, method: 'password' };
};
export const hashToken = async token => {
  const bytes = encoder.encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return hex(digest);
};

export const derivePasswordHash = async (password, salt, iterations = 100000) => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, material, 256);
  return hex(bits);
};

export const constantTimeEqual = (left, right) => {
  const a = encoder.encode(left || '');
  const b = encoder.encode(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const recordAdminActivity = async (env, admin, eventName, targetId = '') => {
  if (!env.DB || !admin) return;
  await env.DB.prepare('INSERT INTO admin_access_logs (id, session_id, method, event_name, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(randomToken(), admin.id, admin.method, clean(eventName, 80), clean(targetId, 100), new Date().toISOString()).run();
};

export const verifyTurnstile = async (request, env, token) => {
  const siteKey = clean(env.TURNSTILE_SITE_KEY, 200);
  const secretKey = clean(env.TURNSTILE_SECRET_KEY, 500);
  if (!siteKey && !secretKey) return true;
  if (!siteKey || !secretKey) return false;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secretKey);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const result = await response.json();
  return Boolean(result.success);
};
