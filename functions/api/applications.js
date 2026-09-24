import { clean, json, sameOrigin, verifyTurnstile } from '../_lib/common.js';
import { notifyNewApplication } from '../_lib/notify.js';

const SERVICES = new Set(['brief', 'curation', 'care', 'partnership']);

export async function onRequestPost({ request, env, waitUntil }) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!env.DB) return json({ error: '신청 시스템 연결이 준비되지 않았습니다.' }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '신청 내용을 확인해 주세요.' }, 400);
  }

  if (clean(payload.website, 100)) return json({ ok: true });
  const turnstileOkay = await verifyTurnstile(request, env, clean(payload.turnstileToken, 2048));
  if (!turnstileOkay) return json({ error: '자동 제출 방지 확인에 실패했습니다.' }, 400);

  const service = clean(payload.service, 30).toLowerCase();
  const name = clean(payload.name, 80);
  const company = clean(payload.company, 120);
  const phone = clean(payload.phone, 40);
  const email = clean(payload.email, 180).toLowerCase();
  const spaceType = clean(payload.spaceType, 120);
  const location = clean(payload.location, 160);
  const budget = clean(payload.budget, 120);
  const desiredStart = clean(payload.desiredStart, 120);
  const concern = clean(payload.concern, 2000);

  if (!SERVICES.has(service) || !name || !phone || !email || !spaceType || !concern || payload.consent !== true) {
    return json({ error: '필수 항목과 개인정보 안내 확인 여부를 확인해 주세요.' }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: '이메일 형식을 확인해 주세요.' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const reference = `LNH-${now.slice(2, 10).replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`;
  const url = new URL(request.url);

  await env.DB.prepare(`
    INSERT INTO applications (
      id, reference_code, service, name, company, phone, email, space_type, location,
      budget, desired_start, concern, status, source_path, referrer, utm_source,
      utm_medium, utm_campaign, consent_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, reference, service, name, company, phone, email, spaceType, location,
    budget, desiredStart, concern, clean(payload.sourcePath || url.pathname, 300),
    clean(payload.referrer, 500), clean(payload.utmSource, 180), clean(payload.utmMedium, 180),
    clean(payload.utmCampaign, 180), now, now, now
  ).run();

  const notification = notifyNewApplication(env, { reference, service, createdAt: now })
    .catch(error => console.error('Application email notification error', error));
  if (waitUntil) waitUntil(notification);
  else await notification;

  return json({ ok: true, reference }, 201);
}
