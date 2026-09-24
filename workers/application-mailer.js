const SERVICES = new Set(['brief', 'curation', 'care', 'partnership']);
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }

    const reference = clean(payload.reference, 80);
    const service = clean(payload.service, 30).toLowerCase();
    const createdAt = clean(payload.createdAt, 40);
    const adminUrl = clean(payload.adminUrl, 500);
    if (!reference || !SERVICES.has(service) || !adminUrl) return json({ error: 'Invalid application data' }, 400);

    const from = clean(env.EMAIL_FROM, 254) || 'info@lnh-universe.com';
    const to = clean(env.EMAIL_TO, 254) || 'info@lnh-universe.com';
    const subjectService = service === 'brief' ? 'Brief' : service[0].toUpperCase() + service.slice(1);
    const result = await env.EMAIL.send({
      from: { email: from, name: 'LNH' },
      to,
      subject: `[LNH] 새 ${subjectService} 신청이 접수되었습니다`,
      text: [
        'LNH 웹사이트에 새 신청이 접수되었습니다.',
        '',
        `서비스: ${subjectService}`,
        `접수번호: ${reference}`,
        `접수시각: ${createdAt}`,
        '',
        '신청자의 개인정보와 상세 내용은 이메일에 포함하지 않습니다.',
        `관리자 화면에서 확인: ${adminUrl}`
      ].join('\n')
    });
    return json({ ok: true, messageId: result.messageId }, 202);
  }
};
