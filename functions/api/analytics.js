import { clean, json, sameOrigin } from '../_lib/common.js';

const EVENTS = new Set(['page_view', 'page_exit', 'cta_click', 'form_start', 'form_step', 'form_submit']);

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request) || !env.DB) return json({ ok: false }, 202);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false }, 202);
  }
  const eventName = clean(payload.eventName, 40);
  const sessionId = clean(payload.sessionId, 80);
  const path = clean(payload.path, 300);
  if (!EVENTS.has(eventName) || !sessionId || !path) return json({ ok: false }, 202);

  const metadata = payload.metadata && typeof payload.metadata === 'object'
    ? JSON.stringify(payload.metadata).slice(0, 1500)
    : '';
  const duration = Number.isFinite(Number(payload.durationMs))
    ? Math.max(0, Math.min(Number(payload.durationMs), 86400000))
    : null;

  await env.DB.prepare(`
    INSERT INTO analytics_events (id, session_id, event_name, path, referrer, duration_ms, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), sessionId, eventName, path, clean(payload.referrer, 500),
    duration, metadata, new Date().toISOString()
  ).run();
  return json({ ok: true }, 202);
}
