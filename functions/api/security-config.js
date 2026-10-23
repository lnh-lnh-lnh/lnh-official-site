import { clean, json } from '../_lib/common.js';

export async function onRequestGet({ env }) {
  const siteKey = clean(env.TURNSTILE_SITE_KEY, 200);
  const configured = Boolean(siteKey && clean(env.TURNSTILE_SECRET_KEY, 500));
  return json({ turnstileSiteKey: configured ? siteKey : '' });
}
