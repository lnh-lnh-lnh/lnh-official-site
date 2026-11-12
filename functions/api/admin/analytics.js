import { json, recordAdminActivity, requireAdmin } from '../../_lib/common.js';
import { buildTimeline, getKstWindow } from '../../_lib/analytics-timeline.js';

export const HOURLY_TIMELINE_SQL = `
  WITH ranked_sessions AS (
    SELECT
      session_id,
      date(datetime(created_at, '+9 hours')) kst_date,
      CAST(strftime('%H', datetime(created_at, '+9 hours')) AS INTEGER) hour,
      ROW_NUMBER() OVER (
        PARTITION BY date(datetime(created_at, '+9 hours')), session_id
        ORDER BY created_at, id
      ) row_number
    FROM analytics_events
    WHERE event_name='page_view' AND created_at>=? AND created_at<?
  ), combined AS (
    SELECT hour, COUNT(*) visit_sessions, 0 page_views
    FROM ranked_sessions
    WHERE row_number=1
    GROUP BY hour
    UNION ALL
    SELECT CAST(strftime('%H', datetime(created_at, '+9 hours')) AS INTEGER) hour,
      0 visit_sessions, COUNT(*) page_views
    FROM analytics_events
    WHERE event_name='page_view' AND created_at>=? AND created_at<?
    GROUP BY hour
  )
  SELECT hour, SUM(visit_sessions) visit_sessions, SUM(page_views) page_views
  FROM combined
  GROUP BY hour
  ORDER BY hour
`;

export const DAILY_TIMELINE_SQL = `
  WITH ranked_sessions AS (
    SELECT
      session_id,
      date(datetime(created_at, '+9 hours')) kst_date,
      ROW_NUMBER() OVER (
        PARTITION BY date(datetime(created_at, '+9 hours')), session_id
        ORDER BY created_at, id
      ) row_number
    FROM analytics_events
    WHERE event_name='page_view' AND created_at>=? AND created_at<?
  ), combined AS (
    SELECT kst_date date, COUNT(*) visit_sessions, 0 page_views
    FROM ranked_sessions
    WHERE row_number=1
    GROUP BY kst_date
    UNION ALL
    SELECT date(datetime(created_at, '+9 hours')) date,
      0 visit_sessions, COUNT(*) page_views
    FROM analytics_events
    WHERE event_name='page_view' AND created_at>=? AND created_at<?
    GROUP BY date(datetime(created_at, '+9 hours'))
  )
  SELECT date, SUM(visit_sessions) visit_sessions, SUM(page_views) page_views
  FROM combined
  GROUP BY date
  ORDER BY date
`;

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);

  const timeContext = getKstWindow(new Date(), 30);
  const since = timeContext.startUtc;
  const until = timeContext.endUtc;
  const [engagement, paths, funnels, referrers, transitions, campaigns, hourlyRows, dailyRows] = await Promise.all([
    env.DB.prepare(`SELECT ROUND(AVG(duration_ms)/1000) avg_seconds FROM analytics_events WHERE event_name='page_exit' AND created_at>=? AND created_at<?`).bind(since, until).first(),
    env.DB.prepare(`SELECT path, COUNT(*) views FROM analytics_events WHERE event_name='page_view' AND created_at>=? AND created_at<? GROUP BY path ORDER BY views DESC LIMIT 12`).bind(since, until).all(),
    env.DB.prepare(`SELECT event_name, COUNT(*) total FROM analytics_events WHERE event_name IN ('cta_click','form_start','form_submit','application_complete') AND created_at>=? AND created_at<? GROUP BY event_name`).bind(since, until).all(),
    env.DB.prepare(`SELECT referrer, COUNT(*) visits FROM analytics_events WHERE event_name='page_view' AND created_at>=? AND created_at<? AND referrer<>'' GROUP BY referrer ORDER BY visits DESC LIMIT 10`).bind(since, until).all(),
    env.DB.prepare(`
      WITH views AS (
        SELECT session_id, path, created_at,
          LAG(path) OVER (PARTITION BY session_id ORDER BY created_at) previous_path
        FROM analytics_events
        WHERE event_name='page_view' AND created_at>=? AND created_at<?
      )
      SELECT previous_path from_path, path to_path, COUNT(*) moves
      FROM views
      WHERE previous_path IS NOT NULL AND previous_path<>path
      GROUP BY previous_path, path
      ORDER BY moves DESC
      LIMIT 10
    `).bind(since, until).all(),
    env.DB.prepare(`
      SELECT
        COALESCE(
          NULLIF(json_extract(metadata, '$.attribution.first.utmSource'), ''),
          CASE
            WHEN NULLIF(json_extract(metadata, '$.attribution.first.gclid'), '') IS NOT NULL THEN 'google'
            WHEN NULLIF(json_extract(metadata, '$.attribution.first.fbclid'), '') IS NOT NULL THEN 'meta'
            WHEN NULLIF(json_extract(metadata, '$.attribution.first.nKeyword'), '') IS NOT NULL THEN 'naver'
            ELSE ''
          END
        ) source,
        COALESCE(NULLIF(json_extract(metadata, '$.attribution.first.utmMedium'), ''), 'paid') medium,
        COALESCE(json_extract(metadata, '$.attribution.first.utmCampaign'), '') campaign,
        COUNT(DISTINCT session_id) visits
      FROM analytics_events
      WHERE event_name='page_view' AND created_at>=? AND created_at<? AND (
        NULLIF(json_extract(metadata, '$.attribution.first.utmSource'), '') IS NOT NULL OR
        NULLIF(json_extract(metadata, '$.attribution.first.gclid'), '') IS NOT NULL OR
        NULLIF(json_extract(metadata, '$.attribution.first.fbclid'), '') IS NOT NULL OR
        NULLIF(json_extract(metadata, '$.attribution.first.nKeyword'), '') IS NOT NULL
      )
      GROUP BY source, medium, campaign
      ORDER BY visits DESC
      LIMIT 12
    `).bind(since, until).all(),
    env.DB.prepare(HOURLY_TIMELINE_SQL).bind(
      timeContext.todayStartUtc, until,
      timeContext.todayStartUtc, until
    ).all(),
    env.DB.prepare(DAILY_TIMELINE_SQL).bind(since, until, since, until).all()
  ]);
  const timeline = buildTimeline(timeContext, {
    hourly: hourlyRows.results,
    daily: dailyRows.results
  });
  const overviewTotals = timeline.daily.reduce((totals, item) => ({
    visit_sessions: totals.visit_sessions + item.visit_sessions,
    page_views: totals.page_views + item.page_views
  }), { visit_sessions: 0, page_views: 0 });
  const overview = {
    ...overviewTotals,
    visitors: overviewTotals.visit_sessions,
    avg_seconds: Number(engagement?.avg_seconds) || 0
  };
  await recordAdminActivity(env, admin, 'analytics_view');
  return json({
    overview,
    timeContext: {
      timezone: timeContext.timezone,
      utcOffset: timeContext.utcOffset,
      serverNow: timeContext.serverNow,
      kstDate: timeContext.kstDate,
      kstHour: timeContext.kstHour,
      rangeDays: timeContext.rangeDays,
      startDate: timeContext.startDate,
      endDate: timeContext.endDate
    },
    today: timeline.today,
    hourly: timeline.hourly,
    daily: timeline.daily,
    paths: paths.results,
    funnels: funnels.results,
    referrers: referrers.results,
    transitions: transitions.results,
    campaigns: campaigns.results
  });
}
