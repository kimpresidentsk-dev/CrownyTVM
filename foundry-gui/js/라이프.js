// CrownyCore — 개인 앱 (Phase 2)
// 습관 | 내 활동 | 일정 | 재정
const API = '/api/foundry';

class 라이프앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'habits'; this.userName = null; }

  async 초기화() {
    if (!this.el) return;
    // 사용자 이름 추출 (습관 셀에서)
    const res = await fetch(`${API}/cells?limit=500`);
    const data = await res.json();
    const habitCell = (data.cells||[]).find(c => c.name && c.name.includes(':'));
    if (habitCell) this.userName = habitCell.name.split(':')[0];
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id:'habits', label:'습관' },
      { id:'mylife', label:'내 활동' },
      { id:'calendar', label:'일정' },
      { id:'finance', label:'재정' },
    ];
    this.el.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;flex-wrap:wrap;align-items:center">
        ${this.userName ? `<span style="font-weight:600;font-size:12px;margin-right:8px">${this.userName}</span>` : ''}
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _lt" data-tab="${t.id}" style="font-size:10px;padding:3px 8px">${t.label}</button>`).join('')}
      </div>
      <div id="_lc"></div>`;
    this.el.querySelectorAll('._lt').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    const ct = document.getElementById('_lc');
    if (!ct) return;
    switch (this.tab) {
      case 'habits': await this._habitsTab(ct); break;
      case 'mylife': await this._mylifeTab(ct); break;
      case 'calendar': await this._calendarTab(ct); break;
      case 'finance': await this._financeTab(ct); break;
    }
  }

  // ─── 습관 탭 ───
  async _habitsTab(ct) {
    if (!this.userName) {
      ct.innerHTML = `
        <div class="card"><div class="card-h"><span class="card-t">시작하기</span></div>
        <p style="font-size:11px;color:var(--text-2);margin-bottom:6px">이름을 입력하면 12가지 기본 습관이 생성됩니다</p>
        <div style="display:flex;gap:4px;align-items:end"><input id="_ln" placeholder="이름" required style="width:80px"><button class="btn btn-p" id="_ls">시작</button></div></div>`;
      ct.querySelector('#_ls')?.addEventListener('click', async () => {
        const n = document.getElementById('_ln')?.value?.trim();
        if (!n) return;
        await fetch(`${API}/life/create`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:n}) });
        this.userName = n;
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${n} 습관 시작!`, type: '확정' } }));
        document.dispatchEvent(new CustomEvent('데이터변경'));
        this.렌더();
      });
      return;
    }

    // 습관 로드
    const res = await fetch(`${API}/cells?limit=500`);
    const data = await res.json();
    const habits = (data.cells||[]).filter(c => c.name && c.name.startsWith(this.userName + ':'));
    const confirmed = habits.filter(h => h.status === 2).length;
    const total = habits.length || 1;
    const rate = Math.round(confirmed / total * 100);

    const rings = { 0:'기반', 1:'관계', 2:'성장' };
    const grouped = { 0:[], 1:[], 2:[] };
    habits.forEach(h => (grouped[h.layer??0] = grouped[h.layer??0]||[]).push(h));

    ct.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <div class="stat" style="flex:1"><div class="stat-v" style="color:${rate>=80?'var(--확정)':rate>=50?'var(--미확인)':'var(--오류)'}">${rate}%</div><div class="stat-l">달성률</div></div>
        <div class="stat" style="flex:1"><div class="stat-v">${confirmed}/${total}</div><div class="stat-l">습관화</div></div>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:10px">
        <button class="btn btn-p" id="_ca">전체 체크</button>
        <button class="btn" id="_ah">+ 습관 추가</button>
      </div>
      ${Object.entries(grouped).filter(([,a])=>a.length>0).map(([r,hs])=>`
        <div style="margin-bottom:8px">
          <div class="ring-label ring-${r==='0'?'base':r==='1'?'relation':'growth'}" style="margin-bottom:4px">${rings[r]||''}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px">
            ${hs.map(h=>{const done=h.evidence>0;const stable=h.status===2;const label=h.name.split(':')[1]||h.name;const st=stable?'확정':done?'미확인':'미인지';
              return`<div class="card" style="padding:6px;border-left:2px solid var(--${st})" data-id="${h.id}"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:500;font-size:11px">${label}</span><span class="badge ${st}" style="font-size:7px">${stable?'완료':done?h.evidence+'회':'—'}</span></div><div style="font-size:9px;color:var(--text-3)">${h.content||''}</div><button class="btn _ch" data-id="${h.id}" style="font-size:8px;padding:1px 6px;margin-top:3px">${done?'완료':'체크'}</button></div>`;}).join('')}
          </div>
        </div>`).join('')}`;

    ct.querySelectorAll('._ch').forEach(b=>b.addEventListener('click',async()=>{
      await fetch(`${API}/life/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cellId:+b.dataset.id})});
      document.dispatchEvent(new CustomEvent('알림',{detail:{msg:'체크!',type:'확정'}}));
      this.렌더();
    }));
    ct.querySelector('#_ca')?.addEventListener('click',async()=>{
      const ids=habits.map(h=>h.id);
      await fetch(`${API}/life/day`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({habitIds:ids})});
      document.dispatchEvent(new CustomEvent('알림',{detail:{msg:'전체 체크!',type:'확정'}}));
      this.렌더();
    });
    ct.querySelector('#_ah')?.addEventListener('click',()=>{
      const name=prompt('습관 이름:'); if(!name) return;
      const content=prompt('목표/내용:')||name;
      fetch(`${API}/cells`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${this.userName}:${name}`,type:3,content,layer:2,scope:0})})
        .then(()=>{this._notify('습관 추가');this.렌더();});
    });
  }

  // ─── 내 활동 (교회 데이터 자동 표시) ───
  async _mylifeTab(ct) {
    if (!this.userName) { ct.innerHTML = '<div style="color:var(--text-3);font-size:11px;padding:8px">먼저 습관 탭에서 이름을 등록하세요</div>'; return; }

    // 내 이름으로 된 모든 Claim 조회
    const res = await fetch(`${API}/claims?subject=${encodeURIComponent(this.userName)}`);
    const data = await res.json();
    const claims = data.claims || [];

    // 카테고리 분류
    const attendance = claims.filter(c => c.claim?.predicate === '출석');
    const offerings = claims.filter(c => c.claim?.predicate === '헌금');
    const prayers = claims.filter(c => c.claim?.predicate === '기도제목' || c.claim?.predicate === '기도');
    const tasks = claims.filter(c => ['할일','진행중','완료'].includes(c.claim?.predicate));
    const expenses = claims.filter(c => c.claim?.predicate === '지출');
    const others = claims.filter(c => !['출석','헌금','기도제목','기도','할일','진행중','완료','지출'].includes(c.claim?.predicate));

    // 헌금 합계
    const totalOffering = offerings.reduce((s,c) => {
      const m = (c.claim?.object||'').match(/(\d[\d,]*)/);
      return s + (m ? parseInt(m[1].replace(/,/g,'')) : 0);
    }, 0);

    // 전파된 알림 (공지/긴급)
    const alerts = await (await fetch(`${API}/claims?subject=%EA%B3%B5%EC%A7%80`)).json();
    const recentNotices = (alerts.claims||[]).slice(-3).reverse();
    const emergencies = await (await fetch(`${API}/claims?subject=%EA%B8%B4%EA%B8%89`)).json();
    const recentEmerg = (emergencies.claims||[]).slice(-3).reverse();

    ct.innerHTML = `
      <!-- 긴급 알림 -->
      ${recentEmerg.length ? `<div class="card" style="margin-bottom:8px;border-left:3px solid var(--오류)"><div style="font-size:10px;font-weight:600;color:var(--오류);margin-bottom:4px">긴급 알림</div>${recentEmerg.map(e=>`<div style="font-size:10px">${e.claim?.predicate}: ${e.claim?.object}</div>`).join('')}</div>` : ''}

      <!-- 최근 공지 -->
      ${recentNotices.length ? `<div class="card" style="margin-bottom:8px;border-left:3px solid var(--미확인)"><div style="font-size:10px;font-weight:600;color:var(--미확인);margin-bottom:4px">교회 공지</div>${recentNotices.map(n=>`<div style="font-size:10px">${n.claim?.predicate}</div>`).join('')}</div>` : ''}

      <!-- 내 요약 -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;margin-bottom:10px">
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${attendance.length}</div><div class="stat-l">출석</div></div>
        <div class="stat"><div class="stat-v">${totalOffering.toLocaleString()}</div><div class="stat-l">헌금(원)</div></div>
        <div class="stat"><div class="stat-v">${prayers.length}</div><div class="stat-l">기도</div></div>
        <div class="stat"><div class="stat-v">${tasks.length}</div><div class="stat-l">태스크</div></div>
      </div>

      <!-- 내 활동 타임라인 -->
      <div class="card">
        <div class="card-h"><span class="card-t">내 활동 기록</span></div>
        <div style="display:flex;flex-direction:column;gap:2px;max-height:300px;overflow-y:auto">
          ${claims.length ? claims.slice().reverse().map(c => {
            const pred = c.claim?.predicate || '';
            const cls = pred==='출석'?'확정':pred==='헌금'?'미확인':pred.includes('기도')?'확정':'미인지';
            const time = c.createdAt ? new Date(c.createdAt).toLocaleString('ko',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
            return `<div class="pipe" style="padding:2px 6px"><div class="dot ${cls}"></div><span style="font-weight:500;min-width:35px">${pred}</span><span style="color:var(--text-3);font-size:9px;flex:1">${c.claim?.object||''}</span><span style="font-size:8px;color:var(--text-3)">${time}</span></div>`;
          }).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">아직 활동 기록이 없습니다.<br>교회에서 출석 체크, 헌금 입력을 하면 여기에 자동으로 나타납니다.</div>'}
        </div>
      </div>`;
  }

  // ─── 일정 탭 ───
  async _calendarTab(ct) {
    if (!this.userName) { ct.innerHTML = '<div style="color:var(--text-3);font-size:11px;padding:8px">먼저 습관 탭에서 이름을 등록하세요</div>'; return; }

    // 개인 일정 + 전파된 교회 공지/설교
    const [personalRes, noticeRes, sermonRes] = await Promise.all([
      fetch(`${API}/claims?predicate=%EC%9D%BC%EC%A0%95`).then(r=>r.json()),
      fetch(`${API}/claims?subject=%EA%B3%B5%EC%A7%80`).then(r=>r.json()),
      fetch(`${API}/claims?predicate=%EC%84%A4%EA%B5%90`).then(r=>r.json()),
    ]);

    const personal = personalRes.claims || [];
    const notices = (noticeRes.claims||[]).filter(c => c.claim?.predicate?.includes('설교') || c.claim?.predicate?.includes('행사'));
    const sermons = sermonRes.claims || [];

    const allEvents = [
      ...personal.map(c => ({ type:'개인', title: c.claim?.object||'', source: c.claim?.subject||'', time: c.createdAt })),
      ...notices.map(c => ({ type:'교회', title: c.claim?.predicate||'', source: '공지', time: c.createdAt })),
      ...sermons.map(c => ({ type:'설교', title: (c.claim?.object||'').split('|')[0]||'', source: c.claim?.subject||'', time: c.createdAt })),
    ].sort((a,b) => (b.time||0) - (a.time||0));

    ct.innerHTML = `
      <div class="card" style="margin-bottom:8px">
        <form id="_cf" style="display:flex;gap:3px;align-items:end">
          <input name="title" placeholder="일정 제목" required style="flex:1;min-width:100px">
          <input name="date" type="date" required style="width:110px" value="${new Date().toISOString().slice(0,10)}">
          <button type="submit" class="btn btn-p">추가</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">일정 (${allEvents.length})</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">
          ${allEvents.length ? allEvents.map(e => {
            const cls = e.type==='교회'?'미확인':e.type==='설교'?'확정':'미인지';
            return `<div class="pipe" style="padding:3px 6px"><div class="dot ${cls}"></div><span class="badge ${cls}" style="font-size:7px;min-width:25px;text-align:center">${e.type}</span><span style="font-weight:500;flex:1">${e.title}</span><span style="font-size:8px;color:var(--text-3)">${e.time?new Date(e.time).toLocaleDateString('ko'):''}</span></div>`;
          }).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">일정이 없습니다. 교회 설교/공지가 자동으로 여기에 표시됩니다.</div>'}
        </div>
      </div>`;

    ct.querySelector('#_cf')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: this.userName, predicate:'일정', object:`${f.date.value} ${f.title.value}`, layer:1, scope:0 }) });
      f.reset(); this._notify('일정 추가'); this.렌더();
    });
  }

  // ─── 재정 탭 ───
  async _financeTab(ct) {
    if (!this.userName) { ct.innerHTML = '<div style="color:var(--text-3);font-size:11px;padding:8px">먼저 습관 탭에서 이름을 등록하세요</div>'; return; }

    const res = await fetch(`${API}/claims?subject=${encodeURIComponent(this.userName)}`);
    const data = await res.json();
    const claims = data.claims || [];

    const income = claims.filter(c => c.claim?.predicate === '수입');
    const expense = claims.filter(c => c.claim?.predicate === '지출');
    const offering = claims.filter(c => c.claim?.predicate === '헌금');

    const parse = arr => arr.reduce((s,c) => { const m=(c.claim?.object||'').match(/(\d[\d,]*)/); return s+(m?parseInt(m[1].replace(/,/g,'')):0); }, 0);
    const totalIn = parse(income);
    const totalOut = parse(expense) + parse(offering);
    const totalOffering = parse(offering);

    ct.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${totalIn.toLocaleString()}</div><div class="stat-l">수입</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--오류)">${totalOut.toLocaleString()}</div><div class="stat-l">지출+헌금</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:${totalIn-totalOut>=0?'var(--확정)':'var(--오류)'}">${(totalIn-totalOut).toLocaleString()}</div><div class="stat-l">잔액</div></div>
      </div>
      <div class="card" style="margin-bottom:8px">
        <form id="_ff" style="display:flex;gap:3px;flex-wrap:wrap;align-items:end">
          <select name="type" style="width:55px"><option value="수입">수입</option><option value="지출">지출</option></select>
          <input name="item" placeholder="항목" required style="width:70px">
          <input name="amount" type="number" placeholder="금액" required style="width:65px">
          <button type="submit" class="btn btn-p">기록</button>
        </form>
      </div>
      ${totalOffering > 0 ? `<div style="font-size:10px;color:var(--text-3);margin-bottom:6px">헌금 ${totalOffering.toLocaleString()}원이 지출에 자동 포함됩니다 (교회 앱에서 입력)</div>` : ''}
      <div class="card">
        <div style="max-height:250px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
          ${[...income,...expense,...offering].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(c => {
            const isIn = c.claim?.predicate === '수입';
            const isOff = c.claim?.predicate === '헌금';
            return `<div class="pipe" style="padding:2px 6px"><div class="dot ${isIn?'확정':'오류'}"></div><span style="min-width:30px;font-size:9px;color:var(--text-3)">${isOff?'헌금':c.claim?.predicate}</span><span style="font-weight:500;flex:1">${c.claim?.object||''}</span><span style="font-size:8px;color:var(--text-3)">${c.createdAt?new Date(c.createdAt).toLocaleDateString('ko'):''}</span></div>`;
          }).join('') || '<div style="color:var(--text-3);font-size:10px;padding:6px">수입/지출을 기록하세요. 헌금은 교회 앱에서 입력하면 자동 반영됩니다.</div>'}
        </div>
      </div>`;

    ct.querySelector('#_ff')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const obj = `${f.item.value} ${Number(f.amount.value).toLocaleString()}원`;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject:this.userName, predicate:f.type.value, object:obj, layer:1, scope:0 }) });
      f.reset(); this._notify('재정 기록'); this.렌더();
    });
  }

  _notify(msg) { document.dispatchEvent(new CustomEvent('알림', { detail: { msg, type:'확정' } })); document.dispatchEvent(new CustomEvent('데이터변경')); }
}

export { 라이프앱 };
