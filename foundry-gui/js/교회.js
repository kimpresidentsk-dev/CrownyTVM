// CrownyCore — 교회 관리 (완벽화)
// 교인 | 출석체크 | 소그룹 | 헌금·리포트 | 기도 | 설교 | 공지
const API = '/api/foundry';

class 교회앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'member'; }

  async 초기화() {
    if (!this.el) return;
    const stats = await (await fetch(`${API}/stats`)).json();
    if (stats.totalCells === 0) {
      for (const id of ['ch-member','ch-smallgroup','ch-prayer','ch-offering'])
        await fetch(`${API}/templates/${id}/deploy`, { method: 'POST' });
    }
    this.렌더();
  }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      {id:'member',label:'교인'},{id:'attendance',label:'출석체크'},
      {id:'group',label:'소그룹'},{id:'offering',label:'헌금'},
      {id:'prayer',label:'기도'},{id:'sermon',label:'설교'},{id:'notice',label:'공지'},
    ];
    this.el.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;flex-wrap:wrap">
        ${tabs.map(t=>`<button class="btn ${this.tab===t.id?'btn-p':''} _tab" data-tab="${t.id}" style="font-size:10px;padding:3px 8px">${t.label}</button>`).join('')}
      </div><div id="_cc"></div>`;
    this.el.querySelectorAll('._tab').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.tab;this.렌더();}));
    const ct=document.getElementById('_cc'); if(!ct) return;
    switch(this.tab){
      case 'member': await this._memberTab(ct); break;
      case 'attendance': await this._attendanceTab(ct); break;
      case 'group': await this._groupTab(ct); break;
      case 'offering': await this._offeringTab(ct); break;
      case 'prayer': await this._prayerTab(ct); break;
      case 'sermon': await this._sermonTab(ct); break;
      case 'notice': await this._noticeTab(ct); break;
    }
  }

  async _getMembers() {
    const sys=['교인등록','가족관계','소그룹목록','소그룹원','리더','모임일정','나눔기록','기도제목','요청자','중보기도자','기도체인','감사나눔','주일헌금','감사헌금','선교헌금','건축헌금','예산편성','월간보고','새가족과정','은사파악','봉사배치','출석기록','소그룹배정','성장추적','성장단계','정착확인','총수입','집행내역','잔액현황','감사결과','긴급도','기도횟수','응답기록','활동도','그룹건강','설교목록','설교자','성경본문','설교시리즈','핵심메시지','영상링크','삶적용','적용확인','교회재정','크라우니타워'];
    const cells=await(await fetch(`${API}/cells?limit=500`)).json();
    return(cells.cells||[]).filter(c=>c.type===3&&c.name&&!sys.includes(c.name)&&c.name.length>=2&&c.name.length<=20&&!c.name.includes(':')&&!c.name.includes('가계부')&&!c.name.includes('긴급'));
  }

  // ─── 교인 ───
  async _memberTab(el) {
    const members=await this._getMembers();
    const confirmed=members.filter(m=>m.status===2).length;
    el.innerHTML=`
      <div style="display:flex;gap:6px;margin-bottom:8px"><div class="stat" style="flex:1"><div class="stat-v">${members.length}</div><div class="stat-l">전체</div></div><div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${confirmed}</div><div class="stat-l">정착</div></div></div>
      <div class="card" style="margin-bottom:6px"><form id="_mf" style="display:flex;gap:3px;flex-wrap:wrap;align-items:end"><input name="name" placeholder="이름" required style="width:55px"><input name="phone" placeholder="연락처" style="width:85px"><select name="cat" style="width:55px"><option>새가족</option><option>정착</option><option>봉사자</option><option>리더</option></select><input name="group" placeholder="소그룹" style="width:45px"><button type="submit" class="btn btn-p">등록</button></form></div>
      <div class="card"><input id="_mq" placeholder="검색..." style="width:100px;margin-bottom:4px"><div style="max-height:300px;overflow-y:auto" id="_ml"></div></div>`;
    this._renderML(members);
    el.querySelector('#_mf')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;await fetch(`${API}/cells`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,type:3,content:[f.cat.value,f.phone.value,f.group.value].filter(Boolean).join(', '),confirmed:f.cat.value!=='새가족',layer:0,scope:3})});f.reset();this._notify('교인 등록');this.렌더();});
    el.querySelector('#_mq')?.addEventListener('input',async(e)=>{const q=e.target.value.toLowerCase();const all=await this._getMembers();this._renderML(q?all.filter(m=>m.name.toLowerCase().includes(q)):all);});
  }
  _renderML(ms){const ml=document.getElementById('_ml');if(!ml)return;ml.innerHTML=ms.map(m=>{const st=({'2':'확정','0':'미확인'})[String(m.status)]||'미인지';return`<div class="ws-item" style="padding:3px 6px"><div class="dot ${st}"></div><span class="ws-name" style="font-weight:500">${m.name}</span><span style="color:var(--text-3);font-size:9px">${m.content||''}</span><span style="font-size:9px;color:var(--text-3);margin-left:auto">출석${m.evidence||0}</span><button class="btn _at" data-id="${m.id}" style="font-size:8px;padding:0 4px;margin-left:4px">출석</button></div>`;}).join('')||'<div style="padding:6px;color:var(--text-3);font-size:10px">교인을 등록하세요</div>';ml.querySelectorAll('._at').forEach(b=>b.addEventListener('click',async()=>{await fetch(`${API}/cells/${b.dataset.id}/evidence`,{method:'POST'});this._notify('출석');this.렌더();}));}

  // ─── 출석 체크 시트 ───
  async _attendanceTab(el) {
    const members=await this._getMembers();
    const today=new Date().toLocaleDateString('ko');
    const todayStart=new Date();todayStart.setHours(0,0,0,0);
    const cl=await(await fetch(`${API}/claims?predicate=%EC%B6%9C%EC%84%9D&after=${todayStart.getTime()}`)).json();
    const checked=new Set((cl.claims||[]).map(c=>c.claim?.subject));
    const cnt=checked.size;

    el.innerHTML=`
      <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
        <span style="font-weight:600;font-size:12px">${today} 출석</span>
        <span class="badge ${cnt>0?'확정':'미인지'}">${cnt}/${members.length}명 (${members.length>0?Math.round(cnt/members.length*100):0}%)</span>
        <button class="btn btn-p" id="_ckAll" style="margin-left:auto;font-size:9px">전체 출석</button>
      </div>
      <div class="card">
        <input id="_aq" placeholder="이름 검색 → Enter" style="width:150px;margin-bottom:6px;font-size:12px" autofocus>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:3px" id="_aG">
          ${members.map(m=>{const ck=checked.has(m.name);return`<div class="_ac" data-id="${m.id}" data-name="${m.name}" style="padding:5px 8px;border:1px solid ${ck?'var(--확정)':'var(--border)'};border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:4px;${ck?'background:var(--확정-bg);opacity:.7':''}"><span style="width:12px;height:12px;border:1.5px solid ${ck?'var(--확정)':'var(--border)'};border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--확정)">${ck?'v':''}</span><span style="font-size:11px;font-weight:${ck?'400':'500'}">${m.name}</span></div>`;}).join('')}
        </div>
      </div>`;

    el.querySelectorAll('._ac').forEach(c=>c.addEventListener('click',async()=>{if(checked.has(c.dataset.name))return;await fetch(`${API}/cells/${c.dataset.id}/evidence`,{method:'POST'});await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:c.dataset.name,predicate:'출석',object:today,layer:0,scope:3})});this._notify(`${c.dataset.name} 출석`);this.렌더();}));
    el.querySelector('#_aq')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();const v=[...el.querySelectorAll('._ac')].filter(c=>c.dataset.name.toLowerCase().includes(e.target.value.toLowerCase())&&!checked.has(c.dataset.name));if(v.length>0)v[0].click();e.target.value='';el.querySelectorAll('._ac').forEach(c=>c.style.display='');}});
    el.querySelector('#_aq')?.addEventListener('input',(e)=>{const q=e.target.value.toLowerCase();el.querySelectorAll('._ac').forEach(c=>{c.style.display=c.dataset.name.toLowerCase().includes(q)?'':'none';});});
    el.querySelector('#_ckAll')?.addEventListener('click',async()=>{for(const m of members){if(!checked.has(m.name)){await fetch(`${API}/cells/${m.id}/evidence`,{method:'POST'});await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:m.name,predicate:'출석',object:today,layer:0,scope:3})});}}this._notify(`전체 출석 ${members.length}명`);this.렌더();});
  }

  // ─── 소그룹 ───
  async _groupTab(el) {
    const cl=await(await fetch(`${API}/claims?predicate=%EC%86%8C%EA%B7%B8%EB%A3%B9`)).json();
    const groups={};(cl.claims||[]).forEach(c=>{const g=c.claim?.object||'미배정';(groups[g]=groups[g]||[]).push(c.claim?.subject);});
    el.innerHTML=`
      <div class="card" style="margin-bottom:6px"><div style="display:flex;gap:3px;align-items:end"><input id="_gm" placeholder="교인" style="width:65px"><input id="_gn" placeholder="소그룹" style="width:60px"><button class="btn btn-p" id="_ga">배정</button></div></div>
      <div class="card">${Object.keys(groups).length?Object.entries(groups).map(([g,ms])=>`<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:600;color:var(--text-3);margin-bottom:2px">${g} (${ms.length})</div><div style="display:flex;gap:2px;flex-wrap:wrap">${ms.map(m=>`<span class="badge 확정">${m}</span>`).join('')}</div></div>`).join(''):'<div style="color:var(--text-3);font-size:10px;padding:6px">소그룹 배정이 없습니다</div>'}</div>`;
    el.querySelector('#_ga')?.addEventListener('click',async()=>{const m=document.getElementById('_gm')?.value?.trim(),g=document.getElementById('_gn')?.value?.trim();if(!m||!g)return;await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:m,predicate:'소그룹',object:g,layer:1,scope:3})});this._notify(`${m}→${g}`);this.렌더();});
  }

  // ─── 헌금 + 리포트 + CSV ───
  async _offeringTab(el) {
    const cl=await(await fetch(`${API}/claims?predicate=%ED%97%8C%EA%B8%88`)).json();
    const offs=cl.claims||[];
    const parse=s=>{const m=(s||'').match(/(\d[\d,]*)/);return m?parseInt(m[1].replace(/,/g,'')):0;};
    const total=offs.reduce((s,c)=>s+parse(c.claim?.object),0);
    const byType={},byPerson={};
    offs.forEach(c=>{const t=(c.claim?.object||'').split(' ')[0]||'기타';byType[t]=(byType[t]||0)+parse(c.claim?.object);const p=c.claim?.subject||'?';byPerson[p]=(byPerson[p]||0)+parse(c.claim?.object);});

    el.innerHTML=`
      <div style="display:flex;gap:6px;margin-bottom:8px"><div class="stat" style="flex:1"><div class="stat-v">${offs.length}</div><div class="stat-l">건수</div></div><div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${total.toLocaleString()}</div><div class="stat-l">합계(원)</div></div></div>
      <div class="card" style="margin-bottom:6px"><form id="_of" style="display:flex;gap:3px;flex-wrap:wrap;align-items:end"><input name="name" placeholder="교인" required style="width:55px"><select name="type" style="width:65px"><option>주일헌금</option><option>감사헌금</option><option>선교헌금</option><option>십일조</option><option>건축헌금</option></select><input name="amount" type="number" placeholder="금액" required style="width:65px"><button type="submit" class="btn btn-p">입력</button></form></div>
      <div style="display:flex;gap:3px;margin-bottom:8px"><button class="btn" id="_oRpt">리포트</button><button class="btn" id="_oCsv">CSV</button></div>
      <div id="_rpt" style="display:none"></div>
      <div class="card"><div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:1px">${offs.length?offs.slice().reverse().map(c=>`<div class="pipe" style="padding:2px 6px"><span style="font-weight:500;min-width:35px">${c.claim?.subject||''}</span><span style="color:var(--text-3)">${c.claim?.object||''}</span><span style="font-size:7px;color:var(--text-3);margin-left:auto">${c.createdAt?new Date(c.createdAt).toLocaleDateString('ko'):''}</span></div>`).join(''):'<div style="color:var(--text-3);font-size:10px;padding:6px">헌금 기록 없음</div>'}</div></div>`;

    el.querySelector('#_of')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;const obj=`${f.type.value} ${Number(f.amount.value).toLocaleString()}원`;await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:f.name.value,predicate:'헌금',object:obj,layer:1,scope:3})});f.reset();this._notify('헌금 기록');this.렌더();});

    el.querySelector('#_oRpt')?.addEventListener('click',()=>{const r=document.getElementById('_rpt');r.style.display=r.style.display==='none'?'block':'none';r.innerHTML=`<div class="card" style="margin-bottom:6px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px"><div><div style="font-size:8px;font-weight:600;color:var(--text-3);margin-bottom:3px">종류별</div>${Object.entries(byType).map(([t,a])=>`<div style="display:flex;justify-content:space-between;padding:1px 0"><span>${t}</span><span style="font-weight:600">${a.toLocaleString()}원</span></div>`).join('')}<div style="border-top:1px solid var(--border);padding-top:2px;display:flex;justify-content:space-between;font-weight:700"><span>합계</span><span style="color:var(--확정)">${total.toLocaleString()}원</span></div></div><div><div style="font-size:8px;font-weight:600;color:var(--text-3);margin-bottom:3px">교인별</div>${Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([p,a])=>`<div style="display:flex;justify-content:space-between;padding:1px 0"><span>${p}</span><span>${a.toLocaleString()}원</span></div>`).join('')}</div></div></div>`;});

    el.querySelector('#_oCsv')?.addEventListener('click',()=>{const rows=['날짜,교인,종류,금액'];offs.forEach(c=>{const d=c.createdAt?new Date(c.createdAt).toLocaleDateString('ko'):'';const n=c.claim?.subject||'';const ps=(c.claim?.object||'').split(' ');rows.push(`${d},${n},${ps[0]||''},${ps[1]||''}`);});const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`헌금_${new Date().toISOString().slice(0,10)}.csv`;a.click();this._notify('CSV 다운로드');});
  }

  // ─── 기도 ───
  async _prayerTab(el) {
    const cl=await(await fetch(`${API}/claims`)).json();
    const prayers=(cl.claims||[]).filter(c=>c.claim?.predicate==='기도제목'||c.claim?.predicate==='기도');
    const answered=prayers.filter(c=>(c.claim?.object||'').includes('응답'));
    el.innerHTML=`
      <div style="display:flex;gap:6px;margin-bottom:8px"><div class="stat" style="flex:1"><div class="stat-v">${prayers.length}</div><div class="stat-l">제목</div></div><div class="stat" style="flex:1"><div class="stat-v" style="color:var(--확정)">${answered.length}</div><div class="stat-l">응답</div></div></div>
      <div class="card" style="margin-bottom:6px"><form id="_pf" style="display:flex;gap:3px;align-items:end"><input name="who" placeholder="누구를 위해" required style="width:65px"><input name="content" placeholder="기도 내용" required style="flex:1;min-width:80px"><button type="submit" class="btn btn-p">등록</button></form></div>
      <div class="card"><div style="display:flex;flex-direction:column;gap:2px;max-height:250px;overflow-y:auto">${prayers.length?prayers.slice().reverse().map(c=>`<div class="pipe" style="padding:2px 6px"><span style="font-weight:500">${c.claim?.subject||''}</span><span style="flex:1;color:var(--text-2);font-size:10px">${c.claim?.object||''}</span><button class="btn _ans" data-s="${c.claim?.subject}" style="font-size:7px;padding:0 3px">응답</button></div>`).join(''):'<div style="color:var(--text-3);font-size:10px;padding:6px">기도제목을 등록하세요</div>'}</div></div>`;
    el.querySelector('#_pf')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:f.who.value,predicate:'기도제목',object:f.content.value,layer:1,scope:3})});f.reset();this._notify('기도제목 등록');this.렌더();});
    el.querySelectorAll('._ans').forEach(b=>b.addEventListener('click',async()=>{const n=prompt('응답 내용:');if(!n)return;await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:b.dataset.s,predicate:'기도',object:'응답: '+n,layer:3,scope:3})});this._notify('기도 응답!');this.렌더();}));
  }

  // ─── 설교 (신규) ───
  async _sermonTab(el) {
    const cl=await(await fetch(`${API}/claims?predicate=%EC%84%A4%EA%B5%90`)).json();
    const sermons=(cl.claims||[]).reverse();
    el.innerHTML=`
      <div class="card" style="margin-bottom:6px">
        <form id="_sf" style="display:flex;flex-direction:column;gap:3px;max-width:380px">
          <div style="display:flex;gap:3px"><input name="date" type="date" required style="width:100px" value="${new Date().toISOString().slice(0,10)}"><input name="title" placeholder="설교 제목" required style="flex:1"></div>
          <div style="display:flex;gap:3px"><input name="speaker" placeholder="설교자" style="width:70px"><input name="bible" placeholder="성경 본문" style="flex:1"></div>
          <textarea name="summary" placeholder="핵심 메시지" rows="2" style="resize:vertical"></textarea>
          <button type="submit" class="btn btn-p" style="align-self:flex-start">등록 + 공지 전파</button>
        </form>
      </div>
      <div class="card"><div style="display:flex;flex-direction:column;gap:3px;max-height:300px;overflow-y:auto">${sermons.length?sermons.map(s=>{const p=(s.claim?.object||'').split('|').map(x=>x.trim());return`<div class="card" style="padding:6px;border-left:2px solid var(--확정)"><div style="font-weight:600;font-size:11px">${p[0]||''}</div>${p[1]?`<div style="font-size:9px;color:var(--text-2)">${p[1]}</div>`:''}${p[2]?`<div style="font-size:9px;color:var(--text-3)">${p[2]}</div>`:''}</div>`;}).join(''):'<div style="color:var(--text-3);font-size:10px;padding:6px">설교를 등록하세요</div>'}</div></div>`;

    el.querySelector('#_sf')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
      const obj=[`[${f.date.value}] ${f.title.value}`,f.bible.value?`본문: ${f.bible.value}`:'',f.summary.value||'',f.speaker.value?`설교자: ${f.speaker.value}`:''].filter(Boolean).join(' | ');
      await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:f.date.value,predicate:'설교',object:obj,layer:1,scope:3})});
      // 공지 자동 전파
      await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'공지',predicate:`설교: ${f.title.value}`,object:`${f.bible.value||''} — ${f.summary.value||''}`,layer:0,scope:3})});
      f.reset();this._notify('설교 등록+공지');this.렌더();});
  }

  // ─── 공지 ───
  async _noticeTab(el) {
    el.innerHTML=`<div class="card" style="margin-bottom:6px"><form id="_nf" style="display:flex;flex-direction:column;gap:3px"><input name="title" placeholder="제목" required><textarea name="content" placeholder="내용" rows="2" style="resize:vertical"></textarea><button type="submit" class="btn btn-p" style="align-self:flex-start">게시</button></form></div><div id="_nl"></div>`;
    el.querySelector('#_nf')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'공지',predicate:f.title.value,object:f.content.value,layer:0,scope:3})});f.reset();this._notify('공지 게시');this._loadN();});
    this._loadN();
  }
  async _loadN(){const r=await fetch(`${API}/claims?subject=%EA%B3%B5%EC%A7%80`);const d=await r.json();const el=document.getElementById('_nl');if(!el)return;el.innerHTML=(d.claims||[]).reverse().map(n=>`<div class="card" style="margin-bottom:3px;padding:6px"><div style="font-weight:600;font-size:10px">${n.claim?.predicate||''}</div><div style="font-size:9px;color:var(--text-2);white-space:pre-wrap;margin-top:1px">${n.claim?.object||''}</div><div style="font-size:7px;color:var(--text-3);margin-top:1px">${n.createdAt?new Date(n.createdAt).toLocaleString('ko'):''}</div></div>`).join('')||'<div style="color:var(--text-3);font-size:10px;padding:6px">공지 없음</div>';}

  _notify(msg){document.dispatchEvent(new CustomEvent('알림',{detail:{msg,type:'확정'}}));document.dispatchEvent(new CustomEvent('데이터변경'));}
}

export { 교회앱 };
