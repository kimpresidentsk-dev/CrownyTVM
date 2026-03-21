// CrownyCore — 라이프스타일 (실사용 수준)
// 습관 생성·커스터마이즈·체크·통계·목표·주간리포트
const API = '/api/foundry';

class 라이프앱 {
  constructor(id) { this.el = document.getElementById(id); this.habits = []; this.profile = null; }

  async 초기화() {
    if (!this.el) return;
    // 기존 습관 셀 로드
    const res = await fetch(`${API}/cells?limit=500`);
    const data = await res.json();
    this.habits = (data.cells||[]).filter(c => c.name && c.name.includes(':') &&
      ['기상','운동','식사','수면','위생','가족시간','친구연락','봉사','독서','학습','묵상','일기'].some(h => c.name.includes(h)));
    if (this.habits.length > 0) {
      this.profile = { name: this.habits[0].name.split(':')[0], habitIds: this.habits.map(c=>c.id) };
    }
    this.렌더();
  }

  렌더() {
    if (!this.el) return;
    const has = this.habits.length > 0;

    // 달성률 계산
    const confirmed = this.habits.filter(h => h.status === 2).length;
    const total = this.habits.length || 1;
    const rate = Math.round(confirmed / total * 100);
    const streak = this.habits.filter(h => h.evidence > 0).length;

    this.el.innerHTML = `
      ${has ? `
      <!-- 오늘의 대시보드 -->
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:${rate>=80?'var(--확정)':rate>=50?'var(--미확인)':'var(--오류)'}">${rate}%</div><div class="stat-l">달성률</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${streak}/${total}</div><div class="stat-l">오늘 체크</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:var(--확정)">${confirmed}</div><div class="stat-l">습관화 완료</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${total-confirmed}</div><div class="stat-l">진행 중</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="btn btn-p" id="_lifeCheckAll">전체 체크</button>
        <button class="btn" id="_lifeAddHabit">+ 습관 추가</button>
        <button class="btn" id="_lifeRefresh">새로고침</button>
      </div>
      ` : `
      <div class="card" style="margin-bottom:14px">
        <div class="card-h"><span class="card-t">라이프스타일 시작</span></div>
        <p style="font-size:11px;color:var(--text-2);margin-bottom:8px">12가지 기본 습관이 생성됩니다. 나중에 추가/삭제할 수 있어요.</p>
        <div style="display:flex;gap:6px;align-items:end">
          <input id="_lifeName" placeholder="이름" required style="width:100px">
          <button class="btn btn-p" id="_lifeStart">시작하기</button>
        </div>
      </div>
      `}

      <!-- 습관 목록 -->
      <div id="_habitCards"></div>

      <!-- 습관 추가 폼 (숨김) -->
      <div class="card" style="margin-top:12px;display:none" id="_addHabitForm">
        <div class="card-h"><span class="card-t">습관 추가</span></div>
        <div style="display:flex;gap:6px;align-items:end">
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">습관 이름</label>
            <input id="_newHabitName" placeholder="예: 물마시기" style="width:100px">
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">목표/내용</label>
            <input id="_newHabitContent" placeholder="예: 8잔" style="width:80px">
          </div>
          <select id="_newHabitRing" style="width:70px">
            <option value="0">기반</option><option value="1">관계</option><option value="2">성장</option>
          </select>
          <button class="btn btn-p" id="_addHabitSubmit">추가</button>
        </div>
      </div>
    `;

    this._renderHabitCards();
    this._bind();
  }

  _renderHabitCards() {
    const el = document.getElementById('_habitCards');
    if (!el || !this.habits.length) return;

    const rings = { 0: { name: '기반 · 건강', cls: 'ring-base' }, 1: { name: '관계 · 사람', cls: 'ring-relation' }, 2: { name: '성장 · 발전', cls: 'ring-growth' } };
    const grouped = { 0: [], 1: [], 2: [] };
    this.habits.forEach(h => { const r = h.layer ?? 0; (grouped[r] = grouped[r] || []).push(h); });

    el.innerHTML = Object.entries(grouped).filter(([,arr]) => arr.length > 0).map(([ring, habits]) => {
      const r = rings[ring] || rings[0];
      return `
        <div style="margin-bottom:12px">
          <div class="ring-label ${r.cls}" style="margin-bottom:6px">${r.name}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px">
            ${habits.map(h => {
              const done = h.evidence > 0;
              const stable = h.status === 2;
              const label = h.name.split(':')[1] || h.name;
              const st = stable ? '확정' : done ? '미확인' : '미인지';
              return `
              <div class="card" style="padding:8px;border-left:3px solid var(--${st === '확정' ? '확정' : st === '미확인' ? '미확인' : 'border'})" data-id="${h.id}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-weight:600;font-size:12px">${label}</span>
                  <span class="badge ${st}" style="font-size:8px">${stable ? '습관화' : done ? h.evidence+'회' : '미시작'}</span>
                </div>
                <div style="font-size:10px;color:var(--text-3);margin-bottom:6px">${h.content || '—'}</div>
                <div style="display:flex;gap:4px">
                  <button class="btn _chk" data-id="${h.id}" style="font-size:9px;padding:2px 8px;${done?'opacity:.5':''}">${done ? '완료' : '체크'}</button>
                  ${!stable ? `<div style="background:var(--bg);border-radius:2px;flex:1;height:6px;margin-top:4px"><div style="background:var(--확정);height:100%;border-radius:2px;width:${Math.min(100, (h.evidence||0)/3*100)}%"></div></div>` : '<div style="flex:1"></div>'}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('._chk').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`${API}/life/check`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ cellId: +btn.dataset.id }) });
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '체크!', type: '확정' } }));
        this.초기화();
      });
    });
  }

  _bind() {
    document.getElementById('_lifeStart')?.addEventListener('click', async () => {
      const name = document.getElementById('_lifeName')?.value?.trim();
      if (!name) return;
      await fetch(`${API}/life/create`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${name}의 습관 시작!`, type: '확정' } }));
      document.dispatchEvent(new CustomEvent('데이터변경'));
      this.초기화();
    });

    document.getElementById('_lifeCheckAll')?.addEventListener('click', async () => {
      if (!this.profile) return;
      await fetch(`${API}/life/day`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ habitIds: this.profile.habitIds }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '오늘 전체 완료!', type: '확정' } }));
      this.초기화();
    });

    document.getElementById('_lifeAddHabit')?.addEventListener('click', () => {
      const form = document.getElementById('_addHabitForm');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('_addHabitSubmit')?.addEventListener('click', async () => {
      const name = document.getElementById('_newHabitName')?.value?.trim();
      const content = document.getElementById('_newHabitContent')?.value?.trim();
      const ring = parseInt(document.getElementById('_newHabitRing')?.value) || 0;
      if (!name) return;
      const prefix = this.profile?.name || '나';
      await fetch(`${API}/cells`, { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: `${prefix}:${name}`, type: 3, content: content || name, layer: ring }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `습관 추가: ${name}`, type: '확정' } }));
      this.초기화();
    });

    document.getElementById('_lifeRefresh')?.addEventListener('click', () => this.초기화());
  }
}

export { 라이프앱 };
