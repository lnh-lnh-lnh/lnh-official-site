(() => {
  const endpoint = '/api/analytics';
  const attributionKey = 'lnh_attribution_v1';
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
  const clean = (value, max = 240) => String(value || '').trim().slice(0, max);
  const parameterMap = {
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
    utm_content: 'utmContent',
    utm_term: 'utmTerm',
    gclid: 'gclid',
    fbclid: 'fbclid',
    n_keyword: 'nKeyword'
  };
  const readStoredAttribution = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(attributionKey) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };
  const currentTouch = () => {
    const params = new URLSearchParams(location.search);
    const touch = { path: location.pathname, referrer, capturedAt: new Date().toISOString() };
    Object.entries(parameterMap).forEach(([parameter, property]) => {
      touch[property] = clean(params.get(parameter));
    });
    return touch;
  };
  const hasCampaignValue = touch => Object.values(parameterMap).some(property => Boolean(touch[property]));
  const touch = currentTouch();
  const storedAttribution = readStoredAttribution();
  const attribution = storedAttribution || { first: touch };
  if (storedAttribution && hasCampaignValue(touch)) attribution.last = touch;
  try {
    sessionStorage.setItem(attributionKey, JSON.stringify(attribution));
  } catch {}
  const getAttribution = () => JSON.parse(JSON.stringify(attribution));

  let sessionId = '';
  try {
    sessionId = sessionStorage.getItem('lnh_session_id') || '';
    if (!sessionId) {
      sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem('lnh_session_id', sessionId);
    }
  } catch {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  const send = (eventName, metadata = {}, durationMs = null, beacon = false) => {
    const body = JSON.stringify({
      eventName,
      sessionId,
      path: location.pathname,
      referrer,
      durationMs,
      metadata: { ...metadata, attribution: getAttribution() }
    });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  const api = { track: (name, data) => send(name, data), getAttribution };
  window.LNHAnalytics = api;
  window.LNHAttribution = { get: getAttribution };
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
