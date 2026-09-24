export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

export const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

export const getCookie = (request, name) => {
  const value = request.headers.get('cookie') || '';
  const match = value.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

export const sameOrigin = request => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
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

export const derivePasswordHash = async (password, salt) => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 210000 }, material, 256);
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
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const result = await response.json();
  return Boolean(result.success);
};
