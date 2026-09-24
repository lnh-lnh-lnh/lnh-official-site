import { clean } from './common.js';

export async function notifyNewApplication(env, application) {
  if (!env.MAILER) return { skipped: true };
  const base = clean(env.PUBLIC_SITE_URL, 500) || 'https://www.lnh-universe.com';
  const response = await env.MAILER.fetch('https://lnh-mailer.internal/application', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      reference: clean(application.reference, 80),
      service: clean(application.service, 30),
      createdAt: clean(application.createdAt, 40),
      adminUrl: `${base.replace(/\/$/, '')}/admin/`
    })
  });
  if (!response.ok) throw new Error(`Application notification failed: ${response.status}`);
  return { sent: true };
}
