(() => {
  const form = document.querySelector('#application-form');
  if (!form) return;
  const steps = [...form.querySelectorAll('.form-step')];
  const progress = [...document.querySelectorAll('.form-progress li')];
  const guides = [...document.querySelectorAll('[data-guide]')];
  const message = document.querySelector('#form-message');
  const success = document.querySelector('#application-success');
  const params = new URLSearchParams(location.search);
  let turnstileEnabled = false;
  let turnstileToken = '';
  let turnstileWidgetId = null;
  const loadTurnstileScript = () => new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.querySelector('script[data-lnh-turnstile]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.lnhTurnstile = '';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
  const initializeTurnstile = async () => {
    const response = await fetch('/api/security-config', { credentials: 'same-origin' });
    if (!response.ok) return;
    const config = await response.json();
    const sitekey = typeof config.turnstileSiteKey === 'string' ? config.turnstileSiteKey.trim() : '';
    if (!sitekey) return;
    turnstileEnabled = true;
    await loadTurnstileScript();
    const container = document.createElement('div');
    container.className = 'turnstile-field';
    container.setAttribute('aria-label', '자동 제출 방지 확인');
    steps.at(-1).querySelector('.form-actions').before(container);
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey,
      appearance: 'interaction-only',
      size: 'flexible',
      theme: 'light',
      callback: token => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => { turnstileToken = ''; }
    });
  };
  const turnstileReady = initializeTurnstile().catch(() => {
    turnstileEnabled = true;
  });
  const getAttribution = () => {
    const tracked = window.LNHAnalytics?.getAttribution?.() || window.LNHAttribution?.get?.();
    if (tracked) return tracked;
    try {
      return JSON.parse(sessionStorage.getItem('lnh_attribution_v1') || 'null') || {};
    } catch {
      return {};
    }
  };
  const previewComplete = params.get('preview') === 'complete';
  const safeReferrer = (() => {
    if (!document.referrer) return '';
    try {
      const url = new URL(document.referrer);
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  })();
  const service = params.get('service');
  if (service && form.elements.service) {
    const option = form.querySelector(`input[name="service"][value="${CSS.escape(service)}"]`);
    if (option) option.checked = true;
  }
  const renderSuccess = selectedService => {
    const message = success.querySelector('[data-success-message]');
    const isPartnership = selectedService === 'partnership';
    const isBrief = selectedService === 'brief';
    message.innerHTML = `보내주신 내용을 확인한 뒤, <strong>1영업일 안에</strong> ${isPartnership ? '회신드리겠습니다.' : '연락드리겠습니다.'}`;
    success.querySelector('[data-brief-followup]').hidden = !isBrief;
  };
  if (previewComplete) {
    form.hidden = true;
    document.querySelector('.form-progress').hidden = true;
    document.querySelector('.application-guides').hidden = true;
    document.querySelector('.application-intro').hidden = true;
    success.hidden = false;
    renderSuccess(form.elements.service?.value || 'brief');
    return;
  }
  let step = 0;
  let started = false;
  const markStarted = () => {
    if (started) return;
    started = true;
    window.LNHAnalytics?.track('form_start', { service: form.elements.service?.value || '' });
  };
  const showStep = next => {
    step = Math.max(0, Math.min(next, steps.length - 1));
    steps.forEach((item, index) => { item.hidden = index !== step; });
    guides.forEach((item, index) => { item.hidden = index !== step; });
    progress.forEach((item, index) => item.classList.toggle('is-active', index <= step));
    message.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const validateStep = index => {
    const fields = [...steps[index].querySelectorAll('[required]')];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  };
  form.addEventListener('click', event => {
    const next = event.target.closest('[data-next]');
    const back = event.target.closest('[data-back]');
    if (next) {
      markStarted();
      if (!validateStep(step)) return;
      window.LNHAnalytics?.track('form_step', { step: step + 1 });
      showStep(step + 1);
    }
    if (back) showStep(step - 1);
  });
  form.addEventListener('input', markStarted);
  form.addEventListener('change', markStarted);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateStep(step)) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    await turnstileReady;
    if (turnstileEnabled && !turnstileToken) {
      message.textContent = '자동 제출 방지 확인을 완료해 주세요.';
      submit.disabled = false;
      return;
    }
    message.textContent = '신청 내용을 안전하게 접수하고 있습니다.';
    const data = new FormData(form);
    const query = new URLSearchParams(location.search);
    const attribution = getAttribution();
    const firstTouch = attribution.first || {};
    const payload = {
      service: data.get('service'), name: data.get('name'), company: data.get('company'),
      phone: data.get('phone'), email: data.get('email'), spaceType: data.get('spaceType'),
      location: data.get('location'), buildingName: data.get('buildingName'), buildingAge: data.get('buildingAge'),
      budget: data.get('budget'), desiredStart: data.get('desiredStart'), contactTime: data.get('contactTime'), discoverySource: data.get('discoverySource'),
      concern: data.get('concern'), website: data.get('website'), consent: data.get('consent') === 'on',
      sourcePath: firstTouch.path || (safeReferrer ? new URL(safeReferrer).pathname : location.pathname),
      referrer: firstTouch.referrer || safeReferrer,
      utmSource: firstTouch.utmSource || query.get('utm_source') || '',
      utmMedium: firstTouch.utmMedium || query.get('utm_medium') || '',
      utmCampaign: firstTouch.utmCampaign || query.get('utm_campaign') || '',
      utmContent: firstTouch.utmContent || query.get('utm_content') || '',
      utmTerm: firstTouch.utmTerm || query.get('utm_term') || '',
      gclid: firstTouch.gclid || query.get('gclid') || '',
      fbclid: firstTouch.fbclid || query.get('fbclid') || '',
      nKeyword: firstTouch.nKeyword || query.get('n_keyword') || '',
      attribution,
      turnstileToken
    };
    try {
      const response = await fetch('/api/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '접수하지 못했습니다.');
      form.hidden = true;
      document.querySelector('.form-progress').hidden = true;
      document.querySelector('.application-guides').hidden = true;
      document.querySelector('.application-intro').hidden = true;
      success.hidden = false;
      renderSuccess(payload.service);
      window.LNHAnalytics?.track('form_submit', { service: payload.service });
      window.LNHAnalytics?.track('application_complete', { service: payload.service });
      window.dispatchEvent(new CustomEvent('lnh:application-complete', {
        detail: { service: payload.service, attribution }
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      message.textContent = error.message;
      if (turnstileWidgetId !== null && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
        turnstileToken = '';
      }
      submit.disabled = false;
    }
  });
  showStep(0);
})();
