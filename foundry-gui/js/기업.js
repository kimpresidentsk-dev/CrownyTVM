// CrownyCore — 기업 앱
// 인사 + 프로젝트 포트폴리오 + 회계 + 의사결정 연동
const API = '/api/foundry';

class 기업앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'hr'; }

  async 초기화() { if (!this.el) return; this.렌더(); }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'hr', label: '인사' },
      { id: 'projects', label: '프로젝트' },
      { id: 'accounting', label: '회계' },
      { id: 'decisions', label: '의사결정' },
    ];
    this.el.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _etab" data-tab="${t.id}" style="font-size:11px">${t.label}</button>`).join('')}
      </div>
      <div id="_entContent"></div>`;
    this.el.querySelectorAll('._etab').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    const ct = document.getElementById('_entContent');
    if (!ct) return;
    switch (this.tab) {
      case 'hr': await this._hrTab(ct); break;
      case 'projects': await this._projectsTab(ct); break;
      case 'accounting': await this._accountingTab(ct); break;
      case 'decisions': await this._decisionsTab(ct); break;
    }
  }

  async _hrTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const employees = (claims.claims||[]).filter(c => c.claim?.predicate === '팀원' || c.claim?.predicate === '직원');
    const depts = {};
    employees.forEach(e => { const d = (e.claim?.object||'').match(/\(([^)]+)\)/)?.[1] || '미배정'; (depts[d]=depts[d]||[]).push(e); });

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="stat-v">${employees.length}</div><div class="stat-l">전체 인원</div></div>
        <div class="stat"><div class="stat-v">${Object.keys(depts).length}</div><div class="stat-l">부서</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <form id="_empForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="name" placeholder="이름" required style="width:70px">
          <input name="dept" placeholder="부서" style="width:70px">
          <input name="role" placeholder="직책" style="width:70px">
          <input name="skill" placeholder="핵심역량" style="width:80px">
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        ${Object.entries(depts).map(([dept, members]) => `
          <div style="margin-bottom:10px">
            <div style="font-size:10px;font-weight:700;color:var(--text-3);margin-bottom:4px">${dept} (${members.length}명)</div>
            ${members.map(m => `<div class="pipe"><div class="dot 확정"></div><span style="font-weight:500">${m.claim?.subject||''}</span><span style="color:var(--text-3)">${(m.claim?.object||'').replace(/\([^)]+\)/,'')}</span></div>`).join('')}
          </div>`).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">직원을 등록하세요</div>'}
      </div>`;
    el.querySelector('#_empForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.name.value, predicate: '직원', object: `${f.role.value} (${f.dept.value||'미배정'}) ${f.skill.value}`, layer: 1, scope: 4 }) });
      f.reset(); document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '직원 등록', type: '확정' } })); this.렌더();
    });
  }

  async _projectsTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const projects = (claims.claims||[]).filter(c => ['할일','진행중','완료','보류'].includes(c.claim?.predicate));
    const byStatus = { '할일':0, '진행중':0, '완료':0, '보류':0 };
    projects.forEach(p => { if (byStatus[p.claim?.predicate] !== undefined) byStatus[p.claim.predicate]++; });

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="stat-v">${projects.length}</div><div class="stat-l">전체 태스크</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--text-3)">${byStatus['할일']}</div><div class="stat-l">할일</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${byStatus['진행중']}</div><div class="stat-l">진행중</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${byStatus['완료']}</div><div class="stat-l">완료</div></div>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">프로젝트 현황</span><button class="btn _goStartup" style="font-size:9px;padding:2px 6px">스타트업 앱 열기</button></div>
        <div style="display:flex;gap:20px;font-size:11px;color:var(--text-2)">
          <div>완료율: <b style="color:var(--확정)">${projects.length>0?Math.round(byStatus['완료']/projects.length*100):0}%</b></div>
          <div>보류: <b style="color:var(--오류)">${byStatus['보류']}</b>건</div>
        </div>
      </div>`;
    el.querySelector('._goStartup')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('화면이동', { detail: 'startup' })));
  }

  async _accountingTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const revenue = (claims.claims||[]).filter(c => c.claim?.predicate === '매출');
    const cost = (claims.claims||[]).filter(c => c.claim?.predicate === '비용');
    const offerings = (claims.claims||[]).filter(c => c.claim?.predicate === '헌금');
    const parse = arr => arr.reduce((s,c) => { const m=(c.claim?.object||'').match(/(\d[\d,]*)/); return s+(m?parseInt(m[1].replace(/,/g,'')):0); }, 0);

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${parse(revenue).toLocaleString()}</div><div class="stat-l">매출</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${parse(cost).toLocaleString()}</div><div class="stat-l">비용</div></div>
        <div class="stat"><div class="stat-v">${(parse(revenue)-parse(cost)).toLocaleString()}</div><div class="stat-l">손익</div></div>
        <div class="stat"><div class="stat-v">${parse(offerings).toLocaleString()}</div><div class="stat-l">수입(기부/헌금)</div></div>
      </div>
      <div class="card"><div style="font-size:11px;color:var(--text-3);padding:8px">상세 기록은 스타트업(재무) 또는 가정(가계부) 앱에서 관리됩니다.<br>여기서는 전 scope 집계를 확인합니다.</div></div>`;
  }

  async _decisionsTab(el) {
    const stats = await (await fetch(`${API}/covenant/stats`)).json();
    const decisions = await (await fetch(`${API}/covenant/decisions?limit=10`)).json();

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><div class="stat-v">${stats.totalDecisions||0}</div><div class="stat-l">전체 결정</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${stats.ti||0}</div><div class="stat-l">즉시실행</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${stats.om||0}</div><div class="stat-l">학습후</div></div>
        <div class="stat"><div class="stat-v">${stats.principles||0}</div><div class="stat-l">원칙</div></div>
        <div class="stat"><div class="stat-v">${stats.growthLevel||3}</div><div class="stat-l">성장</div></div>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">최근 결정</span><button class="btn _goDecide" style="font-size:9px;padding:2px 6px">의사결정 열기</button></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">
          ${(decisions||[]).reverse().slice(0,5).map(d => {
            const ph = ({'1':'▲','0':'●','-1':'▼','-2':'◆'})[String(d.phase?.value)]||'?';
            return `<div class="pipe"><span>${ph}</span><span style="font-weight:500">${d.event?.type||d.event?.description||'—'}</span><span style="color:var(--text-3);font-size:10px">${d.action}</span></div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">결정 이력 없음</div>'}
        </div>
      </div>`;
    el.querySelector('._goDecide')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('화면이동', { detail: 'decide' })));
  }
}

export { 기업앱 };
