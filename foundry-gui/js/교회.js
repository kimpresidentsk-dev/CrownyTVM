// CrownyCore — 교회 관리 (고도화)
// 7탭: 교인 | 출석체크 | 소그룹 | 헌금 | 기도 | 설교 | 공지
// 코드 정리: 에러 핸들링, 중복 방지, 가독성
const API = '/api/foundry';

// ─── 헬퍼 ───
async function safeFetch(url, opts) {
  try {
    const r = await fetch(url, opts);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function parseAmount(s) {
  const m = (s || '').match(/(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, '')) : 0;
}

function fmtDate(ts) {
  return ts ? new Date(ts).toLocaleDateString('ko') : '';
}

function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleString('ko', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

// 시스템 셀 이름 (교인 필터에서 제외)
const SYS_NAMES = new Set(['교인등록','가족관계','소그룹목록','소그룹원','리더','모임일정','나눔기록','기도제목','요청자','중보기도자','기도체인','감사나눔','주일헌금','감사헌금','선교헌금','건축헌금','예산편성','월간보고','새가족과정','은사파악','봉사배치','출석기록','소그룹배정','성장추적','성장단계','정착확인','총수입','집행내역','잔액현황','감사결과','긴급도','기도횟수','응답기록','활동도','그룹건강','설교목록','설교자','성경본문','설교시리즈','핵심메시지','영상링크','삶적용','적용확인','교회재정','크라우니타워','가계부','긴급']);

class 교회앱 {
  constructor(id) {
    this.el = document.getElementById(id);
    this.tab = 'member';
    this.selectedMember = null;
  }

  async 초기화() {
    if (!this.el) return;
    const stats = await safeFetch(`${API}/stats`);
    if (stats && stats.totalCells === 0) {
      for (const tid of ['ch-member', 'ch-smallgroup', 'ch-prayer', 'ch-offering']) {
        await safeFetch(`${API}/templates/${tid}/deploy`, { method: 'POST' });
      }
    }
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'member', label: '교인' },
      { id: 'attendance', label: '출석체크' },
      { id: 'group', label: '소그룹' },
      { id: 'offering', label: '헌금' },
      { id: 'prayer', label: '기도' },
      { id: 'sermon', label: '설교' },
      { id: 'notice', label: '공지' },
    ];

    this.el.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;flex-wrap:wrap">
        ${tabs.map(t => `
          <button class="btn ${this.tab === t.id ? 'btn-p' : ''} _tab" data-tab="${t.id}" style="font-size:10px;padding:3px 8px">
            ${t.label}
          </button>
        `).join('')}
        <button class="btn" id="_demoBtn" style="font-size:9px;padding:2px 6px;margin-left:auto;color:var(--text-3)" title="교인20+헌금50+설교4 데모 데이터 생성">데모 생성</button>
      </div>
      <div id="_cc"></div>
    `;

    this.el.querySelectorAll('._tab').forEach(b => {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab;
        this.렌더();
      });
    });

    // 데모 데이터 생성 버튼
    document.getElementById('_demoBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('_demoBtn');
      if (btn) { btn.disabled = true; btn.textContent = '생성중...'; }
      const result = await safeFetch(`${API}/demo/church`, { method: 'POST' });
      if (result) {
        this._notify(`데모 생성: 교인${result.members} 출석${result.attendance} 헌금${result.offerings} 설교${result.sermons}`);
      }
      this.렌더();
    });

    const ct = document.getElementById('_cc');
    if (!ct) return;

    switch (this.tab) {
      case 'member': await this._memberTab(ct); break;
      case 'attendance': await this._attendanceTab(ct); break;
      case 'group': await this._groupTab(ct); break;
      case 'offering': await this._offeringTab(ct); break;
      case 'prayer': await this._prayerTab(ct); break;
      case 'sermon': await this._sermonTab(ct); break;
      case 'notice': await this._noticeTab(ct); break;
    }
  }

  // ─── 교인 목록 가져오기 ───
  async _getMembers() {
    const data = await safeFetch(`${API}/cells?limit=500`);
    if (!data) return [];
    return (data.cells || []).filter(c =>
      c.type === 3 && c.name && !SYS_NAMES.has(c.name) &&
      c.name.length >= 2 && c.name.length <= 20 &&
      !c.name.includes(':') && !c.name.includes('가계부')
    );
  }

  // ═══ 교인 탭 ═══
  async _memberTab(el) {
    const members = await this._getMembers();
    const confirmed = members.filter(m => m.status === 2).length;

    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <div class="stat" style="flex:1"><div class="stat-v">${members.length}</div><div class="stat-l">전체</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${confirmed}</div><div class="stat-l">정착</div></div>
      </div>

      <div class="card" style="margin-bottom:6px">
        <form id="_mf" style="display:flex;gap:3px;flex-wrap:wrap;align-items:end">
          <input name="name" placeholder="이름" required style="width:55px">
          <input name="phone" placeholder="연락처" style="width:85px">
          <select name="cat" style="width:55px">
            <option>새가족</option><option>정착</option><option>봉사자</option><option>리더</option>
          </select>
          <input name="group" placeholder="소그룹" style="width:45px">
          <button type="submit" class="btn btn-p">등록</button>
          <button type="button" class="btn" id="_mCsv" style="font-size:9px">CSV</button>
        </form>
      </div>

      <div class="card">
        <input id="_mq" placeholder="검색..." style="width:100px;margin-bottom:4px">
        <div style="max-height:250px;overflow-y:auto" id="_ml"></div>
      </div>

      <div id="_profile" style="display:none;margin-top:8px"></div>
    `;

    this._renderMemberList(members);

    // 교인 등록
    el.querySelector('#_mf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const info = [f.cat.value, f.phone.value, f.group.value].filter(Boolean).join(', ');
      await safeFetch(`${API}/cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name.value, type: 3, content: info,
          confirmed: f.cat.value !== '새가족', layer: 0, scope: 3
        })
      });
      f.reset();
      this._notify('교인 등록');
      this.렌더();
    });

    // 검색
    el.querySelector('#_mq')?.addEventListener('input', async (e) => {
      const q = e.target.value.toLowerCase();
      const all = await this._getMembers();
      this._renderMemberList(q ? all.filter(m => m.name.toLowerCase().includes(q)) : all);
    });

    // 교인 CSV
    el.querySelector('#_mCsv')?.addEventListener('click', async () => {
      const members = await this._getMembers();
      const rows = ['이름,정보,출석횟수,상태'];
      members.forEach(m => {
        const st = m.status === 2 ? '정착' : '새가족';
        rows.push(`${m.name},"${m.content || ''}",${m.evidence || 0},${st}`);
      });
      this._downloadCsv(rows.join('\n'), `교인명부_${new Date().toISOString().slice(0, 10)}.csv`);
    });
  }

  _renderMemberList(members) {
    const ml = document.getElementById('_ml');
    if (!ml) return;

    ml.innerHTML = members.map(m => {
      const st = ({ '2': '확정', '0': '미확인' })[String(m.status)] || '미인지';
      return `
        <div class="ws-item" style="padding:3px 6px" data-id="${m.id}" data-name="${m.name}">
          <div class="dot ${st}"></div>
          <span class="ws-name" style="font-weight:500;cursor:pointer;text-decoration:underline dotted" title="클릭하면 상세 정보">${m.name}</span>
          <span style="color:var(--text-3);font-size:9px">${m.content || ''}</span>
          <span style="font-size:9px;color:var(--text-3);margin-left:auto">출석${m.evidence || 0}</span>
          <button class="btn _at" data-id="${m.id}" style="font-size:8px;padding:0 4px;margin-left:4px">출석</button>
        </div>
      `;
    }).join('') || '<div style="padding:6px;color:var(--text-3);font-size:10px">교인을 등록하세요</div>';

    // 출석 버튼
    ml.querySelectorAll('._at').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        b.disabled = true;
        b.textContent = '...';
        await safeFetch(`${API}/cells/${b.dataset.id}/evidence`, { method: 'POST' });
        this._notify('출석');
        this.렌더();
      });
    });

    // 교인 이름 클릭 → 상세 프로필
    ml.querySelectorAll('.ws-item').forEach(item => {
      item.querySelector('.ws-name')?.addEventListener('click', () => {
        this._showProfile(item.dataset.name);
      });
    });
  }

  // ─── 교인 상세 프로필 ───
  async _showProfile(name) {
    const profileEl = document.getElementById('_profile');
    if (!profileEl) return;
    profileEl.style.display = 'block';

    const data = await safeFetch(`${API}/claims?subject=${encodeURIComponent(name)}`);
    const claims = data?.claims || [];

    const attendance = claims.filter(c => c.claim?.predicate === '출석');
    const offerings = claims.filter(c => c.claim?.predicate === '헌금');
    const prayers = claims.filter(c => c.claim?.predicate === '기도제목' || c.claim?.predicate === '기도');
    const groups = claims.filter(c => c.claim?.predicate === '소그룹');
    const totalOffering = offerings.reduce((s, c) => s + parseAmount(c.claim?.object), 0);

    // 성장 단계 판별
    const stage = attendance.length >= 12 ? '리더' :
                  attendance.length >= 6 ? '봉사자' :
                  attendance.length >= 3 ? '정착' : '새가족';
    const stageColor = stage === '리더' ? 'var(--확정)' :
                       stage === '봉사자' ? 'var(--확정)' :
                       stage === '정착' ? 'var(--미확인)' : 'var(--미인지)';

    profileEl.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:13px">${name}</span>
          <span class="badge" style="background:${stageColor};color:#fff;font-size:9px">${stage}</span>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:8px">
          <div class="stat" style="flex:1"><div class="stat-v">${attendance.length}</div><div class="stat-l">출석</div></div>
          <div class="stat" style="flex:1"><div class="stat-v">${totalOffering.toLocaleString()}</div><div class="stat-l">헌금(원)</div></div>
          <div class="stat" style="flex:1"><div class="stat-v">${prayers.length}</div><div class="stat-l">기도</div></div>
        </div>

        <!-- 성장 단계 바 -->
        <div style="display:flex;gap:2px;margin-bottom:8px;align-items:center">
          ${['새가족', '정착', '봉사자', '리더'].map(s => `
            <div style="flex:1;height:4px;border-radius:2px;background:${stage === s || ['새가족','정착','봉사자','리더'].indexOf(s) <= ['새가족','정착','봉사자','리더'].indexOf(stage) ? stageColor : 'var(--border)'}"></div>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--text-3);margin-bottom:8px">
          <span>새가족</span><span>정착</span><span>봉사</span><span>리더</span>
        </div>

        ${groups.length ? `<div style="font-size:10px;margin-bottom:6px">소그룹: <b>${groups.map(g => g.claim?.object).join(', ')}</b></div>` : ''}

        <div style="font-size:9px;font-weight:600;color:var(--text-3);margin-bottom:4px">최근 활동</div>
        <div style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:1px">
          ${claims.slice(-10).reverse().map(c => `
            <div class="pipe" style="padding:2px 6px;font-size:9px">
              <span style="font-weight:500;min-width:30px">${c.claim?.predicate || ''}</span>
              <span style="color:var(--text-3)">${(c.claim?.object || '').slice(0, 30)}</span>
              <span style="font-size:7px;color:var(--text-3);margin-left:auto">${fmtDate(c.createdAt)}</span>
            </div>
          `).join('')}
        </div>

        <button class="btn" style="margin-top:6px;font-size:9px" onclick="document.getElementById('_profile').style.display='none'">닫기</button>
      </div>
    `;
  }

  // ═══ 출석 체크 탭 ═══
  async _attendanceTab(el) {
    const members = await this._getMembers();
    const today = new Date().toLocaleDateString('ko');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 오늘 출석 Claim
    const todayClaims = await safeFetch(`${API}/claims?predicate=${encodeURIComponent('출석')}&after=${todayStart.getTime()}`);
    const checked = new Set((todayClaims?.claims || []).map(c => c.claim?.subject));
    const cnt = checked.size;

    // 주간 출석 이력 (최근 4주)
    const allAttendance = await safeFetch(`${API}/claims?predicate=${encodeURIComponent('출석')}`);
    const attClaims = allAttendance?.claims || [];
    const weeklyHistory = [];
    for (let w = 0; w < 4; w++) {
      const weekEnd = new Date(todayStart.getTime() - w * 7 * 86400000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 86400000);
      const weekClaims = attClaims.filter(c => c.createdAt >= weekStart.getTime() && c.createdAt < weekEnd.getTime());
      const uniqueNames = new Set(weekClaims.map(c => c.claim?.subject));
      weeklyHistory.push({
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}주`,
        count: uniqueNames.size,
        rate: members.length > 0 ? Math.round(uniqueNames.size / members.length * 100) : 0
      });
    }

    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
        <span style="font-weight:600;font-size:12px">${today}</span>
        <span class="badge ${cnt > 0 ? '확정' : '미인지'}">
          ${cnt}/${members.length}명 (${members.length > 0 ? Math.round(cnt / members.length * 100) : 0}%)
        </span>
        <button class="btn btn-p" id="_ckAll" style="margin-left:auto;font-size:9px">전체 출석</button>
      </div>

      <!-- 주간 출석 차트 -->
      <div class="card" style="margin-bottom:10px;padding:10px">
        <div style="font-size:9px;font-weight:600;color:var(--text-3);margin-bottom:6px">최근 4주 출석률</div>
        <div style="display:flex;gap:6px;align-items:end;height:60px">
          ${weeklyHistory.reverse().map(w => {
            const h = Math.max(4, Math.round(w.rate * 0.55));
            const color = w.rate >= 80 ? 'var(--확정)' : w.rate >= 50 ? 'var(--미확인)' : 'var(--오류)';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
              <span style="font-size:10px;font-weight:600;color:${color}">${w.rate}%</span>
              <div style="width:100%;height:${h}px;background:${color};border-radius:2px;opacity:.7"></div>
              <span style="font-size:8px;color:var(--text-3)">${w.label}</span>
              <span style="font-size:7px;color:var(--text-3)">${w.count}명</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <input id="_aq" placeholder="이름 검색 → Enter" style="width:150px;margin-bottom:6px;font-size:12px" autofocus>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:3px" id="_aG">
          ${members.map(m => {
            const ck = checked.has(m.name);
            return `
              <div class="_ac" data-id="${m.id}" data-name="${m.name}"
                   style="padding:5px 8px;border:1px solid ${ck ? 'var(--확정)' : 'var(--border)'};border-radius:3px;cursor:${ck ? 'default' : 'pointer'};display:flex;align-items:center;gap:4px;${ck ? 'background:var(--확정-bg);opacity:.7' : ''}">
                <span style="width:12px;height:12px;border:1.5px solid ${ck ? 'var(--확정)' : 'var(--border)'};border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--확정)">${ck ? 'v' : ''}</span>
                <span style="font-size:11px;font-weight:${ck ? '400' : '500'}">${m.name}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // 카드 클릭 → 출석
    el.querySelectorAll('._ac').forEach(card => {
      card.addEventListener('click', async () => {
        if (checked.has(card.dataset.name)) return;
        card.style.pointerEvents = 'none';
        card.style.opacity = '0.5';

        await Promise.all([
          safeFetch(`${API}/cells/${card.dataset.id}/evidence`, { method: 'POST' }),
          safeFetch(`${API}/claims`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: card.dataset.name, predicate: '출석',
              object: today, layer: 0, scope: 3
            })
          })
        ]);

        this._notify(`${card.dataset.name} 출석`);
        this.렌더();
      });
    });

    // 빠른 검색
    const aq = el.querySelector('#_aq');
    aq?.addEventListener('input', () => {
      const q = aq.value.toLowerCase();
      el.querySelectorAll('._ac').forEach(c => {
        c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    aq?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const visible = [...el.querySelectorAll('._ac')].filter(c =>
          c.style.display !== 'none' && !checked.has(c.dataset.name)
        );
        if (visible.length > 0) visible[0].click();
        aq.value = '';
        el.querySelectorAll('._ac').forEach(c => c.style.display = '');
      }
    });

    // 전체 출석
    el.querySelector('#_ckAll')?.addEventListener('click', async () => {
      const unchecked = members.filter(m => !checked.has(m.name));
      const promises = unchecked.flatMap(m => [
        safeFetch(`${API}/cells/${m.id}/evidence`, { method: 'POST' }),
        safeFetch(`${API}/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: m.name, predicate: '출석', object: today, layer: 0, scope: 3 })
        })
      ]);
      await Promise.all(promises);
      this._notify(`전체 출석 ${members.length}명`);
      this.렌더();
    });
  }

  // ═══ 소그룹 탭 ═══
  async _groupTab(el) {
    const data = await safeFetch(`${API}/claims?predicate=${encodeURIComponent('소그룹')}`);
    const groups = {};
    (data?.claims || []).forEach(c => {
      const g = c.claim?.object || '미배정';
      (groups[g] = groups[g] || []).push(c.claim?.subject);
    });

    el.innerHTML = `
      <div class="card" style="margin-bottom:6px">
        <div style="display:flex;gap:3px;align-items:end">
          <input id="_gm" placeholder="교인" style="width:65px">
          <input id="_gn" placeholder="소그룹" style="width:60px">
          <button class="btn btn-p" id="_ga">배정</button>
        </div>
      </div>
      <div class="card">
        ${Object.keys(groups).length ? Object.entries(groups).map(([g, ms]) => `
          <div style="margin-bottom:6px">
            <div style="font-size:9px;font-weight:600;color:var(--text-3);margin-bottom:2px">${g} (${ms.length})</div>
            <div style="display:flex;gap:2px;flex-wrap:wrap">
              ${ms.map(m => `<span class="badge 확정">${m}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">소그룹 배정이 없습니다</div>'}
      </div>
    `;

    el.querySelector('#_ga')?.addEventListener('click', async () => {
      const m = document.getElementById('_gm')?.value?.trim();
      const g = document.getElementById('_gn')?.value?.trim();
      if (!m || !g) return;
      await safeFetch(`${API}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: m, predicate: '소그룹', object: g, layer: 1, scope: 3 })
      });
      this._notify(`${m} → ${g}`);
      this.렌더();
    });
  }

  // ═══ 헌금 탭 + 날짜 필터 + 리포트 + CSV ═══
  async _offeringTab(el) {
    // 날짜 범위 계산
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    el.innerHTML = `
      <div class="card" style="margin-bottom:6px">
        <form id="_of" style="display:flex;gap:3px;flex-wrap:wrap;align-items:end">
          <input name="name" placeholder="교인" required style="width:55px">
          <select name="type" style="width:65px">
            <option>주일헌금</option><option>감사헌금</option><option>선교헌금</option><option>십일조</option><option>건축헌금</option>
          </select>
          <input name="amount" type="number" placeholder="금액" required style="width:65px">
          <button type="submit" class="btn btn-p">입력</button>
        </form>
      </div>
      <div style="display:flex;gap:3px;margin-bottom:8px">
        <button class="btn _ofRange btn-p" data-range="all">전체</button>
        <button class="btn _ofRange" data-range="month">이번 달</button>
        <button class="btn _ofRange" data-range="last">지난 달</button>
        <button class="btn" id="_oRpt">리포트</button>
        <button class="btn" id="_oCsv">CSV</button>
      </div>
      <div id="_ofStats"></div>
      <div id="_rpt" style="display:none"></div>
      <div class="card" id="_ofList"></div>
    `;

    // 헌금 입력
    el.querySelector('#_of')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const obj = `${f.type.value} ${Number(f.amount.value).toLocaleString()}원`;
      await safeFetch(`${API}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: f.name.value, predicate: '헌금', object: obj, layer: 1, scope: 3 })
      });
      f.reset();
      this._notify('헌금 기록');
      this.렌더();
    });

    // 날짜 필터 로드
    const loadOfferings = async (range) => {
      let url = `${API}/claims?predicate=${encodeURIComponent('헌금')}`;
      if (range === 'month') url += `&after=${thisMonthStart}`;
      else if (range === 'last') url += `&after=${lastMonthStart}&before=${thisMonthStart}`;

      const data = await safeFetch(url);
      const offs = data?.claims || [];
      const total = offs.reduce((s, c) => s + parseAmount(c.claim?.object), 0);

      // 종류별/교인별
      const byType = {}, byPerson = {};
      offs.forEach(c => {
        const t = (c.claim?.object || '').split(' ')[0] || '기타';
        byType[t] = (byType[t] || 0) + parseAmount(c.claim?.object);
        const p = c.claim?.subject || '?';
        byPerson[p] = (byPerson[p] || 0) + parseAmount(c.claim?.object);
      });

      // 통계
      document.getElementById('_ofStats').innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <div class="stat" style="flex:1"><div class="stat-v">${offs.length}</div><div class="stat-l">건수</div></div>
          <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${total.toLocaleString()}</div><div class="stat-l">합계(원)</div></div>
        </div>
      `;

      // 목록
      document.getElementById('_ofList').innerHTML = `
        <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:1px">
          ${offs.length ? offs.slice().reverse().map(c => `
            <div class="pipe" style="padding:2px 6px">
              <span style="font-weight:500;min-width:35px">${c.claim?.subject || ''}</span>
              <span style="color:var(--text-3)">${c.claim?.object || ''}</span>
              <span style="font-size:7px;color:var(--text-3);margin-left:auto">${fmtDate(c.createdAt)}</span>
            </div>
          `).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">헌금 기록 없음</div>'}
        </div>
      `;

      // 리포트 (버튼 복제로 중복 리스너 방지)
      const rptBtn = document.getElementById('_oRpt');
      if (rptBtn) { const nb = rptBtn.cloneNode(true); rptBtn.replaceWith(nb); }
      document.getElementById('_oRpt')?.addEventListener('click', () => {
        const r = document.getElementById('_rpt');
        r.style.display = r.style.display === 'none' ? 'block' : 'none';
        r.innerHTML = `
          <div class="card" style="margin-bottom:6px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
              <div>
                <div style="font-size:8px;font-weight:600;color:var(--text-3);margin-bottom:3px">종류별</div>
                ${Object.entries(byType).map(([t, a]) => `
                  <div style="display:flex;justify-content:space-between;padding:1px 0">
                    <span>${t}</span><span style="font-weight:600">${a.toLocaleString()}원</span>
                  </div>
                `).join('')}
                <div style="border-top:1px solid var(--border);padding-top:2px;display:flex;justify-content:space-between;font-weight:700">
                  <span>합계</span><span style="color:var(--확정)">${total.toLocaleString()}원</span>
                </div>
              </div>
              <div>
                <div style="font-size:8px;font-weight:600;color:var(--text-3);margin-bottom:3px">교인별</div>
                ${Object.entries(byPerson).sort((a, b) => b[1] - a[1]).map(([p, a]) => `
                  <div style="display:flex;justify-content:space-between;padding:1px 0">
                    <span>${p}</span><span>${a.toLocaleString()}원</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      });

      // CSV (버튼 복제로 중복 리스너 방지)
      const csvBtn = document.getElementById('_oCsv');
      if (csvBtn) { const nb = csvBtn.cloneNode(true); csvBtn.replaceWith(nb); }
      document.getElementById('_oCsv')?.addEventListener('click', () => {
        const rows = ['날짜,교인,종류,금액'];
        offs.forEach(c => {
          const parts = (c.claim?.object || '').split(' ');
          rows.push(`${fmtDate(c.createdAt)},${c.claim?.subject || ''},${parts[0] || ''},${parts[1] || ''}`);
        });
        this._downloadCsv(rows.join('\n'), `헌금_${new Date().toISOString().slice(0, 10)}.csv`);
      });

      // 범위 버튼 활성화
      el.querySelectorAll('._ofRange').forEach(b => {
        b.classList.toggle('btn-p', b.dataset.range === range);
      });
    };

    // 범위 버튼
    el.querySelectorAll('._ofRange').forEach(b => {
      b.addEventListener('click', () => loadOfferings(b.dataset.range));
    });

    // 초기 로드
    loadOfferings('all');
  }

  // ═══ 기도 탭 ═══
  async _prayerTab(el) {
    const data = await safeFetch(`${API}/claims`);
    const prayers = (data?.claims || []).filter(c =>
      c.claim?.predicate === '기도제목' || c.claim?.predicate === '기도'
    );
    const answered = prayers.filter(c => (c.claim?.object || '').includes('응답'));

    el.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <div class="stat" style="flex:1"><div class="stat-v">${prayers.length}</div><div class="stat-l">제목</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${answered.length}</div><div class="stat-l">응답</div></div>
      </div>
      <div class="card" style="margin-bottom:6px">
        <form id="_pf" style="display:flex;gap:3px;align-items:end">
          <input name="who" placeholder="누구를 위해" required style="width:65px">
          <input name="content" placeholder="기도 내용" required style="flex:1;min-width:80px">
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:2px;max-height:250px;overflow-y:auto">
          ${prayers.length ? prayers.slice().reverse().map(c => `
            <div class="pipe" style="padding:2px 6px">
              <span style="font-weight:500">${c.claim?.subject || ''}</span>
              <span style="flex:1;color:var(--text-2);font-size:10px">${c.claim?.object || ''}</span>
              <button class="btn _ans" data-s="${c.claim?.subject}" style="font-size:7px;padding:0 3px">응답</button>
            </div>
          `).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">기도제목을 등록하세요</div>'}
        </div>
      </div>
    `;

    el.querySelector('#_pf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await safeFetch(`${API}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: f.who.value, predicate: '기도제목', object: f.content.value, layer: 1, scope: 3 })
      });
      f.reset();
      this._notify('기도제목 등록');
      this.렌더();
    });

    el.querySelectorAll('._ans').forEach(b => {
      b.addEventListener('click', async () => {
        const note = prompt('응답 내용:');
        if (!note) return;
        await safeFetch(`${API}/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: b.dataset.s, predicate: '기도', object: '응답: ' + note, layer: 3, scope: 3 })
        });
        this._notify('기도 응답!');
        this.렌더();
      });
    });
  }

  // ═══ 설교 탭 ═══
  async _sermonTab(el) {
    const data = await safeFetch(`${API}/claims?predicate=${encodeURIComponent('설교')}`);
    const sermons = (data?.claims || []).reverse();

    el.innerHTML = `
      <div class="card" style="margin-bottom:6px">
        <form id="_sf" style="display:flex;flex-direction:column;gap:3px;max-width:380px">
          <div style="display:flex;gap:3px">
            <input name="date" type="date" required style="width:100px" value="${new Date().toISOString().slice(0, 10)}">
            <input name="title" placeholder="설교 제목" required style="flex:1">
          </div>
          <div style="display:flex;gap:3px">
            <input name="speaker" placeholder="설교자" style="width:70px">
            <input name="bible" placeholder="성경 본문" style="flex:1">
          </div>
          <textarea name="summary" placeholder="핵심 메시지" rows="2" style="resize:vertical"></textarea>
          <button type="submit" class="btn btn-p" style="align-self:flex-start">등록 + 공지</button>
        </form>
      </div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">
          ${sermons.length ? sermons.map(s => {
            const p = (s.claim?.object || '').split('|').map(x => x.trim());
            return `
              <div class="card" style="padding:6px;border-left:2px solid var(--확정)">
                <div style="font-weight:600;font-size:11px">${p[0] || ''}</div>
                ${p[1] ? `<div style="font-size:9px;color:var(--text-2)">${p[1]}</div>` : ''}
                ${p[2] ? `<div style="font-size:9px;color:var(--text-3)">${p[2]}</div>` : ''}
              </div>
            `;
          }).join('') : '<div style="color:var(--text-3);font-size:10px;padding:6px">설교를 등록하세요</div>'}
        </div>
      </div>
    `;

    el.querySelector('#_sf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const obj = [
        `[${f.date.value}] ${f.title.value}`,
        f.bible.value ? `본문: ${f.bible.value}` : '',
        f.summary.value || '',
        f.speaker.value ? `설교자: ${f.speaker.value}` : '',
      ].filter(Boolean).join(' | ');

      // 설교 + 공지 동시 생성
      await Promise.all([
        safeFetch(`${API}/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: f.date.value, predicate: '설교', object: obj, layer: 1, scope: 3 })
        }),
        safeFetch(`${API}/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: '공지', predicate: `설교: ${f.title.value}`, object: `${f.bible.value || ''} — ${f.summary.value || ''}`, layer: 0, scope: 3 })
        })
      ]);

      f.reset();
      this._notify('설교 등록 + 공지');
      this.렌더();
    });
  }

  // ═══ 공지 탭 ═══
  async _noticeTab(el) {
    el.innerHTML = `
      <div class="card" style="margin-bottom:6px">
        <form id="_nf" style="display:flex;flex-direction:column;gap:3px">
          <input name="title" placeholder="제목" required>
          <textarea name="content" placeholder="내용" rows="2" style="resize:vertical"></textarea>
          <button type="submit" class="btn btn-p" style="align-self:flex-start">게시</button>
        </form>
      </div>
      <div id="_nl"></div>
    `;

    el.querySelector('#_nf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await safeFetch(`${API}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: '공지', predicate: f.title.value, object: f.content.value, layer: 0, scope: 3 })
      });
      f.reset();
      this._notify('공지 게시');
      this._loadNotices();
    });

    this._loadNotices();
  }

  async _loadNotices() {
    const data = await safeFetch(`${API}/claims?subject=${encodeURIComponent('공지')}`);
    const el = document.getElementById('_nl');
    if (!el) return;
    el.innerHTML = (data?.claims || []).reverse().map(n => `
      <div class="card" style="margin-bottom:3px;padding:6px">
        <div style="font-weight:600;font-size:10px">${n.claim?.predicate || ''}</div>
        <div style="font-size:9px;color:var(--text-2);white-space:pre-wrap;margin-top:1px">${n.claim?.object || ''}</div>
        <div style="font-size:7px;color:var(--text-3);margin-top:1px">${fmtTime(n.createdAt)}</div>
      </div>
    `).join('') || '<div style="color:var(--text-3);font-size:10px;padding:6px">공지 없음</div>';
  }

  // ─── 유틸 ───
  _notify(msg) {
    document.dispatchEvent(new CustomEvent('알림', { detail: { msg, type: '확정' } }));
    document.dispatchEvent(new CustomEvent('데이터변경'));
  }

  _downloadCsv(content, filename) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    this._notify('CSV 다운로드');
  }
}

export { 교회앱 };
