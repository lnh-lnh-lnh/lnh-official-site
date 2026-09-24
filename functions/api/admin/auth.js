import { clean, constantTimeEqual, derivePasswordHash, getCookie, hashToken, json, randomToken, recordAdminActivity, requireAdmin, sameOrigin } from '../../_lib/common.js';

const SESSION_COOKIE = 'LNH_ADMIN_SESSION';
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const SESSION_MS = 8 * 60 * 60 * 1000;

const ensureAdminTables = env => env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_login_attempts (id TEXT PRIMARY KEY, attempt_key_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_key_created ON admin_login_attempts(attempt_key_hash, created_at DESC)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_access_logs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, method TEXT NOT NULL, event_name TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_access_logs_created_at ON admin_access_logs(created_at DESC)')
]);

const cookie = (value, seconds) => `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;

const loginAttemptKey = async (request, env) => {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const salt = env.ADMIN_LOGIN_RATE_SALT || env.ADMIN_PASSWORD_SALT || 'lnh-admin-rate-limit';
  return hashToken(`${salt}:${ip}`);
};

const logAttempt = async (env, key, result) => {
  await env.DB.prepare('INSERT INTO admin_login_attempts (id, attempt_key_hash, result, created_at) VALUES (?, ?, ?, ?)')
    .bind(randomToken(), key, result, new Date().toISOString()).run();
};

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  return json({ authenticated: Boolean(admin), method: admin?.method || null });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT) {
    return json({ error: '관리자 비밀번호 설정이 아직 완료되지 않았습니다.' }, 503);
  }

  try {
    await ensureAdminTables(env);
  } catch {
    return json({ error: '관리자 로그인 준비에 문제가 있습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }

  let payload;
  try { payload = await request.json(); } catch { return json({ error: '로그인 정보를 확인해 주세요.' }, 400); }
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!password || password.length > 512) return json({ error: '로그인 정보를 확인해 주세요.' }, 400);

  const now = new Date();
  const cutoff = new Date(now.getTime() - LOCK_WINDOW_MS).toISOString();
  const key = await loginAttemptKey(request, env);
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE created_at<?').bind(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()).run();
  await env.DB.prepare('DELETE FROM admin_access_logs WHERE created_at<?').bind(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()).run();
  const failures = await env.DB.prepare("SELECT COUNT(*) total FROM admin_login_attempts WHERE attempt_key_hash=? AND result='failed' AND created_at>=?")
    .bind(key, cutoff).first();
  if (Number(failures?.total || 0) >= MAX_FAILURES) {
    await logAttempt(env, key, 'locked');
    return json({ error: '보안을 위해 15분 동안 로그인을 제한했습니다.' }, 429);
  }

  const derived = await derivePasswordHash(password, env.ADMIN_PASSWORD_SALT);
  if (!constantTimeEqual(derived, env.ADMIN_PASSWORD_HASH)) {
    await logAttempt(env, key, 'failed');
    return json({ error: '비밀번호를 확인해 주세요.' }, 401);
  }

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const session = { id: randomToken(), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_MS).toISOString() };
  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now.toISOString()).run();
  await env.DB.prepare('INSERT INTO admin_sessions (id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(session.id, tokenHash, session.createdAt, session.expiresAt, session.createdAt).run();
  const admin = { id: session.id, method: 'password' };
  await recordAdminActivity(env, admin, 'login_success');
  const response = json({ ok: true, expiresAt: session.expiresAt });
  response.headers.set('Set-Cookie', cookie(token, SESSION_MS / 1000));
  return response;
}

export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ ok: true });
  if (admin.method === 'password' && env.DB) {
    const token = getCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
  }
  await recordAdminActivity(env, admin, 'logout');
  const response = json({ ok: true });
  response.headers.set('Set-Cookie', cookie('', 0));
  return response;
}
