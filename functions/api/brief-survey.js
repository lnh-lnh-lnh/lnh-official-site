import { clean, hashToken, json, sameOrigin } from '../_lib/common.js';

async function getApplication(env, token) {
  if (!token || !env.DB) return null;
  const tokenHash = await hashToken(token);
  return env.DB.prepare(`
    SELECT id, reference_code, service, survey_token_expires_at
    FROM applications
    WHERE survey_token_hash = ?
  `).bind(tokenHash).first();
}
export async function onRequestGet({ request, env }) {
  const token = clean(new URL(request.url).searchParams.get('token'), 128);
  const application = await getApplication(env, token);
  if (!application || application.service !== 'brief' || !application.survey_token_expires_at || new Date(application.survey_token_expires_at) < new Date()) {
    return json({ error: '유효하지 않거나 만료된 설문 링크입니다.' }, 404);
  }
  return json({ ok: true, reference: application.reference_code });
}
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!env.DB) return json({ error: '설문 시스템 연결이 준비되지 않았습니다.' }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '설문 내용을 확인해 주세요.' }, 400);
  }

  const token = clean(payload.token, 128);
  const application = await getApplication(env, token);
  if (!application || application.service !== 'brief' || !application.survey_token_expires_at || new Date(application.survey_token_expires_at) < new Date()) {
    return json({ error: '유효하지 않거나 만료된 설문 링크입니다.' }, 404);
  }

  const household = clean(payload.household, 1500);
  const dailyRoutine = clean(payload.dailyRoutine, 2000);
  const currentDiscomfort = clean(payload.currentDiscomfort, 2500);
  const mustKeep = clean(payload.mustKeep, 2000);
  const priorities = clean(payload.priorities, 2000);
  if (!household || !dailyRoutine || !currentDiscomfort || !mustKeep || !priorities) {
    return json({ error: '필수 질문에 답해주세요.' }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO brief_surveys (
      id, application_id, household, daily_routine, current_discomfort, must_keep,
      priorities, flexible_items, storage_and_flow, decision_makers, reference_links,
      additional_note, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id) DO UPDATE SET
      household=excluded.household, daily_routine=excluded.daily_routine,
      current_discomfort=excluded.current_discomfort, must_keep=excluded.must_keep,
      priorities=excluded.priorities, flexible_items=excluded.flexible_items,
      storage_and_flow=excluded.storage_and_flow, decision_makers=excluded.decision_makers,
      reference_links=excluded.reference_links, additional_note=excluded.additional_note,
      updated_at=excluded.updated_at
  `).bind(
    crypto.randomUUID(), application.id, household, dailyRoutine, currentDiscomfort, mustKeep,
    priorities, clean(payload.flexibleItems, 2000), clean(payload.storageAndFlow, 2000),
    clean(payload.decisionMakers, 1000), clean(payload.referenceLinks, 2000),
    clean(payload.additionalNote, 2500), now, now
  ).run();

  await env.DB.prepare(`UPDATE applications SET status='survey_completed', updated_at=? WHERE id=?`)
    .bind(now, application.id).run();
  return json({ ok: true, reference: application.reference_code });
}
