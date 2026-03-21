// CrownyCore — F-Pattern 3-Column App
import { 사상, 슬롯메타 } from './4상상태.js';
import { 셀그래프, 슬롯패널 } from './셀그래프.js';
import { 파이프라인모니터 } from './파이프라인모니터.js';
import { KPS차트 } from './KPS차트.js';
import { 템플릿브라우저 } from './템플릿.js';
import { 인과추론패널 } from './인과추론.js';
import { 언약패널 } from './언약.js';
import { 교회앱 } from './교회.js';
import { 라이프앱 } from './라이프.js';
import { 도시앱 } from './도시.js';
import { 통합대시보드 } from './통합.js';
import { 가정앱 } from './가정.js';
import { 스타트업앱 } from './스타트업.js';

const API = '/api/foundry';
let graph, slots, chart, tmpl, causal, cov, church, lifeApp, cityApp, dash, familyApp, startupApp;

// ── View switching ──
function go(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`v_${name}`);
  const btn = document.querySelector(`[data-v="${name}"]`);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');

  const titles = { home:'CrownyCore', dashboard:'대시보드', graph:'작업 공간', decide:'의사결정', tmpl:'프로젝트', causal:'인과추론', kps:'차트', life:'개인', family:'가정', startup:'스타트업', church:'비영리', city:'관제', create:'만들기', search:'찾기', stats:'통계' };
  document.getElementById('viewTitle').textContent = titles[name] || name;

  // Lazy load
  if (name === 'decide') cov?.로드();
  if (name === 'tmpl') tmpl?.로드();
  if (name === 'causal') causal?.로드();
  if (name === 'church') church?.초기화();
  if (name === 'life') lifeApp?.초기화();
  if (name === 'city') cityApp?.초기화();
  if (name === 'dashboard') dash?.초기화();
  if (name === 'family') familyApp?.초기화();
  if (name === 'startup') startupApp?.초기화();
  if (name === 'stats') loadStats();
}

// ── Toast ──
function toast(msg, cls = '확정') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${cls} show`;
  setTimeout(() => el.className = 'toast', 2500);
}

// ── Health + Badge ──
async function health() {
  try {
    const r = await fetch(`${API}/stats`);
    const d = await r.json();
    const b = document.getElementById('badge');
    b.className = 'badge 확정';
    b.textContent = `${d.totalCells} cells · ${d.totalClaims} claims`;
    return d;
  } catch {
    document.getElementById('badge').className = 'badge 미인지';
    document.getElementById('badge').textContent = 'offline';
    return null;
  }
}

// ── Stats view ──
async function loadStats() {
  const [cellStats, covStats] = await Promise.all([
    fetch(`${API}/stats`).then(r=>r.json()).catch(()=>({})),
    fetch(`${API}/covenant/stats`).then(r=>r.json()).catch(()=>({})),
  ]);
  const el = document.getElementById('v_stats');
  const bs = cellStats.byStatus || {};
  el.innerHTML = `
    <div class="card"><div class="card-h"><span class="card-t">셀 데이터베이스</span></div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-v">${cellStats.totalCells||0}</div><div class="stat-l">전체 셀</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${cellStats.totalClaims||0}</div><div class="stat-l">주장</div></div>
        <div class="stat"><div class="stat-v">${cellStats.totalLinks||0}</div><div class="stat-l">연결</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${bs['2']||0}</div><div class="stat-l">▲ 확정</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${bs['0']||0}</div><div class="stat-l">● 미확인</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${bs['-2']||0}</div><div class="stat-l">▼ 오해</div></div>
      </div>
    </div>
    <div class="card"><div class="card-h"><span class="card-t">의사결정 엔진</span></div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-v">${covStats.totalDecisions||0}</div><div class="stat-l">전체 결정</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${covStats.ti||0}</div><div class="stat-l">▲ 즉시실행</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${covStats.om||0}</div><div class="stat-l">● 학습후</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${covStats.ta||0}</div><div class="stat-l">▼ 이관</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미인지)">${covStats.eum||0}</div><div class="stat-l">◆ 설계자</div></div>
        <div class="stat"><div class="stat-v">${covStats.principles||0}</div><div class="stat-l">원칙</div></div>
        <div class="stat"><div class="stat-v">${covStats.growthLevel||3}</div><div class="stat-l">성장단위</div></div>
      </div>
    </div>`;
}

// ── Sample data ──
async function loadSample() {
  toast('예제 데이터를 만드는 중...', '미확인');
  const post = (u,d) => fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
  await post(`${API}/cells`,{name:'BTC',type:1,content:67000,confirmed:true,layer:1});
  await post(`${API}/cells`,{name:'ETH',type:1,content:3400,confirmed:true,layer:1});
  await post(`${API}/cells`,{name:'SOL',type:1,content:180,layer:1});
  await post(`${API}/cells`,{name:'XRP',type:1,content:2.4,layer:1});
  await post(`${API}/cells`,{name:'KPS',type:8,content:'EMA',confirmed:true,layer:2});
  await post(`${API}/cells`,{name:'TrustEngine',type:8,content:'propagation',layer:3});
  await post(`${API}/claims`,{subject:'BTC',predicate:'trend',object:'bullish',layer:1});
  await post(`${API}/claims`,{subject:'ETH',predicate:'sector',object:'DeFi',layer:1});
  await post(`${API}/claims`,{subject:'SOL',predicate:'analyzer',object:'KPS',layer:2});
  await post(`${API}/claims`,{subject:'XRP',predicate:'regulation',object:'pending',layer:1});
  await post(`${API}/synapse`,{cellA:1,cellB:2});
  await post(`${API}/synapse`,{cellA:2,cellB:3});
  await post(`${API}/synapse`,{cellA:3,cellB:4});
  await post(`${API}/connect`,{source:5,target:1,direction:'ti'});
  await post(`${API}/connect`,{source:5,target:3,direction:'ti'});
  await post(`${API}/connect`,{source:6,target:2,direction:'om'});
  await post(`${API}/cells/3/evidence`);
  await post(`${API}/cells/3/evidence`);
  await post(`${API}/cells/3/evidence`);
  await refresh();
  go('graph');
  toast('셀 10개 + 주장 4개 + 연결 6개 완성!', '확정');
}

async function refresh() {
  await health();
  await graph?.로드();
  await updateWorkspace();
  await updateNotifBadge();
}

async function updateNotifBadge() {
  try {
    const r = await fetch(`${API}/notifications?unread=true`);
    const d = await r.json();
    const el = document.getElementById('notifBadge');
    if (!el) return;
    if (d.unread > 0) { el.style.display = 'inline'; el.textContent = d.unread; el.className = 'badge 오류'; }
    else { el.style.display = 'none'; }
  } catch {}
}

// ── Workspace: 셀 리스트 + 컨텍스트 + 가이드 ──
async function updateWorkspace() {
  try {
    const res = await fetch(`${API}/cells?limit=200`);
    const data = await res.json();
    const cells = data.cells || [];

    // 상단 통계
    const statsEl = document.getElementById('wsStats');
    if (statsEl) {
      const ti = cells.filter(c => c.status === 2).length;
      const om = cells.filter(c => c.status === 0).length;
      statsEl.innerHTML = `
        <span>전체 ${cells.length}</span>
        <span style="color:var(--확정)">▲${ti}</span>
        <span style="color:var(--미확인)">●${om}</span>
      `;
    }

    // 프로젝트 이름
    const nameEl = document.getElementById('wsProjectName');
    if (nameEl && cells.length > 0) {
      nameEl.textContent = `작업 공간 · ${cells.length}개 셀`;
    }

    // 셀 리스트
    const listEl = document.getElementById('wsCellList');
    if (!listEl) return;
    const filter = (document.getElementById('wsFilter')?.value || '').toLowerCase();
    const filtered = filter ? cells.filter(c => (c.name||'').toLowerCase().includes(filter) || (c.claim?.subject||'').toLowerCase().includes(filter)) : cells;

    listEl.innerHTML = filtered.length ? filtered.map(c => {
      const stName = ({'2':'확정','0':'미확인','-2':'오류','-1':'미인지'})[String(c.status)] || '미인지';
      return `<div class="ws-item" data-id="${c.id}">
        <div class="ws-dot ${stName}"></div>
        <span class="ws-name">${c.name || (c.claim ? c.claim.subject+' '+c.claim.predicate : '#'+c.id)}</span>
        <span class="ws-meta">${c.claim ? '주장' : c.evidence > 0 ? '근거'+c.evidence : ''}</span>
      </div>`;
    }).join('') : '<div style="padding:10px;color:var(--text-3);font-size:10px;text-align:center">셀이 없습니다<br>홈에서 프로젝트를 선택하세요</div>';

    // 셀 리스트 클릭 이벤트
    listEl.querySelectorAll('.ws-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = +el.dataset.id;
        listEl.querySelectorAll('.ws-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        try {
          const r = await fetch(`${API}/cells/${id}`);
          if (r.ok) {
            const cell = await r.json();
            showDetail(cell);
            document.getElementById('wsGuide').textContent = `#${cell.id} ${cell.name||''} 선택됨`;
          }
        } catch {}
      });
    });
  } catch {}
}

// ── Workspace 액션 바 이벤트 ──
function initWorkspaceActions() {
  // 셀 추가 퀵폼
  document.getElementById('wsAddCell')?.addEventListener('click', () => go('create'));

  // 주장 추가 퀵 프롬프트
  document.getElementById('wsAddClaim')?.addEventListener('click', () => {
    const input = prompt('주장 입력 (누가 무엇을 어떻게)\n예: BTC 추세 상승');
    if (!input) return;
    const parts = input.trim().split(/\s+/);
    if (parts.length < 3) { toast('3단어 이상 입력 (누가 무엇을 어떻게)', '미확인'); return; }
    fetch(`${API}/claims`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ subject: parts[0], predicate: parts[1], object: parts.slice(2).join(' '), layer: 1 })
    }).then(() => { refresh(); toast('주장 추가: ' + input, '확정'); });
  });

  // 의사결정
  document.getElementById('wsRunDecide')?.addEventListener('click', () => go('decide'));

  // 인과 분석
  document.getElementById('wsDetectCausal')?.addEventListener('click', async () => {
    const res = await fetch(`${API}/causal/detect`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ windowMs: 999999999 }) });
    const data = await res.json();
    toast(`${data.detected}개 관계 발견`, data.detected > 0 ? '확정' : '미확인');
    go('causal');
  });

  // 내보내기
  document.getElementById('wsExport')?.addEventListener('click', async () => {
    const res = await fetch(`${API}/cells?limit=1000`);
    const data = await res.json();
    const csv = ['ID,이름,상태,유형,내용,신뢰도,근거,계층'].concat(
      (data.cells||[]).map(c => `${c.id},${c.name||''},${c.statusName||''},${c.type},${JSON.stringify(c.content).replace(/,/g,';')},${c.trust},${c.evidence},${c.layer}`)
    ).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crownycore-export.csv';
    a.click();
    toast('CSV 내보내기 완료', '확정');
  });

  // 셀 필터
  document.getElementById('wsFilter')?.addEventListener('input', () => updateWorkspace());
}

// ── Detail panel: 27-radial slots + covenant layers ──
async function showDetail(cell) {
  const dp = document.getElementById('detailContent');
  if (!dp || !cell) return;

  let c = cell;
  try { const r = await fetch(`${API}/cells/${cell.id}`); if(r.ok) c = await r.json(); } catch{}
  const st = 사상.EP변환(c.status);
  document.getElementById('sel').textContent = `#${c.id} ${c.name||''}`;

  // 4상 캐릭터
  const charMap = {'2':['▲','확정','ti','알고 있어요!'],'0':['●','미확인','om','공부하고 올게요!'],'-2':['▼','오해','ta','다른 친구에게 물어볼게요'],'-1':['◆','미인지','eum','대장님 도움이 필요해요!']};
  const ch = charMap[String(c.status)] || charMap['-1'];

  dp.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-weight:700;font-size:14px">#${c.id} ${c.name||''}</span>
      <span class="phase-char ${ch[2]}">${ch[0]} ${ch[1]}</span>
    </div>
    <div style="font-size:10px;color:var(--text-3);margin-bottom:12px">${ch[3]}</div>

    <div class="detail-title">27방사형 궤도</div>
    <div class="orbit-wrap" id="_orbitWrap">
      <div class="orbit-ring r-spirit"></div>
      <div class="orbit-ring r-gospel"></div>
      <div class="orbit-ring r-torah"></div>
      <div class="orbit-center">
        <div class="orbit-center-name">${(c.name||c.id).toString().slice(0,5)}</div>
        <div class="orbit-center-badge badge ${사상.이름(st)}" style="font-size:8px">${ch[1]}</div>
      </div>
    </div>

    <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap">
      <span class="ring-label ring-base" style="font-size:8px;padding:2px 4px">기반 0-8</span>
      <span class="ring-label ring-relation" style="font-size:8px;padding:2px 4px">관계 9-17</span>
      <span class="ring-label ring-growth" style="font-size:8px;padding:2px 4px">성장 18-26</span>
    </div>

    <div class="detail-title">속성</div>
    <table style="font-size:10px;width:100%">
      ${[['유형',({0:'—',1:'숫자',2:'실수',3:'글자',7:'주장',8:'기능'})[c.type]||c.type],['내용',c.content],['신뢰',`${c.trust}/13`],['근거',c.evidence],['계층',(['코어','도메인','결정','인식','메타'])[c.layer]||c.layer],['버전',c.version]].map(([k,v])=>`<tr><td style="color:var(--text-3);padding:1px 6px 1px 0">${k}</td><td>${v??'—'}</td></tr>`).join('')}
      ${c.claim?`<tr><td style="color:var(--text-3);padding:1px 6px 1px 0">주장</td><td>${c.claim.subject} ${c.claim.predicate} ${c.claim.object}</td></tr>`:''}
    </table>

    <div style="display:flex;gap:4px;margin-top:10px;flex-wrap:wrap">
      <button class="btn" data-act="evidence" data-id="${c.id}" title="근거를 하나 추가해요. 3개 모이면 자동 확정!">근거+1</button>
      <button class="btn" data-act="advance" data-id="${c.id}" title="상태를 한 단계 올려요">전진 ▲</button>
      <button class="btn" data-act="retreat" data-id="${c.id}" title="상태를 한 단계 내려요">후퇴 ▼</button>
      <button class="btn" style="color:var(--오류)" data-act="delete" data-id="${c.id}" title="이 셀을 삭제해요">삭제</button>
    </div>
  `;

  // Fill slot grids
  // 궤도 위에 구슬 배치
  const orbitWrap = document.getElementById('_orbitWrap');
  if (orbitWrap) {
    const slotDefs = [
    // 기반/보호 (0-8)
    { key:'status',    label:'상태', fmt: v => ({'2':'▲확정','0':'●미확인','-2':'▼오해','-1':'◆미인지'})[String(v)]||v },
    { key:'forward',   label:'앞',   fmt: v => v > 0 ? '#'+v : '—' },
    { key:'backward',  label:'뒤',   fmt: v => v > 0 ? '#'+v : '—' },
    { key:'content',   label:'내용' },
    { key:'type',      label:'유형', fmt: v => ({0:'—',1:'숫자',2:'실수',3:'글자',7:'주장',8:'기능'})[v]||v },
    { key:'name',      label:'이름' },
    { key:'source',    label:'출처' },
    { key:'tag',       label:'태그' },
    { key:'createdAt', label:'생성', fmt: v => v>1e10 ? new Date(v).toLocaleTimeString('ko',{hour:'2-digit',minute:'2-digit'}) : v },
    // 관계/협력 (9-17)
    { key:'depth',     label:'계층', fmt: v => ['코어','도메인','결정','인식','메타'][v]||v },
    { key:'target',    label:'대상', fmt: v => v > 0 ? '#'+v : '—' },
    { key:'strength',  label:'강도' },
    { key:'owner',     label:'소유' },
    { key:'ttl',       label:'수명' },
    { key:'trustNorm', label:'정규신뢰' },
    { key:'evidence',  label:'근거' },
    { key:'trust',     label:'신뢰' },
    { key:'modifiedAt',label:'변경', fmt: v => v>1e10 ? new Date(v).toLocaleTimeString('ko',{hour:'2-digit',minute:'2-digit'}) : v },
    // 성장/혁신 (18-26)
    { key:'version',   label:'버전' },
    { key:'layer',     label:'레이어' },
    { key:'claim_s',   label:'주체', fmt: () => c.claim?.subject || '—' },
    { key:'claim_p',   label:'술어', fmt: () => c.claim?.predicate || '—' },
    { key:'claim_o',   label:'대상', fmt: () => c.claim?.object || '—' },
    { key:'_eum',      label:'미인지#', fmt: () => 0 },
    { key:'_transfer', label:'이관', fmt: () => '—' },
    { key:'_designer', label:'설계자', fmt: () => '—' },
    { key:'_direction',label:'방향', fmt: () => '—' },
  ];

    // 궤도별 반지름: torah=55, gospel=90, spirit=120
    const radii = [55,55,55,55,55,55,55,55,55, 90,90,90,90,90,90,90,90,90, 120,120,120,120,120,120,120,120,120];
    const cx = 130, cy = 130;

    slotDefs.forEach((def, i) => {
      const raw = c[def.key];
      const val = def.fmt ? def.fmt(raw) : (raw ?? 0);
      const filled = val !== 0 && val !== '—' && val !== -1 && val !== null && val !== undefined;
      const ring = i < 9 ? 0 : i < 18 ? 1 : 2;
      const posInRing = i - ring * 9;
      const angle = (posInRing / 9) * Math.PI * 2 - Math.PI / 2;
      const r = radii[i];
      const x = cx + Math.cos(angle) * r - 14;
      const y = cy + Math.sin(angle) * r - 14;

      const orb = document.createElement('div');
      orb.className = `orb ${filled ? 'filled' : ''}`;
      orb.style.left = x + 'px';
      orb.style.top = y + 'px';
      orb.title = `[${i}] ${def.label}: ${val}`;
      orb.innerHTML = `<span class="orb-label">${def.label}</span><span class="orb-val">${val}</span>`;
      orbitWrap.appendChild(orb);
    });
  }

  // Action buttons
  dp.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const {act,id}=btn.dataset;
      if(act==='delete') await fetch(`${API}/cells/${id}`,{method:'DELETE'});
      else await fetch(`${API}/cells/${id}/${act}`,{method:'POST'});
      try{const r=await fetch(`${API}/cells/${id}`);if(r.ok)showDetail(await r.json());else dp.innerHTML='<p style="color:var(--text-3)">삭제됨</p>';} catch{}
      refresh();
    });
  });
}

// ── Cell form ──
async function createCell(e) {
  e.preventDefault();
  const f=e.target;
  const b={name:f.name.value.trim(),type:+f.type.value||0,content:isNaN(f.content.value)?f.content.value:+f.content.value,confirmed:f.confirmed?.checked,layer:+f.layer?.value||0};
  if(!b.name)return;
  await fetch(`${API}/cells`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  f.reset();
  await refresh();go('graph');toast('셀 생성: '+b.name,'확정');
}

async function createClaim(e) {
  e.preventDefault();
  const f=e.target;
  const b={subject:f.subject.value.trim(),predicate:f.predicate.value.trim(),object:f.object.value.trim(),layer:+f.layer?.value||0};
  if(!b.subject)return;
  await fetch(`${API}/claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  f.reset();await refresh();toast('주장 추가 완료','확정');
}

// ── Search ──
async function search(e) {
  e?.preventDefault();
  const q=document.getElementById('searchQ')?.value?.trim();
  if(!q)return;
  const r=await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
  const d=await r.json();
  document.getElementById('searchR').innerHTML = d.results?.length
    ? d.results.map(c=>`<div class="pipe" style="cursor:pointer" data-cid="${c.id}"><span class="badge ${사상.이름(사상.EP변환(c.status))}">${c.statusName}</span><span style="flex:1;font-weight:500">#${c.id} ${c.name||''}</span></div>`).join('')
    : '<p style="color:var(--text-3)">결과 없음</p>';
  document.getElementById('searchR').querySelectorAll('[data-cid]').forEach(el=>{
    el.addEventListener('click',()=>{
      const id=+el.dataset.cid;
      fetch(`${API}/cells/${id}`).then(r=>r.json()).then(c=>{ showDetail(c); go('graph'); });
    });
  });
}

// ── Init ──
function init() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.v)));

  // Graph
  graph = new 셀그래프('graphC');
  chart = new KPS차트('chartC');
  tmpl = new 템플릿브라우저('v_tmpl');
  causal = new 인과추론패널('v_causal');
  cov = new 언약패널('v_decide');
  church = new 교회앱('churchApp');
  lifeApp = new 라이프앱('lifeApp');
  cityApp = new 도시앱('cityApp');
  dash = new 통합대시보드('dashboardApp');
  familyApp = new 가정앱('familyApp');
  startupApp = new 스타트업앱('startupApp');

  // Events
  document.addEventListener('셀선택', e => showDetail(e.detail));
  document.addEventListener('데이터변경', () => refresh());
  document.addEventListener('알림', e => toast(e.detail.msg, e.detail.type));
  document.addEventListener('화면이동', e => go(e.detail));

  document.getElementById('cellForm')?.addEventListener('submit', createCell);
  document.getElementById('claimForm')?.addEventListener('submit', createClaim);
  document.getElementById('searchForm')?.addEventListener('submit', search);
  document.getElementById('sampleBtn')?.addEventListener('click', loadSample);
  document.getElementById('refreshBtn')?.addEventListener('click', refresh);
  initWorkspaceActions();
  document.getElementById('notifBadge')?.addEventListener('click', () => go('dashboard'));

  // Welcome shortcuts
  document.getElementById('w_sample')?.addEventListener('click', loadSample);
  document.getElementById('w_nation')?.addEventListener('click', ()=>go('tmpl'));
  document.getElementById('w_decide')?.addEventListener('click', ()=>go('decide'));
  // 3 카테고리 — 해당 도메인으로 템플릿 필터
  document.getElementById('w_biz')?.addEventListener('click', ()=>{ go('tmpl'); tmpl.selectedDomain='business'; tmpl.렌더(); });
  document.getElementById('w_ent')?.addEventListener('click', ()=>{ go('tmpl'); tmpl.selectedDomain='entertainment'; tmpl.렌더(); });
  document.getElementById('w_church')?.addEventListener('click', ()=>go('church'));

  // KPS sample
  const kpsSample = Array.from({length:80},(_,i)=>{
    const b=100+i*.4, n=(Math.random()-.5)*8, t=Math.sin(i*.15)*12, c=b+t+n;
    return {open:c-n*.3,high:c+Math.abs(n),low:c-Math.abs(n),close:c};
  });
  chart.데이터설정(kpsSample);

  // Load
  health().then(d => {
    if (d && d.totalCells > 0) go('dashboard');
  });
  graph.로드();

  go('home');
}

// module script는 defer이므로 DOM이 이미 ready일 수 있음
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
