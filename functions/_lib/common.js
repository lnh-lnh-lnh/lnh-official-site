export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

export const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

export const sameOrigin = request => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};
export const requireAdmin = (request, env) => {
  const email = clean(request.headers.get('Cf-Access-Authenticated-User-Email'), 254).toLowerCase();
  const allowed = clean(env.ADMIN_EMAILS || 'info@lnh-universe.com', 2000)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email));
};
export const hashToken = async token => {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
