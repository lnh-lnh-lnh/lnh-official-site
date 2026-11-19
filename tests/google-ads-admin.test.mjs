import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet } from '../functions/api/admin/google-ads.js';

const request = headers => new Request('https://example.com/api/admin/google-ads?period=30d', { headers });

test('Google Ads 상태 API는 관리자 인증 없이 열리지 않는다', async () => {
  const response = await onRequestGet({ request: request(), env: {} });
  assert.equal(response.status, 401);
});

test('연결 전에는 비밀값 없이 필요한 설정 상태만 반환한다', async () => {
  const response = await onRequestGet({
    request: request({ 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }),
    env: { ADMIN_EMAILS: 'admin@example.com' }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'not_configured');
  assert.equal(body.period, '30d');
  assert.equal(body.summary, null);
  assert.equal(body.requirements.every(item => item.ready === false), true);
  assert.equal(JSON.stringify(body).includes('GOOGLE_ADS'), false);
});

test('OAuth 승인 정보로 Google Ads 실적과 캠페인을 읽는다', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'access-token' });
    const query = JSON.parse(options.body).query;
    if (query.includes('FROM customer')) {
      return Response.json({ results: [{
        customer: { id: '1234567890', descriptiveName: 'LNH Search', currencyCode: 'KRW', timeZone: 'Asia/Seoul' },
        metrics: { costMicros: '125000000', clicks: '42', conversions: 2 }
      }] });
    }
    return Response.json({ results: [{
      campaign: { id: '7', name: 'Brief Search', status: 'ENABLED' },
      metrics: { costMicros: '100000000', clicks: '35', conversions: 2 }
    }] });
  };

  try {
    const response = await onRequestGet({
      request: request({ 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }),
      env: {
        ADMIN_EMAILS: 'admin@example.com',
        GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
        GOOGLE_ADS_CLIENT_ID: 'client-id',
        GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token'
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'connected');
    assert.equal(body.account.name, 'LNH Search');
    assert.equal(body.summary.spend, 125);
    assert.equal(body.summary.clicks, 42);
    assert.equal(body.summary.cpa, 63);
    assert.equal(body.campaigns[0].name, 'Brief Search');
    assert.equal(calls.length, 3);
    assert.match(calls[1].url, /v26\/customers\/1234567890\/googleAds:search/);
    assert.equal(calls[1].options.headers.authorization, 'Bearer access-token');
    assert.equal(JSON.stringify(body).includes('client-secret'), false);
    assert.equal(JSON.stringify(body).includes('refresh-token'), false);
    assert.equal(JSON.stringify(body).includes('access-token'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google 승인 실패는 관리자에게 안전한 연결 오류로 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });

  try {
    const response = await onRequestGet({
      request: request({ 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }),
      env: {
        ADMIN_EMAILS: 'admin@example.com',
        GOOGLE_ADS_CUSTOMER_ID: '1234567890',
        GOOGLE_ADS_CLIENT_ID: 'client-id',
        GOOGLE_ADS_CLIENT_SECRET: 'client-secret',
        GOOGLE_ADS_REFRESH_TOKEN: 'refresh-token'
      }
    });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.status, 'connection_error');
    assert.match(body.error, /expired or revoked/);
    assert.equal(JSON.stringify(body).includes('client-secret'), false);
    assert.equal(JSON.stringify(body).includes('refresh-token'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
