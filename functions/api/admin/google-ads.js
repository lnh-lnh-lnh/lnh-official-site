import { clean, json, recordAdminActivity, requireAdmin } from '../../_lib/common.js';
import { getKstWindow } from '../../_lib/analytics-timeline.js';

const PERIOD_DAYS = { today: 1, '7d': 7, '30d': 30, quarter: 90, year: 365 };

const normalizeCustomerId = value => clean(value, 40).replace(/\D/g, '').slice(0, 10);
const apiVersion = env => /^v\d+$/.test(clean(env.GOOGLE_ADS_API_VERSION, 10))
  ? clean(env.GOOGLE_ADS_API_VERSION, 10)
  : 'v26';

const connectionRequirements = env => [
  { key: 'customer', label: 'Google Ads 고객 ID', ready: normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID).length === 10 },
  { key: 'client', label: 'Google OAuth 클라이언트', ready: Boolean(clean(env.GOOGLE_ADS_CLIENT_ID, 300) && clean(env.GOOGLE_ADS_CLIENT_SECRET, 500)) },
  { key: 'token', label: 'Google OAuth 승인', ready: Boolean(clean(env.GOOGLE_ADS_REFRESH_TOKEN, 2000)) }
];

const googleErrorMessage = data => clean(
  data?.error?.details?.flatMap(detail => detail?.errors || [])[0]?.message
  || data?.error?.message
  || data?.error_description
  || 'Google Ads 연결을 확인해 주세요.',
  240
);

const getAccessToken = async env => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clean(env.GOOGLE_ADS_CLIENT_ID, 300),
    client_secret: clean(env.GOOGLE_ADS_CLIENT_SECRET, 500),
    refresh_token: clean(env.GOOGLE_ADS_REFRESH_TOKEN, 2000)
  });
  const response = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(googleErrorMessage(data));
  return clean(data.access_token, 4096);
};

const searchGoogleAds = async (env, accessToken, query) => {
  const customerId = normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID);
  const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  const loginCustomerId = normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const developerToken = clean(env.GOOGLE_ADS_DEVELOPER_TOKEN, 300);
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
  if (developerToken) headers['developer-token'] = developerToken;

  const response = await fetch(`https://googleads.googleapis.com/${apiVersion(env)}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(googleErrorMessage(data));
    error.requestId = clean(response.headers.get('request-id'), 120);
    throw error;
  }
  return data.results || [];
};

const amount = value => Number(value || 0) / 1_000_000;
const count = value => Number(value || 0);

const loadGoogleAds = async (env, period) => {
  const context = getKstWindow(new Date(), PERIOD_DAYS[period]);
  const dateFilter = `segments.date BETWEEN '${context.startDate}' AND '${context.endDate}'`;
  const accessToken = await getAccessToken(env);
  const [accountRows, campaignRows] = await Promise.all([
    searchGoogleAds(env, accessToken, `
      SELECT customer.id, customer.descriptive_name, customer.currency_code,
        customer.time_zone, metrics.cost_micros, metrics.clicks, metrics.conversions
      FROM customer
      WHERE ${dateFilter}
    `),
    searchGoogleAds(env, accessToken, `
      SELECT campaign.id, campaign.name, campaign.status,
        metrics.cost_micros, metrics.clicks, metrics.conversions
      FROM campaign
      WHERE ${dateFilter} AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 10
    `)
  ]);

  const accountRow = accountRows[0] || {};
  const customer = accountRow.customer || {};
  const metrics = accountRow.metrics || {};
  const spend = amount(metrics.costMicros);
  const conversions = count(metrics.conversions);

  return {
    account: {
      id: normalizeCustomerId(customer.id || env.GOOGLE_ADS_CUSTOMER_ID),
      name: clean(customer.descriptiveName || 'Google Ads', 120),
      currencyCode: clean(customer.currencyCode || 'KRW', 10),
      timeZone: clean(customer.timeZone || 'Asia/Seoul', 80)
    },
    summary: {
      spend,
      clicks: count(metrics.clicks),
      conversions,
      cpa: conversions > 0 ? Math.round(spend / conversions) : null
    },
    campaigns: campaignRows.map(row => ({
      id: clean(row.campaign?.id, 40),
      name: clean(row.campaign?.name, 160),
      status: clean(row.campaign?.status, 30),
      spend: amount(row.metrics?.costMicros),
      clicks: count(row.metrics?.clicks),
      conversions: count(row.metrics?.conversions)
    }))
  };
};

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);

  const url = new URL(request.url);
  const requestedPeriod = clean(url.searchParams.get('period'), 20);
  const period = Object.hasOwn(PERIOD_DAYS, requestedPeriod) ? requestedPeriod : 'today';
  const requirements = connectionRequirements(env);
  const ready = requirements.every(item => item.ready);

  await recordAdminActivity(env, admin, 'google_ads_status_view');
  if (!ready) {
    return json({
      provider: 'google_ads', status: 'not_configured', period,
      account: null, summary: null, campaigns: [], districts: [], requirements
    });
  }

  try {
    const data = await loadGoogleAds(env, period);
    await recordAdminActivity(env, admin, 'google_ads_data_view', data.account.id);
    return json({
      provider: 'google_ads', status: 'connected', period,
      ...data, districts: [], requirements
    });
  } catch (error) {
    await recordAdminActivity(env, admin, 'google_ads_connection_error');
    return json({
      provider: 'google_ads', status: 'connection_error', period,
      account: null, summary: null, campaigns: [], districts: [], requirements,
      error: clean(error.message, 240), requestId: clean(error.requestId, 120)
    }, 502);
  }
}
