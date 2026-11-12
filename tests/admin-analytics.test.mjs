import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimeline, getKstWindow } from '../functions/_lib/analytics-timeline.js';
import { DAILY_TIMELINE_SQL, HOURLY_TIMELINE_SQL, onRequestGet } from '../functions/api/admin/analytics.js';

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
    request: new Request('https://example.com/api/admin/analytics', {
      headers: { 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }
    }),
    env: { DB: fakeDatabase(), ADMIN_EMAILS: 'admin@example.com' }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.hourly.length, 24);
  assert.equal(body.daily.length, 30);
  assert.equal(JSON.stringify(body).includes('session_id'), false);
});
