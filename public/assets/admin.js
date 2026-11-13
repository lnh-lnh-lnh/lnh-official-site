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
  const riskReasonLabels={cloudflare_bot_signal:'Cloudflare 봇 신호',automation_user_agent:'자동화 도구 식별',missing_user_agent:'브라우저 정보 없음',high_event_velocity:'비정상 고속 이벤트',elevated_event_velocity:'높은 이벤트 속도',session_churn:'반복 세션 생성',verified_bot:'검증된 봇'};
  const number = new Intl.NumberFormat('ko-KR');
  let applications = [];
  let selectedId = '';
  const escape = value => String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '–';
  const parseRiskReasons = value => { try { const parsed=JSON.parse(value||'[]'); return Array.isArray(parsed)?parsed:[]; } catch { return []; } };
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
    listBody.innerHTML = applications.map(item => `<tr class="application-row ${item.id===selectedId?'is-active':''}" data-id="${escape(item.id)}"><td>${escape(formatDate(item.created_at))}<br><small>${escape(item.reference_code)}</small></td><td><strong>${escape(item.name)}</strong>${Number(item.automation_risk_score)>=40?` <span class="application-risk-badge" data-level="${Number(item.automation_risk_score)>=70?'high':'watch'}">검토 ${number.format(item.automation_risk_score)}</span>`:''}<br><small>${escape(item.company)}</small></td><td>${escape(item.phone)}<br><small>${escape(item.email)}</small></td><td>${escape(item.service)}</td><td><span class="status-badge">${escape(labels[item.status]||item.status)}</span></td></tr>`).join('');
  };
  const renderDetail = item => {
    selectedId = item.id;
    renderList();
    detail.innerHTML = `<h2>${escape(item.name)}</h2><small>${escape(item.reference_code)} · ${escape(formatDate(item.created_at))}</small>
      <dl><dt>서비스</dt><dd>${escape(item.service)}</dd><dt>회사</dt><dd>${escape(item.company||'–')}</dd><dt>연락처</dt><dd>${escape(item.phone)}</dd><dt>연락 시간</dt><dd>${escape(item.contact_time||'–')}</dd><dt>이메일</dt><dd>${escape(item.email)}</dd><dt>주거 형태</dt><dd>${escape(item.space_type)}</dd><dt>지역</dt><dd>${escape(item.location||'–')}</dd><dt>건물명</dt><dd>${escape(item.building_name||'–')}</dd><dt>준공 시기</dt><dd>${escape(item.building_age||'–')}</dd><dt>예산</dt><dd>${escape(item.budget||'–')}</dd><dt>시기</dt><dd>${escape(item.desired_start||'–')}</dd><dt>LNH 유입</dt><dd>${escape(item.discovery_source||'–')}</dd><dt>고민</dt><dd>${escape(item.concern)}</dd><dt>최초 유입</dt><dd>${escape(item.source_path||'–')}<br>${escape(item.referrer||'')}</dd><dt>광고 유입</dt><dd>${escape(item.utm_source||'–')} / ${escape(item.utm_medium||'–')}<br>${escape(item.utm_campaign||'캠페인 없음')}${item.utm_content?` · ${escape(item.utm_content)}`:''}${item.utm_term?`<br>검색어: ${escape(item.utm_term)}`:''}${item.n_keyword?`<br>네이버 키워드: ${escape(item.n_keyword)}`:''}</dd><dt>접속 위험 신호</dt><dd><strong>${number.format(item.automation_risk_score||0)}/100</strong> · ${escape(item.network_city||item.network_region||item.network_country||'지역 미상')} · ${escape(item.network_organization||(item.network_asn?`ASN ${item.network_asn}`:'네트워크 미상'))}<br><small>${parseRiskReasons(item.automation_risk_reasons).map(reason=>escape(riskReasonLabels[reason]||reason)).join(' · ')||'특이 신호 없음'} · 위험 점수는 확정 판정이 아닙니다.</small></dd></dl>
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
    window.LNHSelects?.enhance(detail);
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
      ['현재 고민','concern'],['관리 메모','admin_note'],['유입 페이지','source_path'],['유입 경로','referrer'],
      ['UTM 소스','utm_source'],['UTM 매체','utm_medium'],['UTM 캠페인','utm_campaign'],['UTM 콘텐츠','utm_content'],['UTM 검색어','utm_term'],
      ['Google 클릭 ID','gclid'],['Meta 클릭 ID','fbclid'],['네이버 키워드','n_keyword']
    ];
    const rows = [columns.map(([label])=>csvCell(label)).join(','), ...applications.map(item=>columns.map(([,key])=>csvCell(item[key])).join(','))];
    const blob = new Blob([`\ufeff${rows.join('\n')}`],{type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download=`lnh-applications-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  let analyticsPeriod='today';
  let analyticsRefreshTimer;
  const changeLabel = value => value===null||value===undefined?'이전 기간 데이터 없음':`${value>0?'+':''}${value}% · 이전 기간 대비`;
  const chartLabel = (item, period) => period==='today'?`${item.label}:00`:String(item.date||'').slice(5);
  const renderTrendChart = (items, period) => {
    if(!items.length)return '<p>선택 기간에 표시할 데이터가 없습니다.</p>';
    const width=920,height=300,padX=42,padTop=24,padBottom=42;
    const values=items.flatMap(item=>[Number(item.visit_sessions)||0,Number(item.page_views)||0]);
    const max=Math.max(1,...values);
    const x=index=>items.length===1?width/2:padX+(index/(items.length-1))*(width-padX*2);
    const y=value=>padTop+(1-(value/max))*(height-padTop-padBottom);
    const pathFor=key=>items.map((item,index)=>`${index?'L':'M'} ${x(index).toFixed(1)} ${y(Number(item[key])||0).toFixed(1)}`).join(' ');
    const ticks=Array.from({length:4},(_,index)=>Math.round(max*(1-index/3)));
    const grid=ticks.map((value,index)=>{const yy=padTop+(index/3)*(height-padTop-padBottom);return `<g><line x1="${padX}" y1="${yy}" x2="${width-padX}" y2="${yy}"/><text x="${padX-10}" y="${yy+4}" text-anchor="end">${number.format(value)}</text></g>`}).join('');
    const labelEvery=Math.max(1,Math.ceil(items.length/8));
    const labels=items.map((item,index)=>(index%labelEvery===0||index===items.length-1)?`<text x="${x(index)}" y="${height-14}" text-anchor="middle">${escape(chartLabel(item,period))}</text>`:'').join('');
    const points=(key,className)=>items.map((item,index)=>{const value=Number(item[key])||0;return `<circle class="${className}" cx="${x(index)}" cy="${y(value)}" r="4" tabindex="0"><title>${escape(chartLabel(item,period))} · ${key==='visit_sessions'?'방문 세션':'페이지뷰'} ${number.format(value)}</title></circle>`}).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="선택 기간의 방문 세션과 페이지뷰 추이"><g class="chart-grid">${grid}${labels}</g><path class="chart-line chart-line-views" d="${pathFor('page_views')}"/><path class="chart-line chart-line-sessions" d="${pathFor('visit_sessions')}"/><g class="chart-points">${points('page_views','point-views')}${points('visit_sessions','point-sessions')}</g></svg>`;
  };
  const renderGeography = items => {
    if(!items.length)return '<p>아직 지역 데이터가 없습니다. 새 방문부터 집계됩니다.</p>';
    const max=Math.max(...items.map(item=>Number(item.visit_sessions)||0),1);
    return items.map(item=>`<article><div><strong>${escape(item.city&&item.city!=='도시 미상'?item.city:(item.region||item.country||'지역 미상'))}</strong><span>${escape([item.region,item.country].filter(Boolean).join(' · ')||'XX')} · 추정</span><b>${number.format(item.visit_sessions||0)}</b></div><div class="geo-track"><i style="--geo-width:${Math.max(2,Math.round((Number(item.visit_sessions)||0)/max*100))}%"></i></div></article>`).join('');
  };
  const renderRisk = risk => {
    document.querySelector('#analytics-risk-summary').innerHTML=`<article><span>평균 위험도</span><strong>${number.format(risk.average_risk||0)}</strong></article><article><span>고위험 세션</span><strong>${number.format(risk.high_risk_sessions||0)}</strong></article><article><span>검증된 봇</span><strong>${number.format(risk.verified_bot_sessions||0)}</strong></article>`;
    const anomalies=risk.anomalies||[];
    document.querySelector('#analytics-anomalies').innerHTML=anomalies.length?anomalies.map(item=>`<article><div class="risk-score" data-level="${item.risk_score>=70?'high':'watch'}">${number.format(item.risk_score)}</div><div><strong>${escape(item.city&&item.city!=='도시 미상'?item.city:(item.region||item.country||'지역 미상'))} · ${escape(item.as_organization||`ASN ${item.asn||'미상'}`)}</strong><p>${(item.reasons||[]).map(reason=>escape(riskReasonLabels[reason]||reason)).join(' · ')||'복합 행동 신호'}</p><small>${number.format(item.sessions||0)}세션 · ${number.format(item.events||0)}이벤트 · 최근 ${escape(formatDate(item.last_seen))}</small></div></article>`).join(''):'<p>현재 선택 기간에는 검토할 이상 패턴이 없습니다.</p>';
  };
  const renderInsights = items => {
    document.querySelector('#analytics-insights').innerHTML=(items||[]).map((item,index)=>`<article data-level="${escape(item.level)}"><span>0${index+1}</span><div><strong>${escape(item.title)}</strong><p>${escape(item.body)}</p></div></article>`).join('')||'<p>분석할 데이터가 충분하지 않습니다.</p>';
  };
  const loadAnalytics = async (period=analyticsPeriod) => {
    const timelineStatus = document.querySelector('#analytics-timeline-status');
    analyticsPeriod=period;
    document.querySelectorAll('[data-period]').forEach(button=>button.classList.toggle('is-active',button.dataset.period===period));
    document.querySelector('.intelligence-command').classList.add('is-refreshing');
    try {
      const response = await fetch(`/api/admin/analytics?period=${encodeURIComponent(period)}`);
      const data = await response.json();
      if(!response.ok)throw new Error(data.error||'분석 데이터를 불러오지 못했습니다.');
      document.querySelector('[data-metric="visitSessions"]').textContent=number.format(data.overview?.visit_sessions||0);
      document.querySelector('[data-metric="pageViews"]').textContent=number.format(data.overview?.page_views||0);
      document.querySelector('[data-metric="avgSeconds"]').textContent=`${data.overview?.avg_seconds||0}s`;
      document.querySelector('[data-change="sessions"]').textContent=changeLabel(data.overview?.session_change);
      document.querySelector('[data-change="pageViews"]').textContent=changeLabel(data.overview?.page_view_change);
      const context=data.timeContext||{};
      const serverTime=context.serverNow?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(context.serverNow)):'–';
      document.querySelector('#analytics-time-context').textContent=`${escape(data.period?.label||'오늘')} · ${serverTime} KST · 60초 자동 갱신`;
      document.querySelector('#analytics-chart').innerHTML=renderTrendChart(data.series||[],data.period?.key||period);
      document.querySelector('#analytics-geography').innerHTML=renderGeography(data.geography||[]);
      renderInsights(data.insights||[]);
      renderRisk(data.risk||{});
      timelineStatus.textContent=`${escape(context.startDate||'')}–${escape(context.endDate||'')} · KST 00:00 경계 · 방문 세션은 날짜별 첫 페이지뷰에 1회 배정 · 위험 신호는 확정 판정이 아닙니다.`;
      const funnel=Object.fromEntries((data.funnels||[]).map(item=>[item.event_name,item.total]));
      const submits=funnel.application_complete||funnel.form_submit||0;
      const sessions=Number(data.overview?.visit_sessions)||0;
      document.querySelector('[data-metric="submits"]').textContent=number.format(submits);
      document.querySelector('[data-metric="conversionRate"]').textContent=`세션 대비 ${sessions?Math.round(submits/sessions*1000)/10:0}%`;
      document.querySelector('[data-metric="flaggedSessions"]').textContent=number.format(data.risk?.flagged_sessions||0);
      document.querySelector('#analytics-paths').innerHTML=(data.paths||[]).map(item=>`<li>${escape(item.path)} — ${item.views}</li>`).join('')||'<li>데이터 없음</li>';
      document.querySelector('#analytics-transitions').innerHTML=(data.transitions||[]).map(item=>`<li>${escape(item.from_path)} → ${escape(item.to_path)} — ${item.moves}</li>`).join('')||'<li>데이터 없음</li>';
      document.querySelector('#analytics-referrers').innerHTML=(data.referrers||[]).map(item=>`<li>${escape(item.referrer)} — ${item.visits}</li>`).join('')||'<li>데이터 없음</li>';
      document.querySelector('#analytics-campaigns').innerHTML=(data.campaigns||[]).map(item=>`<li>${escape(item.source)} / ${escape(item.medium)}${item.campaign?` / ${escape(item.campaign)}`:''} — ${item.visits}</li>`).join('')||'<li>데이터 없음</li>';
    } catch (error) {
      timelineStatus.textContent=error.message||'분석 데이터를 불러오지 못했습니다.';
    } finally {
      document.querySelector('.intelligence-command').classList.remove('is-refreshing');
      clearTimeout(analyticsRefreshTimer);
      analyticsRefreshTimer=setTimeout(()=>loadAnalytics(analyticsPeriod),60000);
    }
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
  document.querySelector('.period-control').addEventListener('click',event=>{const button=event.target.closest('[data-period]');if(button)loadAnalytics(button.dataset.period)});
  logoutButton.addEventListener('click', async () => {
    await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin' });
    window.location.replace('./login.html');
  });
  confirmAuthentication().then(allowed => { if (allowed) { loadApplications(); loadAnalytics(); } });
})();
