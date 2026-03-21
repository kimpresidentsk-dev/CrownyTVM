// CrownyCore — 보안 시연 화면
// 로그인 + 비밀등급 필터 + 감사 로그
const API = '/api/foundry';

class 보안앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'login'; this.token = null; this.user = null; }

  async 초기화() {
    // localStorage에서 토큰 복원
    this.token = localStorage.getItem('crownyToken');
    if (this.token) {
      try {
        const r = await fetch(`${API}/auth/verify`, { headers: { Authorization: `Bearer ${this.token}` } });
        if (r.ok) { this.user = await r.json(); this.tab = 'status'; }
        else { this.token = null; localStorage.removeItem('crownyToken'); }
      } catch { this.token = null; }
    }
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'login', label: this.user ? this.user.name : '로그인' },
      { id: 'status', label: '등급 시연' },
      { id: 'audit', label: '감사 로그' },
      { id: 'users', label: '사용자' },
    ];
    this.el.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;flex-wrap:wrap;align-items:center">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _st" data-tab="${t.id}" style="font-size:10px;padding:3px 8px">${t.label}</button>`).join('')}
        ${this.user ? `<span style="margin-left:auto;font-size:9px;color:var(--text-3)">${this.user.name} (${this.user.levelName}) <button class="btn _logout" style="font-size:8px;padding:1px 4px">로그아웃</button></span>` : ''}
      </div>
      <div id="_sc"></div>`;
    this.el.querySelectorAll('._st').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    this.el.querySelector('._logout')?.addEventListener('click', () => { this.token = null; this.user = null; localStorage.removeItem('crownyToken'); this.tab = 'login'; this.렌더(); });
    const ct = document.getElementById('_sc');
    if (!ct) return;
    switch (this.tab) {
      case 'login': this._loginTab(ct); break;
      case 'status': await this._statusTab(ct); break;
      case 'audit': await this._auditTab(ct); break;
      case 'users': await this._usersTab(ct); break;
    }
  }

  _loginTab(el) {
    el.innerHTML = `
      <div class="card" style="max-width:300px">
        <div class="card-h"><span class="card-t">로그인</span></div>
        <form id="_lf" style="display:flex;flex-direction:column;gap:6px">
          <input name="username" placeholder="사용자명" required>
          <input name="password" type="password" placeholder="비밀번호" required>
          <button type="submit" class="btn btn-p">로그인</button>
        </form>
        <div id="_lerr" style="color:var(--오류);font-size:10px;margin-top:4px"></div>
      </div>
      <div class="card" style="max-width:300px;margin-top:8px">
        <div class="card-h"><span class="card-t">등록</span></div>
        <form id="_rf" style="display:flex;flex-direction:column;gap:6px">
          <input name="username" placeholder="사용자명" required>
          <input name="password" type="password" placeholder="비밀번호" required>
          <button type="submit" class="btn">등록 (일반 등급)</button>
        </form>
      </div>
      <div style="font-size:9px;color:var(--text-3);margin-top:8px">기본 관리자: admin / crowny2026 (1급비밀)</div>`;

    el.querySelector('#_lf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
      const d = await r.json();
      if (r.ok) {
        this.token = d.token; this.user = d.user;
        localStorage.setItem('crownyToken', d.token);
        this.tab = 'status'; this.렌더();
      } else { document.getElementById('_lerr').textContent = d.error || '로그인 실패'; }
    });

    el.querySelector('#_rf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch(`${API}/auth/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
      const d = await r.json();
      if (r.ok) { document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${d.username} 등록 (${d.levelName})`, type: '확정' } })); }
      else { document.dispatchEvent(new CustomEvent('알림', { detail: { msg: d.error || '등록 실패', type: '오류' } })); }
    });
  }

  async _statusTab(el) {
    if (!this.user) { el.innerHTML = '<div style="color:var(--text-3);padding:8px">먼저 로그인하세요</div>'; return; }

    // 등급별 접근 가능 데이터 확인
    const levels = [0, 1, 2, 3, 4];
    const levelNames = ['일반', '대외비', '3급비밀', '2급비밀', '1급비밀'];

    // 등급별 데모 셀 생성 (처음만)
    const stats = await (await fetch(`${API}/stats`)).json();

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px;border-left:3px solid var(--확정)">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${this.user.name}</div>
        <div style="font-size:11px;color:var(--text-2)">등급: <b>${this.user.levelName}</b> (Level ${this.user.level})</div>
        <div style="font-size:10px;color:var(--text-3);margin-top:4px">Bell-LaPadula: Level ${this.user.level} 이하 데이터만 읽기 가능</div>
      </div>

      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">등급별 접근 권한</span></div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${levels.map(lv => {
            const accessible = this.user.level >= lv;
            return `<div class="pipe" style="border-left:3px solid ${accessible ? 'var(--확정)' : 'var(--오류)'}">
              <span style="font-weight:600;min-width:60px">${levelNames[lv]}</span>
              <span style="color:${accessible ? 'var(--확정)' : 'var(--오류)'};font-size:10px">${accessible ? '접근 가능' : '접근 차단'}</span>
              <span style="font-size:9px;color:var(--text-3);margin-left:auto">Level ${lv}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">데모: 등급별 셀 생성</span></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${levels.map(lv => `<button class="btn _mkCell" data-lv="${lv}" style="font-size:9px">${levelNames[lv]} 셀 생성</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-h"><span class="card-t">내가 볼 수 있는 셀</span></div>
        <div id="_filteredCells" style="max-height:200px;overflow-y:auto"></div>
      </div>`;

    // 등급별 셀 생성 버튼
    el.querySelectorAll('._mkCell').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lv = parseInt(btn.dataset.lv);
        await fetch(`${API}/cells`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ name: `${levelNames[lv]} 문서 ${Date.now()%1000}`, type: 3, content: `이 문서는 ${levelNames[lv]} 등급입니다`, classification: lv, layer: 0 })
        });
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${levelNames[lv]} 셀 생성`, type: '확정' } }));
        this._loadFilteredCells();
      });
    });

    this._loadFilteredCells();
  }

  async _loadFilteredCells() {
    const el = document.getElementById('_filteredCells');
    if (!el) return;
    const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
    const r = await fetch(`${API}/cells?limit=100`, { headers });
    const d = await r.json();
    const levelNames = ['일반', '대외비', '3급비밀', '2급비밀', '1급비밀'];
    el.innerHTML = (d.cells || []).map(c => {
      const lv = c.owner ?? 0;
      const cls = lv === 0 ? '확정' : lv <= 2 ? '미확인' : '오류';
      return `<div class="pipe" style="padding:2px 6px"><span class="badge ${cls}" style="font-size:7px;min-width:40px;text-align:center">${levelNames[lv]||'?'}</span><span style="font-weight:500">${c.name}</span><span style="color:var(--text-3);font-size:9px;margin-left:auto">${(c.content||'').toString().slice(0,25)}</span></div>`;
    }).join('') || '<div style="color:var(--text-3);font-size:10px;padding:6px">셀이 없습니다</div>';
  }

  async _auditTab(el) {
    const r = await fetch(`${API}/audit/recent?limit=30`);
    const logs = await r.json();
    const vr = await (await fetch(`${API}/audit/verify`)).json();

    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center">
        <span class="badge ${vr.valid ? '확정' : '오류'}">${vr.valid ? '무결성 통과' : '변조 감지!'}</span>
        <span style="font-size:10px;color:var(--text-3)">${vr.entries}건 검증</span>
        <button class="btn" id="_auditRefresh" style="margin-left:auto;font-size:9px">새로고침</button>
      </div>
      <div class="card">
        <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:1px">
          ${(logs||[]).map(e => {
            const cls = e.action.includes('FAIL') || e.action.includes('DENIED') || e.action.includes('BLOCKED') ? '오류' : e.action === 'LOGIN' ? '확정' : '미확인';
            return `<div class="pipe" style="padding:2px 6px;font-size:10px">
              <div class="dot ${cls}"></div>
              <span style="font-weight:500;min-width:80px;font-family:monospace;font-size:9px">${e.action}</span>
              <span style="min-width:50px">${e.user}</span>
              <span style="color:var(--text-3);flex:1">${(e.detail||'').slice(0,40)}</span>
              <span style="font-size:8px;color:var(--text-3)">${e.ts?.slice(11,19)||''}</span>
            </div>`;
          }).join('') || '<div style="color:var(--text-3);padding:6px">감사 로그 없음</div>'}
        </div>
      </div>
      <div style="margin-top:8px;font-size:8px;color:var(--text-3)">SHA-256 해시 체인 — 각 항목이 이전 해시를 참조하여 변조 즉시 감지</div>`;

    el.querySelector('#_auditRefresh')?.addEventListener('click', () => this.렌더());
  }

  async _usersTab(el) {
    const r = await fetch(`${API}/auth/users`);
    const userList = await r.json();

    el.innerHTML = `
      <div class="card" style="margin-bottom:8px">
        <div class="card-h"><span class="card-t">사용자 목록 (${userList.length})</span></div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${userList.map(u => `
            <div class="pipe"><div class="dot ${u.clearanceLevel >= 3 ? '오류' : u.clearanceLevel >= 1 ? '미확인' : '확정'}"></div>
            <span style="font-weight:500">${u.username}</span>
            <span class="badge" style="font-size:8px;background:${u.clearanceLevel>=3?'var(--오류-bg)':u.clearanceLevel>=1?'var(--미확인-bg)':'var(--확정-bg)'};color:${u.clearanceLevel>=3?'var(--오류)':u.clearanceLevel>=1?'var(--미확인)':'var(--확정)'}">${u.levelName}</span></div>
          `).join('')}
        </div>
      </div>
      ${this.user?.level >= 4 ? `
      <div class="card">
        <div class="card-h"><span class="card-t">등급 부여 (관리자 전용)</span></div>
        <form id="_grantForm" style="display:flex;gap:4px;align-items:end">
          <input name="username" placeholder="사용자명" required style="width:80px">
          <input name="password" placeholder="비밀번호" required style="width:80px">
          <select name="level" style="width:70px"><option value="0">일반</option><option value="1">대외비</option><option value="2">3급</option><option value="3">2급</option><option value="4">1급</option></select>
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>` : ''}`;

    el.querySelector('#_grantForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ username: f.username.value, password: f.password.value, clearanceLevel: parseInt(f.level.value) })
      });
      const d = await r.json();
      if (r.ok) { document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${d.username} → ${d.levelName}`, type: '확정' } })); this.렌더(); }
      else { document.dispatchEvent(new CustomEvent('알림', { detail: { msg: d.error, type: '오류' } })); }
    });
  }
}

export { 보안앱 };
