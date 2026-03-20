// CrownyCore — F-Pattern 3-Column App
import { 사상, 슬롯메타 } from './4상상태.js';
import { 셀그래프, 슬롯패널 } from './셀그래프.js';
import { 파이프라인모니터 } from './파이프라인모니터.js';
import { KPS차트 } from './KPS차트.js';
import { 템플릿브라우저 } from './템플릿.js';
import { 인과추론패널 } from './인과추론.js';
import { 언약패널 } from './언약.js';

const API = '/api/foundry';
let graph, slots, chart, tmpl, causal, cov;

// ── View switching ──
function go(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`v_${name}`);
  const btn = document.querySelector(`[data-v="${name}"]`);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');

  const titles = { graph:'셀 그래프', decide:'의사결정', tmpl:'프로젝트 템플릿', causal:'인과추론', kps:'차트 분석', create:'만들기', search:'찾기', stats:'통계' };
  document.getElementById('viewTitle').textContent = titles[name] || name;

  // Lazy load
  if (name === 'decide') cov?.로드();
  if (name === 'tmpl') tmpl?.로드();
  if (name === 'causal') causal?.로드();
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
  document.getElementById('welcome')?.classList.add('hidden');
  await refresh();
  toast('셀 10개 + 주장 4개 + 연결 6개 완성!', '확정');
}

async function refresh() {
  await graph?.로드();
  await health();
}

// ── Detail panel: 27-radial slots + covenant layers ──
async function showDetail(cell) {
  const dp = document.getElementById('detailContent');
  if (!dp || !cell) return;

  let c = cell;
  try { const r = await fetch(`${API}/cells/${cell.id}`); if(r.ok) c = await r.json(); } catch{}
  const st = 사상.EP변환(c.status);
  document.getElementById('sel').textContent = `#${c.id} ${c.name||''}`;

  dp.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-weight:600;font-size:13px">#${c.id} ${c.name||''}</span>
      <span class="badge ${사상.이름(st)}">${c.statusName||사상.이름(st)}</span>
    </div>

    <div class="detail-title">27방사형 슬롯</div>
    <div class="ring-label ring-torah">토라 / 경계 (0-8)</div>
    <div class="slot-grid" style="margin-bottom:6px" id="_slotT"></div>
    <div class="ring-label ring-gospel">복음 / 관계 (9-17)</div>
    <div class="slot-grid" style="margin-bottom:6px" id="_slotG"></div>
    <div class="ring-label ring-spirit">성령 / 초월 (18-26)</div>
    <div class="slot-grid" style="margin-bottom:10px" id="_slotS"></div>

    <div class="detail-title">속성</div>
    <table style="font-size:10px;width:100%">
      ${[['유형',c.type],['내용',c.content],['신뢰도',`${c.trust}/13`],['근거',c.evidence],['계층',c.layer],['버전',c.version]].map(([k,v])=>`<tr><td style="color:var(--text-3);padding:1px 6px 1px 0">${k}</td><td>${v??'—'}</td></tr>`).join('')}
      ${c.claim?`<tr><td style="color:var(--text-3);padding:1px 6px 1px 0">주장</td><td>${c.claim.subject} ${c.claim.predicate} ${c.claim.object}</td></tr>`:''}
    </table>

    <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
      <button class="btn" data-act="evidence" data-id="${c.id}" title="근거를 하나 추가해요. 3개 모이면 자동 확정!">근거+1</button>
      <button class="btn" data-act="advance" data-id="${c.id}" title="상태를 한 단계 올려요">전진 ▲</button>
      <button class="btn" data-act="retreat" data-id="${c.id}" title="상태를 한 단계 내려요">후퇴 ▼</button>
      <button class="btn" style="color:var(--오류)" data-act="delete" data-id="${c.id}" title="이 셀을 삭제해요">삭제</button>
    </div>
  `;

  // Fill slot grids
  const fields = ['status','forward','backward','content','type','name','source','boundary','createdAt',
    'selfImpact','familyImpact','neighborImpact','worldImpact','loveWeight','ethicsScore','evidence','trust','modifiedAt',
    'sophistication','mergeHistory','segmentation','consensus','transcendTrust','unknownCount','transferLog','designerIssue','direction'];
  const slotNames = ['상태','앞','뒤','내용','유형','이름','출처','경계','생성',
    '나','가족','이웃','세계','사랑','윤리','근거','신뢰','변경',
    '고도화','병합','세분화','합의','초월','미인지#','이관','설계자','방향'];

  [['_slotT',0,9],['_slotG',9,18],['_slotS',18,27]].forEach(([id,start,end])=>{
    const grid = document.getElementById(id);
    if(!grid) return;
    for(let i=start;i<end;i++){
      const key = fields[i];
      const val = c[key] ?? 0;
      const filled = val !== 0 && val !== -1 && val !== null;
      const div = document.createElement('div');
      div.className = `slot ${filled?'확정':''}`;
      div.title = `[${i}] ${slotNames[i]}`;
      const display = typeof val==='number'&&val>1e10? new Date(val).toLocaleTimeString('ko',{hour:'2-digit',minute:'2-digit'}):val;
      div.innerHTML = `<span class="slot-n">${slotNames[i]}</span><span class="slot-v">${display}</span>`;
      grid.appendChild(div);
    }
  });

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
  f.reset();document.getElementById('welcome')?.classList.add('hidden');
  await refresh();toast('셀 생성: '+b.name,'확정');
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

  // Events
  document.addEventListener('셀선택', e => showDetail(e.detail));
  document.addEventListener('데이터변경', () => refresh());
  document.addEventListener('알림', e => toast(e.detail.msg, e.detail.type));

  document.getElementById('cellForm')?.addEventListener('submit', createCell);
  document.getElementById('claimForm')?.addEventListener('submit', createClaim);
  document.getElementById('searchForm')?.addEventListener('submit', search);
  document.getElementById('sampleBtn')?.addEventListener('click', loadSample);
  document.getElementById('refreshBtn')?.addEventListener('click', refresh);

  // Welcome shortcuts
  document.getElementById('w_sample')?.addEventListener('click', loadSample);
  document.getElementById('w_tmpl')?.addEventListener('click', ()=>go('tmpl'));
  document.getElementById('w_decide')?.addEventListener('click', ()=>go('decide'));

  // KPS sample
  const kpsSample = Array.from({length:80},(_,i)=>{
    const b=100+i*.4, n=(Math.random()-.5)*8, t=Math.sin(i*.15)*12, c=b+t+n;
    return {open:c-n*.3,high:c+Math.abs(n),low:c-Math.abs(n),close:c};
  });
  chart.데이터설정(kpsSample);

  // Load
  health().then(d => {
    if (d && d.totalCells > 0) document.getElementById('welcome')?.classList.add('hidden');
  });
  graph.로드();

  go('graph');
}

document.addEventListener('DOMContentLoaded', init);
