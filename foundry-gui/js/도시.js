// CrownyCore — 도시관리·빌딩·긴급경보 (실사용 수준)
// 탭: 빌딩 목록 | 센서 입력 | 경보 현황 | 시나리오 | 통계
const API = '/api/foundry';

class 도시앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'buildings'; }

  async 초기화() {
    if (!this.el) return;
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'buildings', label: '빌딩 관리' },
      { id: 'sensor', label: '센서 입력' },
      { id: 'alerts', label: '경보 현황' },
      { id: 'scenario', label: '시나리오' },
      { id: 'dashboard', label: '대시보드' },
    ];

    this.el.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _ctab" data-tab="${t.id}" style="font-size:11px">${t.label}</button>`).join('')}
      </div>
      <div id="_cityContent"></div>
    `;

    this.el.querySelectorAll('._ctab').forEach(btn => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.렌더(); });
    });

    const content = document.getElementById('_cityContent');
    if (!content) return;

    switch (this.tab) {
      case 'buildings': await this._buildingsTab(content); break;
      case 'sensor': await this._sensorTab(content); break;
      case 'alerts': await this._alertsTab(content); break;
      case 'scenario': await this._scenarioTab(content); break;
      case 'dashboard': await this._dashboardTab(content); break;
    }
  }

  // 빌딩 목록에서 confirmed + type 3 + layer 0 인 것
  async _getBuildings() {
    const cells = await (await fetch(`${API}/cells?limit=500`)).json();
    return (cells.cells||[]).filter(c => c.confirmed && c.type === 3 && c.layer === 0 && c.name && !c.name.includes(':'));
  }

  // ─── 빌딩 관리 ───
  async _buildingsTab(el) {
    const buildings = await this._getBuildings();

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">빌딩 등록</span></div>
        <form id="_bldForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="name" placeholder="빌딩명" required style="width:100px">
          <input name="address" placeholder="주소" style="width:130px">
          <input name="floors" type="number" placeholder="층수" value="10" style="width:50px">
          <select name="usage" style="width:70px"><option>주거</option><option>상업</option><option>복합</option><option>공공</option><option>산업</option></select>
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">빌딩 목록 (${buildings.length})</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
          ${buildings.length ? buildings.map(b => `
            <div class="card" style="padding:10px;border-left:3px solid var(--확정)">
              <div style="font-weight:600;font-size:12px;margin-bottom:4px">${b.name}</div>
              <div style="font-size:10px;color:var(--text-3)">${b.content||'주소 없음'}</div>
              <div style="font-size:10px;color:var(--text-3);margin-top:2px">신뢰: ${b.trust}/13 | 근거: ${b.evidence}</div>
            </div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:12px">빌딩을 등록하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_bldForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await fetch(`${API}/city/building`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: f.name.value, address: f.address.value, floors: +f.floors.value, usage: f.usage.value }) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '빌딩 등록 완료', type: '확정' } }));
      document.dispatchEvent(new CustomEvent('데이터변경'));
      this.렌더();
    });
  }

  // ─── 센서 입력 ───
  async _sensorTab(el) {
    const buildings = await this._getBuildings();

    el.innerHTML = `
      <div class="card">
        <div class="card-h"><span class="card-t">센서 데이터 입력</span></div>
        <form id="_sensorForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <select name="building" id="_sensorBld" style="width:110px">
            ${buildings.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            ${!buildings.length ? '<option value="">빌딩 없음</option>' : ''}
          </select>
          <select name="system" style="width:80px"><option>전력</option><option>수도</option><option>가스</option><option>엘리베이터</option><option>소방</option><option>보안</option><option>통신</option><option>온도</option><option>습도</option></select>
          <input name="value" placeholder="측정값" required style="width:80px">
          <select name="severity" style="width:70px"><option value="normal">정상</option><option value="caution">주의</option><option value="warning">경고</option><option value="critical">긴급</option></select>
          <button type="submit" class="btn btn-p">전송</button>
        </form>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-h"><span class="card-t">최근 센서 기록</span></div>
        <div id="_sensorLog"></div>
      </div>`;

    // 최근 Claim에서 센서 기록 로드
    const claims = await (await fetch(`${API}/claims`)).json();
    const sensorLogs = (claims.claims||[]).filter(c => {
      const p = c.claim?.predicate || '';
      return ['전력','수도','가스','엘리베이터','소방','보안','통신','온도','습도'].includes(p);
    }).reverse().slice(0, 20);

    const logEl = document.getElementById('_sensorLog');
    if (logEl) {
      logEl.innerHTML = sensorLogs.length ? sensorLogs.map(c => {
        const sev = (c.claim?.object||'').match(/\((.*?)\)/)?.[1] || 'normal';
        const cls = sev === 'critical' ? '오류' : sev === 'warning' ? '오류' : sev === 'caution' ? '미확인' : '확정';
        return `<div class="pipe"><div class="dot ${cls}"></div><span style="font-weight:500">${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.predicate}: ${c.claim?.object||''}</span></div>`;
      }).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">센서 데이터를 입력하세요</div>';
    }

    el.querySelector('#_sensorForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const bldId = +f.building.value;
      if (!bldId) return;
      await fetch(`${API}/city/sensor`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ buildingId: bldId, system: f.system.value, value: f.value.value, severity: f.severity.value }) });
      const sev = f.severity.value;
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${f.system.value}: ${f.value.value} (${sev})`, type: sev==='critical'||sev==='warning' ? '오류' : '확정' } }));
      this.렌더();
    });
  }

  // ─── 경보 현황 ───
  async _alertsTab(el) {
    const alerts = await (await fetch(`${API}/city/alerts?all=true`)).json();
    const active = (alerts||[]).filter(a => !a.resolved);
    const resolved = (alerts||[]).filter(a => a.resolved);

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--오류)">${active.length}</div><div class="stat-l">활성 경보</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${resolved.length}</div><div class="stat-l">해제됨</div></div>
      </div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:4px">
          ${active.map(a => `
            <div class="pipe" style="border-color:var(--오류)">
              <div class="dot 오류" style="animation:펄스 1s infinite"></div>
              <span style="font-weight:600">${a.building||'#'+a.buildingId}</span>
              <span style="color:var(--text-2)">${a.system}</span>
              <span style="color:var(--text-3);font-size:10px">${a.value}</span>
              <span class="badge 오류" style="font-size:8px">${a.severity}</span>
              <span style="font-size:9px;color:var(--text-3)">${new Date(a.timestamp).toLocaleTimeString('ko')}</span>
              <button class="btn _res" data-id="${a.id}" style="font-size:9px;padding:1px 5px;margin-left:auto">해제</button>
            </div>`).join('')}
          ${!active.length ? '<div style="color:var(--확정);font-size:11px;padding:8px">모든 시스템 정상</div>' : ''}
          ${resolved.length ? '<div style="font-size:9px;color:var(--text-3);margin-top:10px;font-weight:600">해제된 경보</div>' : ''}
          ${resolved.map(a => `<div class="pipe" style="opacity:.4"><div class="dot 확정"></div><span>${a.building||''} ${a.system}: ${a.value}</span></div>`).join('')}
        </div>
      </div>`;

    el.querySelectorAll('._res').forEach(b => b.addEventListener('click', async () => {
      await fetch(`${API}/city/resolve`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ alertId: +b.dataset.id }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '경보 해제', type: '확정' } }));
      this.렌더();
    }));
  }

  // ─── 시나리오 ───
  async _scenarioTab(el) {
    const buildings = await this._getBuildings();
    const scenarios = [
      { type: 'fire', name: '화재', desc: '연기감지→엘리베이터정지→대피방송', color: '#A32D2D' },
      { type: 'earthquake', name: '지진', desc: '진동감지→가스차단→엘리베이터정지', color: '#8C7440' },
      { type: 'power', name: '정전', desc: '주전원차단→비상발전기가동', color: '#6B6B68' },
      { type: 'flood', name: '침수', desc: '지하침수→배전반위험', color: '#5B6B8A' },
      { type: 'gas', name: '가스누출', desc: '가스감지→환기가동→차단', color: '#8C3D3D' },
      { type: 'intruder', name: '침입', desc: '비인가접근→보안경보→잠금', color: '#4A6741' },
    ];

    el.innerHTML = `
      ${!buildings.length ? '<div class="card" style="margin-bottom:10px;border-color:var(--미확인)"><div style="font-size:11px;color:var(--미확인)">먼저 "빌딩 관리" 탭에서 빌딩을 등록하세요</div></div>' : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">
        ${scenarios.map(s => `
          <div class="card _runScen" data-type="${s.type}" style="padding:12px;cursor:pointer;border-left:3px solid ${s.color};transition:all .1s">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${s.name}</div>
            <div style="font-size:10px;color:var(--text-3);line-height:1.4">${s.desc}</div>
          </div>`).join('')}
      </div>`;

    el.querySelectorAll('._runScen').forEach(card => {
      card.addEventListener('click', async () => {
        if (!buildings.length) return;
        const bld = buildings[0];
        const type = card.dataset.type;
        const eventsMap = {
          fire: [{ system:'소방', value:'연기감지', severity:'critical' },{ system:'엘리베이터', value:'자동정지', severity:'warning' }],
          earthquake: [{ system:'구조', value:'진도감지', severity:'critical' },{ system:'가스', value:'자동차단', severity:'warning' }],
          power: [{ system:'전력', value:'주전원차단', severity:'critical' },{ system:'전력', value:'비상발전기', severity:'caution' }],
          flood: [{ system:'수도', value:'지하침수', severity:'critical' },{ system:'전력', value:'배전반위험', severity:'warning' }],
          gas: [{ system:'가스', value:'누출감지', severity:'critical' },{ system:'환기', value:'강제가동', severity:'caution' }],
          intruder: [{ system:'보안', value:'비인가접근', severity:'critical' },{ system:'보안', value:'잠금활성', severity:'warning' }],
        };
        const events = (eventsMap[type]||[]).map(e => ({ ...e, buildingId: bld.id }));
        await fetch(`${API}/city/scenario`, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name: type, events }) });
        const scenName = card.querySelector('div').textContent;
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${scenName} 시나리오 실행!`, type: '오류' } }));
        fetch(`${API}/notify`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'city',title:'긴급경보',message:`${scenName}: ${result.alertsTriggered}건 경보`,severity:'critical'}) });
        this.tab = 'alerts';
        this.렌더();
      });
    });
  }

  // ─── 대시보드 ───
  async _dashboardTab(el) {
    const [buildings, alertsRes, statsRes, cellStats] = await Promise.all([
      this._getBuildings(),
      fetch(`${API}/city/alerts?all=true`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/city/stats`).then(r=>r.json()).catch(()=>({})),
      fetch(`${API}/stats`).then(r=>r.json()).catch(()=>({})),
    ]);
    const active = (alertsRes||[]).filter(a => !a.resolved).length;

    el.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${buildings.length}</div><div class="stat-l">관리 빌딩</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${cellStats.totalCells||0}</div><div class="stat-l">전체 셀</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:${active>0?'var(--오류)':'var(--확정)'}">${active}</div><div class="stat-l">활성 경보</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${statsRes.totalAlerts||0}</div><div class="stat-l">누적 경보</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:var(--확정)">${statsRes.resolvedAlerts||0}</div><div class="stat-l">해제됨</div></div>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">시스템 상태</span></div>
        <div style="font-size:${active > 0 ? '14px' : '12px'};color:${active > 0 ? 'var(--오류)' : 'var(--확정)'};font-weight:600;padding:8px">
          ${active > 0 ? `경보 ${active}건 활성 — 경보 현황 탭에서 확인하세요` : '모든 시스템 정상'}
        </div>
      </div>`;
  }
}

export { 도시앱 };
