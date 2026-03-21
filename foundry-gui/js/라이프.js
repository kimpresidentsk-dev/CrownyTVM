// CrownyCore — 라이프스타일 관리 UI
const API = '/api/foundry';

class 라이프앱 {
  constructor(컨테이너ID) { this.el = document.getElementById(컨테이너ID); this.profile = null; }

  async 초기화() {
    if (!this.el) return;
    this.el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:14px" id="_lifeStats"></div>
      <div class="card" style="margin-bottom:12px" id="_lifeCreate">
        <div class="card-h"><span class="card-t">라이프스타일 시작</span></div>
        <div style="display:flex;gap:6px;align-items:end">
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">이름</label>
            <input id="_lifeName" placeholder="나의 이름" style="width:120px">
          </div>
          <button class="btn btn-p" id="_lifeStart">시작하기</button>
        </div>
        <p style="font-size:10px;color:var(--text-3);margin-top:6px">12가지 습관이 자동 생성됩니다: 기상·운동·식사·수면·위생 + 가족·친구·봉사 + 독서·학습·묵상·일기</p>
      </div>
      <div class="card" style="display:none" id="_lifeHabits">
        <div class="card-h"><span class="card-t">오늘의 습관</span>
          <button class="btn btn-p" id="_lifeCheckAll" style="font-size:10px">전체 체크</button>
        </div>
        <div id="_habitList"></div>
        <div style="margin-top:10px" id="_lifeAchieve"></div>
      </div>
    `;

    document.getElementById('_lifeStart')?.addEventListener('click', async () => {
      const name = document.getElementById('_lifeName')?.value?.trim();
      if (!name) return;
      const res = await fetch(`${API}/life/create`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      this.profile = await res.json();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${name}의 12가지 습관 생성!`, type: '확정' } }));
      document.dispatchEvent(new CustomEvent('데이터변경'));
      this._showHabits();
    });

    // 기존 프로필 있으면 로드
    const stats = await (await fetch(`${API}/stats`)).json();
    if (stats.totalCells > 0) {
      const cells = await (await fetch(`${API}/cells?limit=500`)).json();
      const habitCells = (cells.cells||[]).filter(c => c.name && c.name.includes(':') && ['기상','운동','식사','수면','독서','학습','묵상','일기','가족시간','친구연락','봉사','위생'].some(h => c.name.includes(h)));
      if (habitCells.length > 0) {
        this.profile = { habitIds: habitCells.map(c => c.id), name: habitCells[0].name.split(':')[0] };
        this._showHabits();
      }
    }
  }

  async _showHabits() {
    if (!this.profile) return;
    const createEl = document.getElementById('_lifeCreate');
    const habitsEl = document.getElementById('_lifeHabits');
    if (createEl) createEl.style.display = 'none';
    if (habitsEl) habitsEl.style.display = 'block';

    const list = document.getElementById('_habitList');
    if (!list) return;

    // 습관 셀 로드
    const habits = [];
    for (const id of this.profile.habitIds) {
      try {
        const r = await fetch(`${API}/cells/${id}`);
        if (r.ok) habits.push(await r.json());
      } catch {}
    }

    const rings = { 0: '기반', 1: '관계', 2: '성장' };
    let currentRing = -1;

    list.innerHTML = habits.map(h => {
      const ring = h.layer ?? 0;
      let header = '';
      if (ring !== currentRing) {
        currentRing = ring;
        const cls = ring === 0 ? 'ring-base' : ring === 1 ? 'ring-relation' : 'ring-growth';
        header = `<div class="ring-label ${cls}" style="margin-top:8px;margin-bottom:4px">${rings[ring] || '기타'}</div>`;
      }
      const done = h.evidence > 0;
      const st = ({'2':'확정','0':'미확인'})[String(h.status)] || '미인지';
      const label = h.name.split(':')[1] || h.name;
      return header + `
        <div class="ws-item" style="padding:6px 8px" data-id="${h.id}">
          <div class="dot ${st}"></div>
          <span class="ws-name" style="font-weight:${done?'600':'400'}">${label}</span>
          <span style="font-size:10px;color:var(--text-3)">${h.content}</span>
          <span style="font-size:10px;color:var(--text-3);margin-left:auto">${h.evidence||0}회</span>
          <button class="btn _checkH" data-id="${h.id}" style="font-size:9px;padding:1px 6px">${done?'✓':'체크'}</button>
        </div>`;
    }).join('');

    list.querySelectorAll('._checkH').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`${API}/life/check`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ cellId: +btn.dataset.id }) });
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '습관 체크!', type: '확정' } }));
        this._showHabits();
      });
    });

    document.getElementById('_lifeCheckAll')?.addEventListener('click', async () => {
      await fetch(`${API}/life/day`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ habitIds: this.profile.habitIds }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '오늘 전체 완료!', type: '확정' } }));
      this._showHabits();
    });

    // 달성률
    const achRes = await fetch(`${API}/life/achievement`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ habitIds: this.profile.habitIds }) });
    const ach = await achRes.json();
    const achEl = document.getElementById('_lifeAchieve');
    if (achEl) {
      achEl.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center">
          <div style="font-size:24px;font-weight:700;color:${ach.rate>=80?'var(--확정)':ach.rate>=50?'var(--미확인)':'var(--오류)'}">${ach.rate}%</div>
          <div style="font-size:11px;color:var(--text-3)">확정 ${ach.confirmed}/${ach.total} (3회 이상 실천 시 확정)</div>
        </div>`;
    }
  }
}

export { 라이프앱 };
