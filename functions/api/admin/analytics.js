import { json, recordAdminActivity, requireAdmin } from '../../_lib/common.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [overview, paths, funnels, referrers, transitions] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) visitors, SUM(event_name='page_view') page_views, ROUND(AVG(CASE WHEN event_name='page_exit' THEN duration_ms END)/1000) avg_seconds FROM analytics_events WHERE created_at>=?`).bind(since).first(),
    env.DB.prepare(`SELECT path, COUNT(*) views FROM analytics_events WHERE event_name='page_view' AND created_at>=? GROUP BY path ORDER BY views DESC LIMIT 12`).bind(since).all(),
    env.DB.prepare(`SELECT event_name, COUNT(*) total FROM analytics_events WHERE event_name IN ('cta_click','form_start','form_submit') AND created_at>=? GROUP BY event_name`).bind(since).all(),
    env.DB.prepare(`SELECT referrer, COUNT(*) visits FROM analytics_events WHERE event_name='page_view' AND created_at>=? AND referrer<>'' GROUP BY referrer ORDER BY visits DESC LIMIT 10`).bind(since).all(),
    env.DB.prepare(`
      WITH views AS (
        SELECT session_id, path, created_at,
          LAG(path) OVER (PARTITION BY session_id ORDER BY created_at) previous_path
        FROM analytics_events
        WHERE event_name='page_view' AND created_at>=?
      )
      SELECT previous_path from_path, path to_path, COUNT(*) moves
      FROM views
      WHERE previous_path IS NOT NULL AND previous_path<>path
      GROUP BY previous_path, path
      ORDER BY moves DESC
      LIMIT 10
    `).bind(since).all()
  ]);
  await recordAdminActivity(env, admin, 'analytics_view');
  return json({ overview, paths: paths.results, funnels: funnels.results, referrers: referrers.results, transitions: transitions.results });
}
