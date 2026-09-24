(() => {
  const form = document.querySelector('#application-form');
  if (!form) return;
  const steps = [...form.querySelectorAll('.form-step')];
  const progress = [...document.querySelectorAll('.form-progress li')];
  const guides = [...document.querySelectorAll('[data-guide]')];
  const message = document.querySelector('#form-message');
  const success = document.querySelector('#application-success');
  const params = new URLSearchParams(location.search);
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
  if (previewComplete) {
    form.hidden = true;
    document.querySelector('.form-progress').hidden = true;
    document.querySelector('.application-guides').hidden = true;
    document.querySelector('.application-intro').hidden = true;
    success.hidden = false;
    success.querySelector('[data-reference]').textContent = 'LNH-PREVIEW';
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
    message.textContent = '신청 내용을 안전하게 접수하고 있습니다.';
    const data = new FormData(form);
    const query = new URLSearchParams(location.search);
    const payload = {
      service: data.get('service'), name: data.get('name'), company: data.get('company'),
      phone: data.get('phone'), email: data.get('email'), spaceType: data.get('spaceType'),
      location: data.get('location'), buildingName: data.get('buildingName'), buildingAge: data.get('buildingAge'),
      budget: data.get('budget'), desiredStart: data.get('desiredStart'), contactTime: data.get('contactTime'), discoverySource: data.get('discoverySource'),
      concern: data.get('concern'), website: data.get('website'), consent: data.get('consent') === 'on',
      sourcePath: safeReferrer ? new URL(safeReferrer).pathname : location.pathname, referrer: safeReferrer,
      utmSource: query.get('utm_source') || '', utmMedium: query.get('utm_medium') || '',
      utmCampaign: query.get('utm_campaign') || '', turnstileToken: data.get('cf-turnstile-response') || ''
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
      success.querySelector('[data-reference]').textContent = result.reference;
      window.LNHAnalytics?.track('form_submit', { service: payload.service });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
    }
  });
  showStep(0);
})();
