// CrownyCore — 교회 관리 (실사용 수준)
// 탭: 교인 | 소그룹 | 헌금 | 기도 | 공지
const API = '/api/foundry';

class 교회앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'member'; }

  async 초기화() {
    if (!this.el) return;
    // 핵심 템플릿 자동 배포
    const stats = await (await fetch(`${API}/stats`)).json();
    if (stats.totalCells === 0) {
      for (const id of ['ch-member','ch-smallgroup','ch-prayer','ch-offering']) {
        await fetch(`${API}/templates/${id}/deploy`, { method: 'POST' });
      }
    }
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'member', label: '교인 관리' },
      { id: 'group', label: '소그룹' },
      { id: 'offering', label: '헌금·재정' },
      { id: 'prayer', label: '기도' },
      { id: 'notice', label: '공지·주보' },
    ];

    this.el.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">
        ${tabs.map(t => `<button class="btn ${this.tab===t.id?'btn-p':''} _tab" data-tab="${t.id}" style="font-size:11px">${t.label}</button>`).join('')}
      </div>
      <div id="_churchContent"></div>
    `;

    this.el.querySelectorAll('._tab').forEach(btn => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.렌더(); });
    });

    const content = document.getElementById('_churchContent');
    if (!content) return;

    switch (this.tab) {
      case 'member': await this._memberTab(content); break;
      case 'group': await this._groupTab(content); break;
      case 'offering': await this._offeringTab(content); break;
      case 'prayer': await this._prayerTab(content); break;
      case 'notice': this._noticeTab(content); break;
    }
  }

  // ─── 교인 관리 탭 ───
  async _memberTab(el) {
    const cells = await (await fetch(`${API}/cells?limit=500`)).json();
    const sysNames = ['교인등록','가족관계','소그룹목록','소그룹원','리더','모임일정','나눔기록','기도제목','요청자','중보기도자','기도체인','감사나눔','주일헌금','감사헌금','선교헌금','건축헌금','예산편성','월간보고','새가족과정','은사파악','봉사배치','출석기록','소그룹배정','성장추적','성장단계','정착확인','총수입','집행내역','잔액현황','감사결과','긴급도','기도횟수','응답기록','활동도','그룹건강','설교목록','설교자','성경본문','설교시리즈','핵심메시지','영상링크','삶적용','적용확인'];
    const members = (cells.cells||[]).filter(c => c.type === 3 && c.name && !sysNames.includes(c.name) && c.name.length >= 2 && c.name.length <= 20 && !c.name.includes(':'));
    const confirmed = members.filter(m => m.status === 2).length;

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v">${members.length}</div><div class="stat-l">전체 교인</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:var(--확정)">${confirmed}</div><div class="stat-l">정착</div></div>
        <div class="stat" style="flex:1;min-width:70px"><div class="stat-v" style="color:var(--미확인)">${members.length - confirmed}</div><div class="stat-l">새가족</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <form id="_mForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <input name="name" placeholder="이름" required style="width:70px">
          <input name="phone" placeholder="연락처" style="width:100px">
          <select name="cat" style="width:70px"><option>새가족</option><option>정착</option><option>봉사자</option><option>리더</option></select>
          <input name="group" placeholder="소그룹" style="width:60px">
          <input name="note" placeholder="메모" style="width:100px">
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        <input id="_mFilter" placeholder="이름 검색..." style="width:150px;margin-bottom:8px">
        <table style="width:100%;font-size:11px;border-collapse:collapse" id="_mTable">
          <thead><tr style="border-bottom:1px solid var(--border);font-size:9px;color:var(--text-3);font-weight:600">
            <th style="padding:3px 6px;text-align:left">상태</th><th style="padding:3px 6px;text-align:left">이름</th>
            <th style="padding:3px 6px;text-align:left">정보</th><th style="padding:3px 6px">출석</th><th style="padding:3px 6px">신뢰</th>
            <th style="padding:3px 6px;text-align:right">작업</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>`;

    this._renderMembers(members);

    el.querySelector('#_mForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const info = [f.cat.value, f.phone.value, f.group.value, f.note.value].filter(Boolean).join(', ');
      await fetch(`${API}/cells`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: f.name.value, type: 3, content: info, confirmed: f.cat.value !== '새가족', layer: 0 }) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '교인 등록', type: '확정' } }));
      document.dispatchEvent(new CustomEvent('데이터변경'));
      this.렌더();
    });

    el.querySelector('#_mFilter')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      this._renderMembers(q ? members.filter(m => m.name.toLowerCase().includes(q)) : members);
    });
  }

  _renderMembers(members) {
    const tbody = document.querySelector('#_mTable tbody');
    if (!tbody) return;
    tbody.innerHTML = members.map(m => {
      const st = ({'2':'확정','0':'미확인'})[String(m.status)]||'미인지';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:4px 6px"><div class="dot ${st}" style="display:inline-block"></div></td>
        <td style="padding:4px 6px;font-weight:500">${m.name}</td>
        <td style="padding:4px 6px;color:var(--text-3);font-size:10px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.content||''}</td>
        <td style="padding:4px 6px;text-align:center">${m.evidence||0}</td>
        <td style="padding:4px 6px;text-align:center">${m.trust||0}</td>
        <td style="padding:4px 6px;text-align:right"><button class="btn _att" data-id="${m.id}" style="font-size:9px;padding:1px 5px">출석</button><button class="btn _rec" data-id="${m.id}" data-name="${m.name}" style="font-size:9px;padding:1px 5px;margin-left:2px">기록</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--text-3)">교인을 등록하세요</td></tr>';

    tbody.querySelectorAll('._att').forEach(b => b.addEventListener('click', async () => {
      await fetch(`${API}/cells/${b.dataset.id}/evidence`, { method:'POST' });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '출석!', type: '확정' } }));
      this.렌더();
    }));

    tbody.querySelectorAll('._rec').forEach(b => b.addEventListener('click', () => {
      const type = prompt('기록 종류:\n헌금 / 봉사 / 기도 / 교육 / 심방 / 간증');
      if (!type) return;
      const val = prompt(`${type} 내용:`);
      if (!val) return;
      fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: b.dataset.name, predicate: type, object: val, layer: 1 }) })
        .then(() => document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${b.dataset.name} ${type} 기록`, type: '확정' } })));
    }));
  }

  // ─── 소그룹 탭 ───
  async _groupTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const groupClaims = (claims.claims||[]).filter(c => c.claim?.predicate === '소그룹' || c.claim?.predicate === '배정');

    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">소그룹 배정</span></div>
        <div style="display:flex;gap:6px;align-items:end">
          <input id="_grpMember" placeholder="교인 이름" style="width:80px">
          <input id="_grpName" placeholder="소그룹명 (예: 1셀)" style="width:80px">
          <button class="btn btn-p" id="_grpAssign">배정</button>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">소그룹 현황</span></div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${groupClaims.length ? groupClaims.map(c => `<div class="pipe"><span style="font-weight:500">${c.claim?.subject||''}</span><span style="color:var(--text-3)">→ ${c.claim?.object||''}</span></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">소그룹 배정 기록이 없습니다</div>'}
        </div>
      </div>`;

    el.querySelector('#_grpAssign')?.addEventListener('click', async () => {
      const member = document.getElementById('_grpMember')?.value?.trim();
      const group = document.getElementById('_grpName')?.value?.trim();
      if (!member || !group) return;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: member, predicate: '소그룹', object: group, layer: 1 }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${member} → ${group} 배정`, type: '확정' } }));
      this.렌더();
    });
  }

  // ─── 헌금·재정 탭 ───
  async _offeringTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const offerings = (claims.claims||[]).filter(c => c.claim?.predicate === '헌금');
    const total = offerings.reduce((s, c) => {
      const m = (c.claim?.object||'').match(/(\d+)/);
      return s + (m ? parseInt(m[1]) : 0);
    }, 0);

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div class="stat" style="flex:1"><div class="stat-v">${offerings.length}</div><div class="stat-l">헌금 건수</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${total.toLocaleString()}</div><div class="stat-l">합계 (원)</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">헌금 입력</span></div>
        <form id="_offForm" style="display:flex;gap:6px;align-items:end;flex-wrap:wrap">
          <input name="name" placeholder="교인 이름" required style="width:80px">
          <select name="type" style="width:80px"><option>주일헌금</option><option>감사헌금</option><option>선교헌금</option><option>십일조</option><option>건축헌금</option></select>
          <input name="amount" type="number" placeholder="금액" required style="width:80px">
          <input name="note" placeholder="메모" style="width:80px">
          <button type="submit" class="btn btn-p">입력</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">헌금 내역</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">
          ${offerings.length ? offerings.reverse().map(c => `<div class="pipe"><span style="font-weight:500">${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span><span style="font-size:9px;color:var(--text-3);margin-left:auto">${c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko') : ''}</span></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">헌금 기록이 없습니다</div>'}
        </div>
      </div>`;

    el.querySelector('#_offForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const obj = `${f.type.value} ${Number(f.amount.value).toLocaleString()}원${f.note.value ? ' ('+f.note.value+')' : ''}`;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.name.value, predicate: '헌금', object: obj, layer: 1 }) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '헌금 기록 완료', type: '확정' } }));
      this.렌더();
    });
  }

  // ─── 기도 탭 ───
  async _prayerTab(el) {
    const claims = await (await fetch(`${API}/claims`)).json();
    const prayers = (claims.claims||[]).filter(c => c.claim?.predicate === '기도' || c.claim?.predicate === '기도제목');
    const answered = prayers.filter(p => (p.claim?.object||'').includes('응답'));

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div class="stat" style="flex:1"><div class="stat-v">${prayers.length}</div><div class="stat-l">기도제목</div></div>
        <div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${answered.length}</div><div class="stat-l">응답</div></div>
      </div>
      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">기도제목 등록</span></div>
        <form id="_prayForm" style="display:flex;gap:6px;align-items:end;flex-wrap:wrap">
          <input name="who" placeholder="누구를 위해" required style="width:80px">
          <input name="content" placeholder="기도 내용" required style="flex:1;min-width:120px">
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>
      <div class="card">
        <div class="card-h"><span class="card-t">기도제목 목록</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">
          ${prayers.length ? prayers.reverse().map(c => `<div class="pipe"><span style="font-weight:500">${c.claim?.subject||''}</span><span style="flex:1">${c.claim?.object||''}</span><button class="btn _ans" data-s="${c.claim?.subject}" style="font-size:9px;padding:1px 5px">응답!</button></div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">기도제목을 등록하세요</div>'}
        </div>
      </div>`;

    el.querySelector('#_prayForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: f.who.value, predicate: '기도제목', object: f.content.value, layer: 1 }) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '기도제목 등록', type: '확정' } }));
      this.렌더();
    });

    el.querySelectorAll('._ans').forEach(b => b.addEventListener('click', async () => {
      const note = prompt('응답 내용:');
      if (!note) return;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: b.dataset.s, predicate: '기도', object: '응답: ' + note, layer: 3 }) });
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '기도 응답 기록!', type: '확정' } }));
      this.렌더();
    }));
  }

  // ─── 공지 탭 ───
  _noticeTab(el) {
    el.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <div class="card-h"><span class="card-t">공지 작성</span></div>
        <form id="_noticeForm" style="display:flex;flex-direction:column;gap:6px">
          <input name="title" placeholder="제목" required>
          <textarea name="content" placeholder="내용" rows="4" style="resize:vertical"></textarea>
          <button type="submit" class="btn btn-p" style="align-self:flex-start">게시</button>
        </form>
      </div>
      <div id="_notices"></div>`;

    el.querySelector('#_noticeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await fetch(`${API}/claims`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: '공지', predicate: f.title.value, object: f.content.value, layer: 0 }) });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '공지 게시', type: '확정' } }));
      this._loadNotices();
    });

    this._loadNotices();
  }

  async _loadNotices() {
    const claims = await (await fetch(`${API}/claims?subject=%EA%B3%B5%EC%A7%80`)).json();
    const notices = (claims.claims||[]).reverse();
    const el = document.getElementById('_notices');
    if (!el) return;
    el.innerHTML = notices.map(n => `
      <div class="card" style="margin-bottom:6px">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${n.claim?.predicate||''}</div>
        <div style="font-size:11px;color:var(--text-2);white-space:pre-wrap">${n.claim?.object||''}</div>
        <div style="font-size:9px;color:var(--text-3);margin-top:4px">${n.createdAt ? new Date(n.createdAt).toLocaleString('ko') : ''}</div>
      </div>`).join('') || '<div style="color:var(--text-3);font-size:11px;padding:8px">공지가 없습니다</div>';
  }
}

export { 교회앱 };
