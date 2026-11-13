import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, getKstWindow } from '../functions/_lib/analytics-timeline.js';
import { createVisitorKey, getRequestIntelligence } from '../functions/_lib/analytics-risk.js';
import { DAILY_TIMELINE_SQL, HOURLY_TIMELINE_SQL, onRequestGet } from '../functions/api/admin/analytics.js';
import { onRequestPost as recordAnalyticsEvent } from '../functions/api/analytics.js';
import { onRequestPost as createApplication } from '../functions/api/applications.js';

test('UTC 시간을 KST 날짜와 시간으로 변환한다', () => {
  const beforeMidnight = getKstWindow(new Date('2026-11-11T14:59:59.000Z'));
  const afterMidnight = getKstWindow(new Date('2026-11-11T15:00:00.000Z'));

  assert.equal(beforeMidnight.kstDate, '2026-11-11');
  assert.equal(beforeMidnight.kstHour, 23);
  assert.equal(afterMidnight.kstDate, '2026-11-12');
  assert.equal(afterMidnight.kstHour, 0);
  assert.equal(afterMidnight.todayStartUtc, '2026-11-11T15:00:00.000Z');
});

test('오늘을 포함한 정확한 30일 범위를 만든다', () => {
  const context = getKstWindow(new Date('2026-11-12T03:00:00.000Z'), 30);

  assert.equal(context.dates.length, 30);
  assert.equal(context.startDate, '2026-10-14');
  assert.equal(context.endDate, '2026-11-12');
  assert.equal(context.startUtc, '2026-10-13T15:00:00.000Z');
  assert.equal(context.endUtc, '2026-11-12T15:00:00.000Z');
});

test('24시간의 빈 구간을 0으로 채우고 현재 시간과 오늘을 잠정 표시한다', () => {
  const context = getKstWindow(new Date('2026-11-12T03:00:00.000Z'), 30);
  const timeline = buildTimeline(context, {
    hourly: [{ hour: 9, visit_sessions: 2, page_views: 5 }, { hour: 12, visit_sessions: 1, page_views: 2 }],
    daily: [{ date: '2026-11-11', visit_sessions: 4, page_views: 8 }]
  });

  assert.equal(timeline.hourly.length, 24);
  assert.deepEqual(timeline.hourly[0], { hour: 0, label: '00', visit_sessions: 0, page_views: 0, provisional: false });
  assert.equal(timeline.hourly[12].provisional, true);
  assert.equal(timeline.today.visit_sessions, 3);
  assert.equal(timeline.today.page_views, 7);
  assert.equal(timeline.daily.at(-1).visit_sessions, 3);
  assert.equal(timeline.daily.at(-1).provisional, true);
});

test('세션 SQL은 KST 날짜별 첫 페이지뷰만 한 번 배정한다', () => {
  for (const sql of [HOURLY_TIMELINE_SQL, DAILY_TIMELINE_SQL]) {
    assert.match(sql, /PARTITION BY date\(datetime\(created_at, '\+9 hours'\)\), session_id/);
    assert.match(sql, /ORDER BY created_at, id/);
    assert.match(sql, /WHERE row_number=1/);
  }
});

test('원 IP를 노출하지 않는 안정적인 HMAC 방문 지문을 만든다', async () => {
  const request = new Request('https://example.com/api/analytics', {
    headers: { 'CF-Connecting-IP': '203.0.113.24', 'user-agent': 'Mozilla/5.0' }
  });
  const env = { ANALYTICS_HASH_KEY: 'test-secret' };
  const first = await createVisitorKey(request, env);
  const second = await createVisitorKey(request, env);

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(first.includes('203.0.113.24'), false);
  assert.equal(await createVisitorKey(request, {}), '');
});

test('자동화 신호를 설명 가능한 위험 사유로 변환한다', async () => {
  const request = new Request('https://example.com/api/analytics', {
    headers: { 'CF-Connecting-IP': '203.0.113.24', 'user-agent': 'python-requests/2.0' }
  });
  Object.defineProperty(request, 'cf', { value: { country: 'KR', region: 'Seoul', city: 'Songpa-gu', asn: 64500, asOrganization: 'Example Cloud', botManagement: { score: 5, verifiedBot: false } } });
  const env = {
    ANALYTICS_HASH_KEY: 'test-secret',
    DB: { prepare: () => ({ bind() { return this; }, async first() { return { events: 3, sessions: 1 }; } }) }
  };
  const result = await getRequestIntelligence(request, env);

  assert.equal(result.country, 'KR');
  assert.equal(result.region, 'Seoul');
  assert.equal(result.city, 'Songpa-gu');
  assert.ok(result.riskScore >= 70);
  assert.deepEqual(JSON.parse(result.riskReasons), ['cloudflare_bot_signal', 'automation_user_agent']);
});

test('분석 이벤트에는 원 IP 대신 HMAC 지문과 지역 신호만 저장한다', async () => {
  let inserted = [];
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.includes('INSERT INTO analytics_events')) inserted = values;
          return this;
        },
        async first() { return { events: 0, sessions: 0 }; },
        async run() { return { success: true }; }
      };
    }
  };
  const request = new Request('https://example.com/api/analytics', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
      'CF-Connecting-IP': '203.0.113.24',
      'user-agent': 'Mozilla/5.0'
    },
    body: JSON.stringify({ eventName: 'page_view', sessionId: 'session-a', path: '/brief.html' })
  });
  Object.defineProperty(request, 'cf', { value: { country: 'KR', region: 'Seoul', city: 'Songpa-gu', asn: 64500, asOrganization: 'Example Network' } });
  const response = await recordAnalyticsEvent({ request, env: { DB: database, ANALYTICS_HASH_KEY: 'test-secret' } });

  assert.equal(response.status, 202);
  assert.equal(inserted.length, 18);
  assert.equal(inserted[8].length, 64);
  assert.equal(inserted[9], 'KR');
  assert.equal(inserted[10], 'Seoul');
  assert.equal(inserted[11], 'Songpa-gu');
  assert.equal(inserted.includes('203.0.113.24'), false);
});

test('신청 건에는 원 IP 없이 지역과 설명 가능한 위험 신호를 연결한다', async () => {
  let insertedSql = '';
  let inserted = [];
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.includes('INSERT INTO applications')) {
            insertedSql = sql;
            inserted = values;
          }
          return this;
        },
        async first() { return { events: 0, sessions: 0 }; },
        async run() { return { success: true }; }
      };
    }
  };
  const request = new Request('https://example.com/api/applications', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
      'CF-Connecting-IP': '203.0.113.24',
      'user-agent': 'python-requests/2.0'
    },
    body: JSON.stringify({
      service: 'brief', name: '테스트', phone: '010-0000-0000', email: 'test@example.com',
      spaceType: 'apartment', concern: '테스트 신청', consent: true
    })
  });
  Object.defineProperty(request, 'cf', { value: { country: 'KR', region: 'Seoul', city: 'Songpa-gu', asn: 64500, asOrganization: 'Example Network' } });
  const response = await createApplication({ request, env: { DB: database, ANALYTICS_HASH_KEY: 'test-secret' } });

  assert.equal(response.status, 201);
  assert.equal((insertedSql.match(/\?/g) || []).length, inserted.length);
  assert.equal(inserted.includes('203.0.113.24'), false);
  assert.equal(inserted.includes('Seoul'), true);
  assert.equal(inserted[29], 'Songpa-gu');
  assert.ok(Number(inserted[32]) >= 35);
  assert.match(inserted[33], /automation_user_agent/);
});

const fakeDatabase = () => ({
  prepare(sql) {
    return {
      bind() { return this; },
      async first() { return { avg_seconds: 21 }; },
      async all() {
        if (sql === HOURLY_TIMELINE_SQL) return { results: [{ hour: 12, visit_sessions: 1, page_views: 2 }] };
        if (sql === DAILY_TIMELINE_SQL) return { results: [{ date: getKstWindow().kstDate, visit_sessions: 1, page_views: 2 }] };
        return { results: [] };
      },
      async run() { return { success: true }; }
    };
  }
});

test('관리자 인증이 없으면 집계 API를 거부한다', async () => {
  const response = await onRequestGet({
    request: new Request('https://example.com/api/admin/analytics'),
    env: { DB: fakeDatabase() }
  });

  assert.equal(response.status, 401);
});

test('허용된 관리자에게 집계값만 반환하고 세션 ID는 노출하지 않는다', async () => {
  const response = await onRequestGet({
    request: new Request('https://example.com/api/admin/analytics?period=30d', {
      headers: { 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }
    }),
    env: { DB: fakeDatabase(), ADMIN_EMAILS: 'admin@example.com' }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.hourly.length, 24);
  assert.equal(body.daily.length, 30);
  assert.equal(JSON.stringify(body).includes('session_id'), false);
  assert.equal(JSON.stringify(body).includes('visitor_key'), false);
});
