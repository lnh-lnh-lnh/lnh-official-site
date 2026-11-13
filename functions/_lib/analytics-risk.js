import { clean } from './common.js';

const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

export const createVisitorKey = async (request, env) => {
  const secret = clean(env.ANALYTICS_HASH_KEY, 500);
  const ip = clean(request.headers.get('CF-Connecting-IP'), 80);
  if (!secret || !ip) return '';
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip));
  return hex(signature);
};

const numberOrNull = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
};

export const getRequestIntelligence = async (request, env) => {
  const cf = request.cf || {};
  const bot = cf.botManagement || {};
  const visitorKey = await createVisitorKey(request, env);
  const userAgent = clean(request.headers.get('user-agent'), 500);
  const botScore = numberOrNull(bot.score);
  const verifiedBot = Boolean(bot.verifiedBot);
  const reasons = [];
  let riskScore = 0;

  if (!verifiedBot && botScore !== null && botScore > 0 && botScore < 30) {
    riskScore += botScore === 1 ? 55 : 40;
    reasons.push('cloudflare_bot_signal');
  }
  if (!verifiedBot && /(?:headless|python|curl|wget|scrapy|selenium|phantom|crawler|spider|\bbot\b)/i.test(userAgent)) {
    riskScore += 35;
    reasons.push('automation_user_agent');
  }
  if (!userAgent) {
    riskScore += 25;
    reasons.push('missing_user_agent');
  }

  let recentEvents = 0;
  let recentSessions = 0;
  if (visitorKey && env.DB) {
    const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const activity = await env.DB.prepare(`
      SELECT COUNT(*) events, COUNT(DISTINCT session_id) sessions
      FROM analytics_events
      WHERE visitor_key=? AND created_at>=?
    `).bind(visitorKey, recentSince).first();
    recentEvents = Number(activity?.events) || 0;
    recentSessions = Number(activity?.sessions) || 0;
    if (recentEvents >= 60) {
      riskScore += 35;
      reasons.push('high_event_velocity');
    } else if (recentEvents >= 30) {
      riskScore += 20;
      reasons.push('elevated_event_velocity');
    }
    if (recentSessions >= 6) {
      riskScore += 30;
      reasons.push('session_churn');
    }
  }
  if (verifiedBot) reasons.push('verified_bot');

  return {
    visitorKey,
    country: clean(cf.country || request.headers.get('CF-IPCountry'), 2).toUpperCase(),
    region: clean(cf.region, 100),
    asn: numberOrNull(cf.asn),
    asOrganization: clean(cf.asOrganization, 180),
    botScore,
    verifiedBot: verifiedBot ? 1 : 0,
    riskScore: verifiedBot ? 0 : Math.min(100, riskScore),
    riskReasons: JSON.stringify(reasons),
    recentEvents,
    recentSessions
  };
};
