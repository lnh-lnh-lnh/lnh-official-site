(() => {
  const form = document.querySelector('#admin-login-form');
  const password = document.querySelector('#admin-password');
  const message = document.querySelector('#admin-login-message');
  const submit = form.querySelector('button');
  const readJson = async response => {
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('로그인 시스템에 잠시 연결하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.');
    }
    return response.json();
  };
  const check = async () => {
    try {
      const response = await fetch('/api/admin/auth', { credentials: 'same-origin' });
      const result = await readJson(response);
      if (response.ok && result.authenticated) window.location.replace('./');
    } catch {}
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    submit.disabled = true;
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ password: password.value })
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(result.error || '로그인하지 못했습니다.');
      password.value = '';
      window.location.replace('./');
    } catch (error) {
      message.textContent = error.message;
      password.focus();
    } finally { submit.disabled = false; }
  });
  check();
})();
