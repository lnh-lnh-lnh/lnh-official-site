(() => {
  const endpoint = '/api/analytics';
  const startedAt = Date.now();
  const referrer = (() => {
    if (!document.referrer) return '';
    try {
      const url = new URL(document.referrer);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  })();
  let sessionId = sessionStorage.getItem('lnh_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem('lnh_session_id', sessionId);
  }
  const send = (eventName, metadata = {}, durationMs = null, beacon = false) => {
    const body = JSON.stringify({
      eventName,
      sessionId,
      path: location.pathname,
      referrer,
      durationMs,
      metadata
    });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  const api = { track: (name, data) => send(name, data) };
  window.LNHAnalytics = api;
  send('page_view', { title: document.title });
  document.addEventListener('click', event => {
    const link = event.target.closest('a,button');
    if (!link) return;
    const text = (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (link.matches('[data-track],.nav-cta,.primary-cta,.solid-link,.direction-button,.care-button')) {
      send('cta_click', { label: link.dataset.track || text, href: link.getAttribute('href') || '' });
    }
  });
  let sentExit = false;
  const exit = () => {
    if (sentExit) return;
    sentExit = true;
    send('page_exit', {}, Date.now() - startedAt, true);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') exit(); });
  window.addEventListener('pagehide', exit);
})();
