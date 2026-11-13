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

const PERIODS = {
  today: { key: 'today', label: '오늘', days: 1 },
  '7d': { key: '7d', label: '7일', days: 7 },
  '30d': { key: '30d', label: '30일', days: 30 },
  quarter: { key: 'quarter', label: '분기', days: 90 },
  year: { key: 'year', label: '1년', days: 365 }
};

const sumTimeline = rows => (rows || []).reduce((totals, item) => ({
  visit_sessions: totals.visit_sessions + (Number(item.visit_sessions) || 0),
  page_views: totals.page_views + (Number(item.page_views) || 0)
}), { visit_sessions: 0, page_views: 0 });

const percentChange = (current, previous) => previous > 0
  ? Math.round(((current - previous) / previous) * 1000) / 10
  : null;

const buildInsights = ({ overview, previous, geography, risk, funnels }) => {
  const topRegion = geography[0];
  const totalSessions = Number(overview.visit_sessions) || 0;
  const flaggedSessions = Number(risk?.flagged_sessions) || 0;
  const submissions = Number(funnels.find(item => ['application_complete', 'form_submit'].includes(item.event_name))?.total) || 0;
  const pageDepth = totalSessions ? Math.round((overview.page_views / totalSessions) * 10) / 10 : 0;
  const insights = [
    {
      level: 'signal',
      title: '방문 흐름',
      body: previous.visit_sessions
        ? `이전 같은 기간 대비 방문 세션이 ${Math.abs(percentChange(totalSessions, previous.visit_sessions))}% ${totalSessions >= previous.visit_sessions ? '증가' : '감소'}했습니다.`
        : '이전 기간 데이터가 충분하지 않아 변화율을 계산하지 않았습니다.'
    },
    {
      level: 'signal',
      title: '콘텐츠 깊이',
      body: `세션당 평균 ${pageDepth}페이지를 보며, 신청 완료는 ${submissions}건입니다.`
    }
  ];
  if (topRegion) insights.push({
    level: 'signal',
    title: '주요 유입 지역',
    body: `${topRegion.region || topRegion.country || '지역 미상'}에서 ${topRegion.visit_sessions}세션이 유입됐습니다.`
  });
  insights.push({
    level: flaggedSessions > 0 ? 'watch' : 'stable',
    title: '자동화 위험',
    body: flaggedSessions > 0
      ? `검토가 필요한 세션 ${flaggedSessions}건이 탐지됐습니다. 위험 신호는 확정 판정이 아닙니다.`
      : '현재 선택 기간에는 검토 우선 위험 세션이 없습니다.'
  });
  return insights.slice(0, 4);
};

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);
  if (!env.DB) return json({ error: '데이터베이스 연결이 필요합니다.' }, 503);

  const requestedPeriod = new URL(request.url).searchParams.get('period') || 'today';
  const period = PERIODS[requestedPeriod] || PERIODS.today;
  const timeContext = getKstWindow(new Date(), period.days);
  const since = timeContext.startUtc;
  const until = timeContext.endUtc;
  const previousEnd = since;
  const previousStart = new Date(Date.parse(previousEnd) - period.days * 24 * 60 * 60 * 1000).toISOString();
  const [engagement, paths, funnels, referrers, transitions, campaigns, hourlyRows, dailyRows, previousRows, geographyRows, riskSummary, anomalyRows] = await Promise.all([
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
    env.DB.prepare(DAILY_TIMELINE_SQL).bind(since, until, since, until).all(),
    env.DB.prepare(DAILY_TIMELINE_SQL).bind(previousStart, previousEnd, previousStart, previousEnd).all(),
    env.DB.prepare(`
      WITH first_views AS (
        SELECT country, region, city, session_id,
          date(datetime(created_at, '+9 hours')) kst_date,
          ROW_NUMBER() OVER (
            PARTITION BY date(datetime(created_at, '+9 hours')), session_id
            ORDER BY created_at, id
          ) row_number
        FROM analytics_events
        WHERE event_name='page_view' AND created_at>=? AND created_at<?
      )
      SELECT COALESCE(NULLIF(country, ''), 'XX') country,
        COALESCE(NULLIF(region, ''), '지역 미상') region,
        COALESCE(NULLIF(city, ''), '도시 미상') city,
        COUNT(*) visit_sessions
      FROM first_views
      WHERE row_number=1
      GROUP BY country, region, city
      ORDER BY visit_sessions DESC
      LIMIT 12
    `).bind(since, until).all(),
    env.DB.prepare(`
      WITH session_risk AS (
        SELECT date(datetime(created_at, '+9 hours')) kst_date, session_id,
          MAX(risk_score) risk_score, MAX(verified_bot) verified_bot
        FROM analytics_events
        WHERE event_name='page_view' AND created_at>=? AND created_at<?
        GROUP BY kst_date, session_id
      )
      SELECT COUNT(*) total_sessions,
        SUM(CASE WHEN risk_score>=40 THEN 1 ELSE 0 END) flagged_sessions,
        SUM(CASE WHEN risk_score>=70 THEN 1 ELSE 0 END) high_risk_sessions,
        SUM(CASE WHEN verified_bot=1 THEN 1 ELSE 0 END) verified_bot_sessions,
        ROUND(AVG(risk_score)) average_risk
      FROM session_risk
    `).bind(since, until).first(),
    env.DB.prepare(`
      SELECT country, region, city, asn, as_organization,
        MAX(risk_score) risk_score,
        COUNT(*) events,
        COUNT(DISTINCT session_id) sessions,
        MAX(created_at) last_seen,
        MAX(risk_reasons) risk_reasons
      FROM analytics_events
      WHERE visitor_key<>'' AND risk_score>=20 AND created_at>=? AND created_at<?
      GROUP BY visitor_key, country, region, city, asn, as_organization
      ORDER BY risk_score DESC, events DESC
      LIMIT 10
    `).bind(since, until).all()
  ]);
  const timeline = buildTimeline(timeContext, {
    hourly: hourlyRows.results,
    daily: dailyRows.results
  });
  const overviewTotals = sumTimeline(timeline.daily);
  const previousTotals = sumTimeline(previousRows.results);
  const overview = {
    ...overviewTotals,
    visitors: overviewTotals.visit_sessions,
    avg_seconds: Number(engagement?.avg_seconds) || 0,
    session_change: percentChange(overviewTotals.visit_sessions, previousTotals.visit_sessions),
    page_view_change: percentChange(overviewTotals.page_views, previousTotals.page_views)
  };
  const geography = geographyRows.results || [];
  const risk = {
    total_sessions: Number(riskSummary?.total_sessions) || 0,
    flagged_sessions: Number(riskSummary?.flagged_sessions) || 0,
    high_risk_sessions: Number(riskSummary?.high_risk_sessions) || 0,
    verified_bot_sessions: Number(riskSummary?.verified_bot_sessions) || 0,
    average_risk: Number(riskSummary?.average_risk) || 0,
    anomalies: (anomalyRows.results || []).map(item => ({
      country: item.country || 'XX',
      region: item.region || '지역 미상',
      city: item.city || '도시 미상',
      asn: item.asn || null,
      as_organization: item.as_organization || '',
      risk_score: Number(item.risk_score) || 0,
      events: Number(item.events) || 0,
      sessions: Number(item.sessions) || 0,
      last_seen: item.last_seen,
      reasons: (() => { try { return JSON.parse(item.risk_reasons || '[]'); } catch { return []; } })()
    }))
  };
  await recordAdminActivity(env, admin, 'analytics_view');
  return json({
    overview,
    period: {
      ...period,
      options: Object.values(PERIODS).map(({ key, label }) => ({ key, label }))
    },
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
    series: period.key === 'today' ? timeline.hourly : timeline.daily,
    previous: previousTotals,
    geography,
    risk,
    insights: buildInsights({ overview, previous: previousTotals, geography, risk, funnels: funnels.results || [] }),
    paths: paths.results,
    funnels: funnels.results,
    referrers: referrers.results,
    transitions: transitions.results,
    campaigns: campaigns.results
  });
}
