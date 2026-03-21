// CrownyCore — 교회 전용 UI
// 교인 한 명의 삶 = 디지털 트윈
// 교인 카드 → 출석/소그룹/기도/봉사/헌금/성장 통합

const API = '/api/foundry';

class 교회앱 {
  constructor(컨테이너ID) {
    this.el = document.getElementById(컨테이너ID);
    this.members = [];
    this.selected = null;
  }

  async 초기화() {
    // 교회 템플릿이 배포되어 있는지 확인
    const res = await fetch(`${API}/stats`);
    const stats = await res.json();
    if (stats.totalCells === 0) {
      // 교회 4개 핵심 템플릿 자동 배포
      const tmpls = ['ch-member','ch-smallgroup','ch-prayer','ch-offering'];
      for (const id of tmpls) {
        await fetch(`${API}/templates/${id}/deploy`, { method: 'POST' });
      }
    }
    await this.로드();
  }

  async 로드() {
    // "교인" 타입 셀 검색 (layer:0 + 사용자가 추가한 교인 셀)
    const res = await fetch(`${API}/cells?limit=500`);
    const data = await res.json();
    this.allCells = data.cells || [];
    // 교인 = layer 0이면서 type 3(문자열)이고 시스템 셀이 아닌 것
    this.members = this.allCells.filter(c =>
      c.type === 3 && !['교인등록','가족관계','소그룹목록','소그룹원','리더','모임일정',
        '나눔기록','기도제목','요청자','중보기도자','기도체인','감사나눔',
        '주일헌금','감사헌금','선교헌금','건축헌금','예산편성','월간보고',
        '새가족과정','은사파악','봉사배치','출석기록'].includes(c.name)
      && c.name && c.name.length >= 2 && c.name.length <= 20
    );
    this.렌더();
  }

  렌더() {
    if (!this.el) return;

    const stats = {
      total: this.members.length,
      confirmed: this.members.filter(c => c.status === 2).length,
      pending: this.members.filter(c => c.status === 0).length,
    };

    this.el.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <div class="stat" style="flex:1;min-width:80px"><div class="stat-v">${stats.total}</div><div class="stat-l">전체 교인</div></div>
        <div class="stat" style="flex:1;min-width:80px"><div class="stat-v" style="color:var(--확정)">${stats.confirmed}</div><div class="stat-l">정착 완료</div></div>
        <div class="stat" style="flex:1;min-width:80px"><div class="stat-v" style="color:var(--미확인)">${stats.pending}</div><div class="stat-l">새가족</div></div>
      </div>

      <!-- 교인 등록 -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-h"><span class="card-t">교인 등록</span></div>
        <form id="_memberForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">이름</label>
            <input name="name" placeholder="홍길동" required style="width:80px">
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">연락처</label>
            <input name="phone" placeholder="010-0000-0000" style="width:110px">
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">구분</label>
            <select name="category" style="width:80px">
              <option>새가족</option><option>정착</option><option>봉사자</option><option>리더</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">소그룹</label>
            <input name="group" placeholder="1셀" style="width:60px">
          </div>
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>

      <!-- 교인 목록 -->
      <div class="card">
        <div class="card-h">
          <span class="card-t">교인 명부</span>
          <input id="_memberFilter" placeholder="이름 검색..." style="width:120px;font-size:10px">
        </div>
        <div style="max-height:400px;overflow-y:auto" id="_memberList">
          ${this.members.length ? '' : '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:11px">위에서 교인을 등록하세요</div>'}
        </div>
      </div>

      <!-- 선택된 교인 상세 -->
      <div class="card" style="margin-top:12px;display:none" id="_memberDetail"></div>
    `;

    this._renderList();
    this._bindEvents();
  }

  _renderList(filter = '') {
    const list = document.getElementById('_memberList');
    if (!list) return;
    const q = filter.toLowerCase();
    const filtered = q ? this.members.filter(m => (m.name||'').toLowerCase().includes(q)) : this.members;

    list.innerHTML = `
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border);color:var(--text-3);font-size:9px;font-weight:600;letter-spacing:.04em">
          <th style="padding:4px 8px;text-align:left">상태</th>
          <th style="padding:4px 8px;text-align:left">이름</th>
          <th style="padding:4px 8px;text-align:left">정보</th>
          <th style="padding:4px 8px;text-align:left">근거</th>
          <th style="padding:4px 8px;text-align:left">신뢰</th>
          <th style="padding:4px 8px;text-align:right">작업</th>
        </tr></thead>
        <tbody>
        ${filtered.map(m => {
          const st = ({'2':'확정','0':'미확인','-2':'오류','-1':'미인지'})[String(m.status)] || '미인지';
          return `<tr class="ws-item" data-id="${m.id}" style="border-bottom:1px solid var(--border);cursor:pointer">
            <td style="padding:4px 8px"><div class="dot ${st}" style="display:inline-block"></div></td>
            <td style="padding:4px 8px;font-weight:500">${m.name}</td>
            <td style="padding:4px 8px;color:var(--text-3);font-size:10px">${typeof m.content === 'string' ? m.content.slice(0,20) : ''}</td>
            <td style="padding:4px 8px">${m.evidence||0}</td>
            <td style="padding:4px 8px">${m.trust||0}/13</td>
            <td style="padding:4px 8px;text-align:right">
              <button class="btn _ev" data-id="${m.id}" title="출석/활동 근거" style="font-size:9px;padding:1px 5px">출석+</button>
              <button class="btn _adv" data-id="${m.id}" title="상태 승격" style="font-size:9px;padding:1px 5px">전진▲</button>
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    `;

    // 행 클릭 → 상세
    list.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        this._showMember(+tr.dataset.id);
      });
    });

    // 출석 버튼
    list.querySelectorAll('._ev').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`${API}/cells/${btn.dataset.id}/evidence`, { method: 'POST' });
        await this.로드();
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '출석 기록!', type: '확정' } }));
      });
    });

    // 전진 버튼
    list.querySelectorAll('._adv').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`${API}/cells/${btn.dataset.id}/advance`, { method: 'POST' });
        await this.로드();
      });
    });
  }

  async _showMember(id) {
    const res = await fetch(`${API}/cells/${id}`);
    if (!res.ok) return;
    const m = await res.json();
    const detail = document.getElementById('_memberDetail');
    if (!detail) return;
    detail.style.display = 'block';

    // 연결 정보
    let chainHtml = '';
    try {
      const cr = await fetch(`${API}/cells/${id}/chain?depth=5`);
      const chain = await cr.json();
      if (chain.chain?.length > 1) {
        chainHtml = '<div style="margin-top:8px"><span style="font-size:9px;color:var(--text-3)">연결:</span> ' +
          chain.chain.map(c => `<span class="badge ${({'2':'확정','0':'미확인'})[String(c.status)]||'미인지'}" style="margin:1px">${c.name||'#'+c.id}</span>`).join(' → ') + '</div>';
      }
    } catch {}

    // Claim 검색
    let claimsHtml = '';
    try {
      const clRes = await fetch(`${API}/claims?subject=${encodeURIComponent(m.name)}`);
      const cls = await clRes.json();
      if (cls.claims?.length > 0) {
        claimsHtml = '<div style="margin-top:8px"><span style="font-size:9px;color:var(--text-3)">기록:</span><div style="display:flex;flex-direction:column;gap:2px;margin-top:4px">' +
          cls.claims.map(c => `<div class="pipe" style="font-size:10px"><span style="font-weight:500">${c.claim?.predicate||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span></div>`).join('') + '</div></div>';
      }
    } catch {}

    const st = ({'2':'▲ 정착 완료','0':'● 새가족','-2':'▼ 주의','-1':'◆ 미등록'})[String(m.status)] || '미등록';

    detail.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:14px">${m.name}</span>
        <span class="badge ${({'2':'확정','0':'미확인'})[String(m.status)]||'미인지'}">${st}</span>
      </div>
      <table style="font-size:11px;width:100%">
        <tr><td style="color:var(--text-3);padding:2px 8px 2px 0">정보</td><td>${m.content||'—'}</td></tr>
        <tr><td style="color:var(--text-3);padding:2px 8px 2px 0">출석(근거)</td><td>${m.evidence||0}회 ${m.evidence>=3?'→ 정착 확정':'(3회 시 자동 정착)'}</td></tr>
        <tr><td style="color:var(--text-3);padding:2px 8px 2px 0">신뢰도</td><td>${m.trust||0}/13</td></tr>
        <tr><td style="color:var(--text-3);padding:2px 8px 2px 0">등록일</td><td>${m.createdAt ? new Date(m.createdAt).toLocaleDateString('ko') : '—'}</td></tr>
      </table>
      ${chainHtml}
      ${claimsHtml}
      <div style="display:flex;gap:4px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" onclick="document.getElementById('_claimInput').style.display='flex'">기록 추가</button>
        <button class="btn" onclick="fetch('${API}/cells/${m.id}/evidence',{method:'POST'}).then(()=>location.reload())">출석+</button>
        <button class="btn" style="color:var(--오류)" onclick="if(confirm('삭제?'))fetch('${API}/cells/${m.id}',{method:'DELETE'}).then(()=>location.reload())">삭제</button>
      </div>
      <div id="_claimInput" style="display:none;margin-top:8px;gap:4px;align-items:center">
        <select id="_claimType" style="width:70px;font-size:10px">
          <option>헌금</option><option>봉사</option><option>기도</option><option>출석</option><option>교육</option><option>심방</option><option>간증</option>
        </select>
        <input id="_claimVal" placeholder="내용 (예: 주일헌금 5만원)" style="flex:1;font-size:10px">
        <button class="btn btn-p" id="_claimSubmit" style="font-size:10px">저장</button>
      </div>
    `;

    document.getElementById('_claimSubmit')?.addEventListener('click', async () => {
      const type = document.getElementById('_claimType')?.value;
      const val = document.getElementById('_claimVal')?.value;
      if (!val) return;
      await fetch(`${API}/claims`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ subject: m.name, predicate: type, object: val, layer: 1 })
      });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${m.name} ${type}: ${val}`, type: '확정' } }));
      this._showMember(m.id);
    });
  }

  _bindEvents() {
    document.getElementById('_memberForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      if (!name) return;
      const info = [f.category.value, f.phone.value, f.group.value ? f.group.value+'셀' : ''].filter(Boolean).join(', ');
      const confirmed = f.category.value === '정착' || f.category.value === '봉사자' || f.category.value === '리더';

      await fetch(`${API}/cells`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, type: 3, content: info, confirmed, layer: 0 })
      });
      f.reset();
      await this.로드();
      document.dispatchEvent(new CustomEvent('데이터변경'));
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${name} 등록 완료`, type: '확정' } }));
    });

    document.getElementById('_memberFilter')?.addEventListener('input', (e) => {
      this._renderList(e.target.value);
    });
  }
}

export { 교회앱 };
