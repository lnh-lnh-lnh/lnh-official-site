import { clean, hashToken, json, randomToken, recordAdminActivity, requireAdmin, sameOrigin } from '../../_lib/common.js';

const STATUSES = new Set(['new', 'contacted', 'consultation', 'survey_sent', 'survey_completed', 'proposal', 'contracted', 'closed']);

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);
  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 30);
  const service = clean(url.searchParams.get('service'), 30);
  const query = clean(url.searchParams.get('q'), 100);
  const values = [];
  const where = [];
  if (status && STATUSES.has(status)) { where.push('status=?'); values.push(status); }
  if (service) { where.push('service=?'); values.push(service); }
  if (query) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ? OR reference_code LIKE ?)');
    const like = `%${query}%`;
    values.push(like, like, like, like, like);
  }
  const sql = `SELECT * FROM applications ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...values).all();
  await recordAdminActivity(env, admin, 'applications_list');
  return json({ applications: results });
}
export async function onRequestPatch({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: '요청을 확인해 주세요.' }, 400); }
  const id = clean(payload.id, 80);
  const status = clean(payload.status, 30);
  const note = clean(payload.adminNote, 4000);
  if (!id || !STATUSES.has(status)) return json({ error: '상태값을 확인해 주세요.' }, 400);
  await env.DB.prepare('UPDATE applications SET status=?, admin_note=?, updated_at=? WHERE id=?')
    .bind(status, note, new Date().toISOString(), id).run();
  await recordAdminActivity(env, admin, 'application_update', id);
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: '요청을 확인해 주세요.' }, 400); }
  if (payload.action !== 'create_brief_survey') return json({ error: '지원하지 않는 작업입니다.' }, 400);
  const id = clean(payload.id, 80);
  const application = await env.DB.prepare('SELECT id, service FROM applications WHERE id=?').bind(id).first();
  if (!application || application.service !== 'brief') return json({ error: 'Brief 신청 건만 상세 설문을 만들 수 있습니다.' }, 400);
  const token = randomToken();
  const hash = await hashToken(token);
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE applications SET survey_token_hash=?, survey_token_expires_at=?, status='survey_sent', updated_at=? WHERE id=?`)
    .bind(hash, expires, now, id).run();
  await recordAdminActivity(env, admin, 'brief_survey_create', id);
  const base = clean(env.PUBLIC_SITE_URL, 500) || new URL(request.url).origin;
  return json({ ok: true, url: `${base.replace(/\/$/, '')}/brief-survey.html?token=${token}`, expiresAt: expires });
}

export async function onRequestDelete({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: '요청을 확인해 주세요.' }, 400); }
  const id = clean(payload.id, 80);
  if (!id) return json({ error: '삭제할 신청을 확인해 주세요.' }, 400);
  const result = await env.DB.prepare('DELETE FROM applications WHERE id=?').bind(id).run();
  if (!result.meta?.changes) return json({ error: '해당 신청을 찾지 못했습니다.' }, 404);
  await recordAdminActivity(env, admin, 'application_delete', id);
  return json({ ok: true });
}
