(() => {
  const listBody = document.querySelector('#application-list');
  const detail = document.querySelector('#application-detail');
  const search = document.querySelector('#admin-search');
  const service = document.querySelector('#admin-service');
  const status = document.querySelector('#admin-status');
  const exportButton = document.querySelector('#export-applications');
  const logoutButton = document.querySelector('#admin-logout');
  const labels = {
    new:'신규', contacted:'연락 완료', consultation:'상담 예정', survey_sent:'설문 발송',
    survey_completed:'설문 완료', proposal:'제안', contracted:'계약', closed:'종료'
  };
  let applications = [];
  let selectedId = '';
  const escape = value => String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '–';
  const loadApplications = async () => {
    const params = new URLSearchParams();
    if (search.value) params.set('q', search.value);
    if (service.value) params.set('service', service.value);
    if (status.value) params.set('status', status.value);
    try {
      const response = await fetch(`/api/admin/applications?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '목록을 불러오지 못했습니다.');
      applications = result.applications || [];
      renderList();
    } catch (error) {
      listBody.innerHTML = `<tr><td colspan="5">${escape(error.message)}</td></tr>`;
    }
  };
  const renderList = () => {
    if (!applications.length) {
      listBody.innerHTML = '<tr><td colspan="5">조건에 맞는 신청이 없습니다.</td></tr>';
      detail.innerHTML = '<p>신청자를 선택하면 상세 내용이 표시됩니다.</p>';
      return;
    }
    listBody.innerHTML = applications.map(item => `<tr class="application-row ${item.id===selectedId?'is-active':''}" data-id="${escape(item.id)}"><td>${escape(formatDate(item.created_at))}<br><small>${escape(item.reference_code)}</small></td><td><strong>${escape(item.name)}</strong><br><small>${escape(item.company)}</small></td><td>${escape(item.phone)}<br><small>${escape(item.email)}</small></td><td>${escape(item.service)}</td><td><span class="status-badge">${escape(labels[item.status]||item.status)}</span></td></tr>`).join('');
  };
  const renderDetail = item => {
    selectedId = item.id;
    renderList();
    detail.innerHTML = `<h2>${escape(item.name)}</h2><small>${escape(item.reference_code)} · ${escape(formatDate(item.created_at))}</small>
      <dl><dt>서비스</dt><dd>${escape(item.service)}</dd><dt>회사</dt><dd>${escape(item.company||'–')}</dd><dt>연락처</dt><dd>${escape(item.phone)}</dd><dt>연락 시간</dt><dd>${escape(item.contact_time||'–')}</dd><dt>이메일</dt><dd>${escape(item.email)}</dd><dt>주거 형태</dt><dd>${escape(item.space_type)}</dd><dt>지역</dt><dd>${escape(item.location||'–')}</dd><dt>건물명</dt><dd>${escape(item.building_name||'–')}</dd><dt>준공 시기</dt><dd>${escape(item.building_age||'–')}</dd><dt>예산</dt><dd>${escape(item.budget||'–')}</dd><dt>시기</dt><dd>${escape(item.desired_start||'–')}</dd><dt>LNH 유입</dt><dd>${escape(item.discovery_source||'–')}</dd><dt>고민</dt><dd>${escape(item.concern)}</dd><dt>유입</dt><dd>${escape(item.source_path||'–')}<br>${escape(item.referrer||'')}</dd></dl>
      <label class="field-label" for="detail-status">진행 상태</label><select id="detail-status">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${item.status===value?'selected':''}>${label}</option>`).join('')}</select>
      <label class="field-label" for="detail-note">관리 메모</label><textarea id="detail-note">${escape(item.admin_note||'')}</textarea>
      <div class="admin-actions"><button type="button" id="save-application">상태와 메모 저장</button>${item.service==='brief'?'<button class="secondary" type="button" id="create-survey">Brief 설문 링크 만들기</button>':''}<button class="secondary" type="button" id="copy-contact">연락처 복사</button><button class="danger" type="button" id="delete-application">신청 기록 삭제</button></div><p class="form-message" id="detail-message"></p>`;
    detail.querySelector('#save-application').addEventListener('click', () => saveApplication(item));
    detail.querySelector('#copy-contact').addEventListener('click', async () => {
      await navigator.clipboard.writeText(`${item.name}\n${item.phone}\n${item.email}`);
      detail.querySelector('#detail-message').textContent='연락처를 복사했습니다.';
    });
    detail.querySelector('#create-survey')?.addEventListener('click', () => createSurvey(item));
    detail.querySelector('#delete-application').addEventListener('click', () => deleteApplication(item));
  };
  const saveApplication = async item => {
    const response = await fetch('/api/admin/applications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,status:detail.querySelector('#detail-status').value,adminNote:detail.querySelector('#detail-note').value})});
    const result = await response.json();
    detail.querySelector('#detail-message').textContent=response.ok?'저장했습니다.':(result.error||'저장하지 못했습니다.');
    if(response.ok)loadApplications();
  };
  const createSurvey = async item => {
    const response = await fetch('/api/admin/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_brief_survey',id:item.id})});
    const result = await response.json();
    if(!response.ok){detail.querySelector('#detail-message').textContent=result.error||'링크를 만들지 못했습니다.';return}
    await navigator.clipboard.writeText(result.url);
    detail.querySelector('#detail-message').innerHTML=`설문 링크를 만들고 복사했습니다.<br><a href="${escape(result.url)}" target="_blank" rel="noopener">설문 열기</a>`;
    loadApplications();
  };
  const deleteApplication = async item => {
    if (!window.confirm(`${item.name}님의 신청 기록과 연결된 Brief 설문을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    const response = await fetch('/api/admin/applications',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id})});
    const result = await response.json();
    if(!response.ok){detail.querySelector('#detail-message').textContent=result.error||'삭제하지 못했습니다.';return}
    selectedId='';
    detail.innerHTML='<p>신청 기록을 삭제했습니다.</p>';
    loadApplications();
  };
  const csvCell = value => {
    const text = String(value ?? '');
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"','""')}"`;
  };
  const exportApplications = () => {
    const columns = [
      ['접수일','created_at'],['접수번호','reference_code'],['서비스','service'],['상태','status'],
      ['이름','name'],['회사·기관','company'],['연락처','phone'],['이메일','email'],
      ['주거형태','space_type'],['지역','location'],['건물명','building_name'],['준공시기','building_age'],['예산','budget'],['희망시기','desired_start'],['연락시간','contact_time'],['LNH 유입','discovery_source'],
      ['현재 고민','concern'],['관리 메모','admin_note'],['유입 페이지','source_path'],['유입 경로','referrer']
    ];
    const rows = [columns.map(([label])=>csvCell(label)).join(','), ...applications.map(item=>columns.map(([,key])=>csvCell(item[key])).join(','))];
    const blob = new Blob([`\ufeff${rows.join('\n')}`],{type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download=`lnh-applications-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/analytics');
      const data = await response.json();
      if(!response.ok)return;
      document.querySelector('[data-metric="visitors"]').textContent=data.overview?.visitors||0;
      document.querySelector('[data-metric="pageViews"]').textContent=data.overview?.page_views||0;
      document.querySelector('[data-metric="avgSeconds"]').textContent=`${data.overview?.avg_seconds||0}s`;
      const funnel=Object.fromEntries((data.funnels||[]).map(item=>[item.event_name,item.total]));
      document.querySelector('[data-metric="ctaClicks"]').textContent=funnel.cta_click||0;
      document.querySelector('[data-metric="formStarts"]').textContent=funnel.form_start||0;
      document.querySelector('[data-metric="submits"]').textContent=funnel.form_submit||0;
      document.querySelector('#analytics-paths').innerHTML=(data.paths||[]).map(item=>`<li>${escape(item.path)} — ${item.views}</li>`).join('')||'<li>데이터 없음</li>';
      document.querySelector('#analytics-transitions').innerHTML=(data.transitions||[]).map(item=>`<li>${escape(item.from_path)} → ${escape(item.to_path)} — ${item.moves}</li>`).join('')||'<li>데이터 없음</li>';
      document.querySelector('#analytics-referrers').innerHTML=(data.referrers||[]).map(item=>`<li>${escape(item.referrer)} — ${item.visits}</li>`).join('')||'<li>데이터 없음</li>';
    } catch {}
  };
  const confirmAuthentication = async () => {
    try {
      const response = await fetch('/api/admin/auth', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.authenticated) throw new Error('unauthenticated');
      document.body.classList.remove('admin-pending-auth');
      return true;
    } catch {
      window.location.replace('./login.html');
      return false;
    }
  };
  listBody.addEventListener('click',event=>{const row=event.target.closest('[data-id]');if(!row)return;const item=applications.find(entry=>entry.id===row.dataset.id);if(item)renderDetail(item)});
  let timer;
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(loadApplications,250)});
  service.addEventListener('change',loadApplications);status.addEventListener('change',loadApplications);
  exportButton.addEventListener('click',exportApplications);
  logoutButton.addEventListener('click', async () => {
    await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin' });
    window.location.replace('./login.html');
  });
  confirmAuthentication().then(allowed => { if (allowed) { loadApplications(); loadAnalytics(); } });
})();
