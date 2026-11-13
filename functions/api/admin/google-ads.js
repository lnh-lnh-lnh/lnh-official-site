import { clean, json, recordAdminActivity, requireAdmin } from '../../_lib/common.js';

const PERIODS = new Set(['today', '7d', '30d', 'quarter', 'year']);

const connectionRequirements = env => [
  { key: 'customer', label: 'Google Ads 고객 ID', ready: Boolean(clean(env.GOOGLE_ADS_CUSTOMER_ID, 40)) },
  { key: 'client', label: 'Google OAuth 클라이언트', ready: Boolean(clean(env.GOOGLE_ADS_CLIENT_ID, 300) && clean(env.GOOGLE_ADS_CLIENT_SECRET, 500)) },
  { key: 'token', label: 'Google OAuth 승인', ready: Boolean(clean(env.GOOGLE_ADS_REFRESH_TOKEN, 2000)) }
];

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401);

  const url = new URL(request.url);
  const requestedPeriod = clean(url.searchParams.get('period'), 20);
  const period = PERIODS.has(requestedPeriod) ? requestedPeriod : 'today';
  const requirements = connectionRequirements(env);
  const ready = requirements.every(item => item.ready);

  await recordAdminActivity(env, admin, 'google_ads_status_view');
  return json({
    provider: 'google_ads',
    status: ready ? 'ready_to_verify' : 'not_configured',
    period,
    account: null,
    summary: null,
    campaigns: [],
    districts: [],
    requirements
  });
}
