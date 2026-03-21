// CrownyCore — 가정 앱
// 가계부 + 공유 일정 + 자녀 성장 + 가족 목표
const API = '/api/foundry';

class 가정앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'budget'; }

  async 초기화() {
    if (!this.el) return;
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'budget', label: '가계부' },
      { id: 'calendar', label: '가족 일정' },
      { id: 'children', label: '자녀 성장' },
      { id: 'goals', label: '가족 목표' },
    ];

    this.el.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _ftab" data-tab="${t.id}" style="font-size:11px">${t.label}</button>`).join('')}
      </div>
      <div id="_famContent"></div>
    `;
    this.el.querySelectorAll('._ftab').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    const ct = document.getElementById('_famContent');
    if (!ct) return;

    switch (this.tab) {
      case 'budget': await this._budgetTab(ct); break;
      case 'calendar': await this._calendarTab(ct); break;
      case 'children': await this._childrenTab(ct); break;
      case 'goals': await this._goalsTab(ct); break;
    }
  }

  async _budgetTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const incomes = (claims.claims||[]).filter(c => c.claim?.predicate === '수입');
    const expenses = (claims.claims||[]).filter(c => c.claim?.predicate === '지출');
    const parse = arr => arr.reduce((s,c) => { const m=(c.claim?.object||'').match(/(\d[\d,]*)/); return s+(m?parseInt(m[1].replace(/,/g,'')):0); }, 0);
    const totalIn = parse(incomes), totalOut = parse(expenses);

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${totalIn.toLocaleString()}</div><div class="stat-l">수입</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--오류)">${totalOut.toLocaleString()}</div><div class="stat-l">지출</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:${totalIn-totalOut>=0?'var(--확정)':'var(--오류)'}">${(totalIn-totalOut).toLocaleString()}</div><div class="stat-l">잔액</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <form id="_budgetForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <select name="type" style="width:60px"><option value="수입">수입</option><option value="지출">지출</option></select>
          <input name="item" placeholder="항목 (월급/식비/교통...)" required style="width:100px">
          <input name="amount" type="number" placeholder="금액" required style="width:80px">
          <input name="note" placeholder="메모" style="width:80px">
          <button type="submit" class="btn btn-p">기록</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">가계부 내역</span></div>
        <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">
          ${[...incomes,...expenses].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,30).map(c => {
            const isIn = c.claim?.predicate === '수입';
            return `<div class="pipe"><div class="dot ${isIn?'확정':'오류'}"></div><span style="font-weight:500">${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span><span style="font-size:9px;color:var(--text-3);margin-left:auto">${c.createdAt?new Date(c.createdAt).toLocaleDateString('ko'):''}</span></div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">가계부를 기록하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_budgetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const obj = `${f.item.value} ${Number(f.amount.value).toLocaleString()}원${f.note.value?' ('+f.note.value+')':''}`;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: '가계부', predicate: f.type.value, object: obj, layer: 1 ,scope:1}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '기록 완료', type: '확정' } }));
      this.렌더();
    });
  }

  async _calendarTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const events = (claims.claims||[]).filter(c => c.claim?.predicate === '일정' || c.claim?.predicate === '행사');

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_calForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="title" placeholder="일정 제목" required style="width:120px">
          <input name="date" type="date" required style="width:120px">
          <input name="who" placeholder="참여자" style="width:80px">
          <button type="submit" class="btn btn-p">추가</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">가족 일정</span></div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${events.length ? events.reverse().map(c => `<div class="pipe"><div class="dot 확정"></div><span style="font-weight:500">${c.claim?.subject||''}</span><span>${c.claim?.object||''}</span></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">일정을 추가하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_calForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.who.value||'가족', predicate: '일정', object: `${f.date.value} ${f.title.value}`, layer: 1 ,scope:1}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '일정 추가', type: '확정' } }));
      this.렌더();
    });
  }

  async _childrenTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const growth = (claims.claims||[]).filter(c => c.claim?.predicate === '성장기록' || c.claim?.predicate === '자녀');

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_childForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="child" placeholder="자녀 이름" required style="width:70px">
          <select name="category" style="width:70px"><option>학습</option><option>건강</option><option>정서</option><option>신앙</option><option>사회성</option></select>
          <input name="content" placeholder="기록 내용" required style="flex:1;min-width:100px">
          <button type="submit" class="btn btn-p">기록</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">성장 기록</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">
          ${growth.length ? growth.reverse().map(c => `<div class="pipe"><span style="font-weight:500">${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span><span style="font-size:9px;color:var(--text-3);margin-left:auto">${c.createdAt?new Date(c.createdAt).toLocaleDateString('ko'):''}</span></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">자녀 성장 기록을 시작하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_childForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.child.value, predicate: '성장기록', object: `[${f.category.value}] ${f.content.value}`, layer: 1 ,scope:1}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '성장 기록 완료', type: '확정' } }));
      this.렌더();
    });
  }

  async _goalsTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const goals = (claims.claims||[]).filter(c => c.claim?.predicate === '가족목표');

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <form id="_goalForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="goal" placeholder="목표 (예: 가족여행, 저축100만원)" required style="flex:1;min-width:150px">
          <input name="deadline" type="date" style="width:120px">
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">가족 목표</span></div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${goals.length ? goals.map(c => `<div class="pipe"><div class="dot 미확인"></div><span style="font-weight:500">${c.claim?.object||''}</span><button class="btn _done" data-s="${c.claim?.subject}" data-o="${c.claim?.object}" style="font-size:9px;padding:1px 5px;margin-left:auto">달성!</button></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">가족 목표를 세워보세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_goalForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const obj = f.deadline.value ? `${f.goal.value} (${f.deadline.value}까지)` : f.goal.value;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: '가족', predicate: '가족목표', object: obj, layer: 2 ,scope:1}) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '목표 등록!', type: '확정' } }));
      this.렌더();
    });

    el.querySelectorAll('._done').forEach(b => b.addEventListener('click', async () => {
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: '가족', predicate: '목표달성', object: b.dataset.o, layer: 3 ,scope:1}) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '목표 달성!', type: '확정' } }));
      this.렌더();
    }));
  }
}

export { 가정앱 };
