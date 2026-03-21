// CrownyCore — 스타트업 앱
// 칸반 보드 + 재무 트래커 + 고객 파이프라인 + 팀
const API = '/api/foundry';

class 스타트업앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'kanban'; }

  async 초기화() {
    if (!this.el) return;
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'kanban', label: '칸반 보드' },
      { id: 'finance', label: '재무' },
      { id: 'pipeline', label: '고객 파이프라인' },
      { id: 'team', label: '팀' },
    ];

    this.el.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _stab" data-tab="${t.id}" style="font-size:11px">${t.label}</button>`).join('')}
      </div>
      <div id="_startContent"></div>
    `;
    this.el.querySelectorAll('._stab').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    const ct = document.getElementById('_startContent');
    if (!ct) return;

    switch (this.tab) {
      case 'kanban': await this._kanbanTab(ct); break;
      case 'finance': await this._financeTab(ct); break;
      case 'pipeline': await this._pipelineTab(ct); break;
      case 'team': await this._teamTab(ct); break;
    }
  }

  async _kanbanTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const tasks = (claims.claims||[]).filter(c => ['할일','진행중','완료','보류'].includes(c.claim?.predicate));
    const cols = { '할일': [], '진행중': [], '완료': [], '보류': [] };
    tasks.forEach(t => { const p = t.claim?.predicate; if (cols[p]) cols[p].push(t); });

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_taskForm" style="display:flex;gap:6px;align-items:end">
          <input name="task" placeholder="태스크 이름" required style="flex:1;min-width:120px">
          <input name="assignee" placeholder="담당자" style="width:70px">
          <button type="submit" class="btn btn-p">추가</button>
        </form>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${Object.entries(cols).map(([col, items]) => {
          const color = col==='완료'?'var(--확정)':col==='진행중'?'var(--미확인)':col==='보류'?'var(--오류)':'var(--text-3)';
          return `<div>
            <div style="font-size:10px;font-weight:700;color:${color};letter-spacing:.04em;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid ${color}">${col} (${items.length})</div>
            <div style="display:flex;flex-direction:column;gap:4px;min-height:60px">
              ${items.map(t => `<div class="card" style="padding:6px;font-size:10px;border-left:2px solid ${color}">
                <div style="font-weight:500">${t.claim?.object||''}</div>
                <div style="color:var(--text-3);font-size:9px;margin-top:2px">${t.claim?.subject||''}</div>
                <div style="display:flex;gap:2px;margin-top:4px">
                  ${col!=='진행중'?`<button class="btn _mv" data-s="${t.claim?.subject}" data-o="${t.claim?.object}" data-to="진행중" style="font-size:8px;padding:0 4px">→진행</button>`:''}
                  ${col!=='완료'?`<button class="btn _mv" data-s="${t.claim?.subject}" data-o="${t.claim?.object}" data-to="완료" style="font-size:8px;padding:0 4px">→완료</button>`:''}
                  ${col!=='보류'?`<button class="btn _mv" data-s="${t.claim?.subject}" data-o="${t.claim?.object}" data-to="보류" style="font-size:8px;padding:0 4px">→보류</button>`:''}
                </div>
              </div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    el.querySelector('#_taskForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.assignee.value||'미배정', predicate: '할일', object: f.task.value, layer: 2 ,scope:2}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '태스크 추가', type: '확정' } }));
      this.렌더();
    });

    el.querySelectorAll('._mv').forEach(b => b.addEventListener('click', async () => {
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: b.dataset.s, predicate: b.dataset.to, object: b.dataset.o, layer: 2 ,scope:2}) });
      this.렌더();
    }));
  }

  async _financeTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const revenue = (claims.claims||[]).filter(c => c.claim?.predicate === '매출');
    const cost = (claims.claims||[]).filter(c => c.claim?.predicate === '비용');
    const parse = arr => arr.reduce((s,c) => { const m=(c.claim?.object||'').match(/(\d[\d,]*)/); return s+(m?parseInt(m[1].replace(/,/g,'')):0); }, 0);
    const totalRev = parse(revenue), totalCost = parse(cost);

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${totalRev.toLocaleString()}</div><div class="stat-l">매출</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--오류)">${totalCost.toLocaleString()}</div><div class="stat-l">비용</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:${totalRev-totalCost>=0?'var(--확정)':'var(--오류)'}">${(totalRev-totalCost).toLocaleString()}</div><div class="stat-l">손익</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <form id="_finForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <select name="type" style="width:60px"><option value="매출">매출</option><option value="비용">비용</option></select>
          <input name="item" placeholder="항목" required style="width:80px">
          <input name="amount" type="number" placeholder="금액" required style="width:80px">
          <button type="submit" class="btn btn-p">기록</button>
        </form>
      </div>
      <div class="card">
        <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">
          ${[...revenue,...cost].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,20).map(c => {
            const isRev = c.claim?.predicate === '매출';
            return `<div class="pipe"><div class="dot ${isRev?'확정':'오류'}"></div><span>${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span></div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">매출/비용을 기록하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_finForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.item.value, predicate: f.type.value, object: `${Number(f.amount.value).toLocaleString()}원`, layer: 1 ,scope:2}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '재무 기록', type: '확정' } }));
      this.렌더();
    });
  }

  async _pipelineTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const leads = (claims.claims||[]).filter(c => ['리드','미팅','제안','계약','종료'].includes(c.claim?.predicate));
    const stages = { '리드': [], '미팅': [], '제안': [], '계약': [], '종료': [] };
    leads.forEach(l => { const p = l.claim?.predicate; if (stages[p]) stages[p].push(l); });

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_leadForm" style="display:flex;gap:6px;align-items:end">
          <input name="company" placeholder="회사/고객명" required style="width:100px">
          <input name="contact" placeholder="담당자" style="width:70px">
          <input name="value" type="number" placeholder="예상금액" style="width:80px">
          <button type="submit" class="btn btn-p">리드 추가</button>
        </form>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
        ${Object.entries(stages).map(([stage, items]) => {
          const color = stage==='계약'?'var(--확정)':stage==='종료'?'var(--오류)':'var(--미확인)';
          return `<div>
            <div style="font-size:9px;font-weight:700;color:${color};margin-bottom:4px;border-bottom:2px solid ${color};padding-bottom:3px">${stage} (${items.length})</div>
            ${items.map(l => `<div class="card" style="padding:5px;font-size:10px;margin-bottom:4px">
              <div style="font-weight:500">${l.claim?.subject||''}</div>
              <div style="color:var(--text-3);font-size:9px">${l.claim?.object||''}</div>
            </div>`).join('')}
          </div>`;
        }).join('')}
      </div>`;

    el.querySelector('#_leadForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const obj = f.value.value ? `${f.contact.value||''} ${Number(f.value.value).toLocaleString()}원` : (f.contact.value||'');
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.company.value, predicate: '리드', object: obj, layer: 1 ,scope:2}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '리드 추가', type: '확정' } }));
      this.렌더();
    });
  }

  async _teamTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const members = (claims.claims||[]).filter(c => c.claim?.predicate === '팀원');

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_teamForm" style="display:flex;gap:6px;align-items:end">
          <input name="name" placeholder="이름" required style="width:70px">
          <input name="role" placeholder="역할" required style="width:80px">
          <input name="skill" placeholder="핵심 역량" style="width:100px">
          <button type="submit" class="btn btn-p">추가</button>
        </form>
      </div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:3px">
          ${members.length ? members.map(m => `<div class="pipe"><div class="dot 확정"></div><span style="font-weight:500">${m.claim?.subject||''}</span><span style="color:var(--text-3)">${m.claim?.object||''}</span></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">팀원을 추가하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_teamForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.name.value, predicate: '팀원', object: `${f.role.value} (${f.skill.value||''})`, layer: 1 ,scope:2}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '팀원 추가', type: '확정' } }));
      this.렌더();
    });
  }
}

export { 스타트업앱 };
