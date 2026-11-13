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

test('필수 연결 정보가 있으면 검증 대기 상태로 전환한다', async () => {
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

  assert.equal(body.status, 'ready_to_verify');
  assert.equal(body.requirements.every(item => item.ready), true);
  assert.equal(JSON.stringify(body).includes('client-secret'), false);
  assert.equal(JSON.stringify(body).includes('refresh-token'), false);
});
