// CrownyCore — 언약적 의사결정 GUI (전면 한국어)
const API = '/api/foundry';

const PHASE_MAP = {
  1:  { symbol: '▲', name: 'Ti',  cls: '확정',   label: '즉시 실행', desc: '아는 것 — 즉시 작동' },
  0:  { symbol: '●', name: 'Om',  cls: '미확인', label: '학습 후 실행', desc: '모르는 것 — 중단 후 학습' },
  '-1':{ symbol: '▼', name: 'Ta',  cls: '오류',   label: '자동 이관', desc: '잘못 아는 것 — 다른 에이전트로' },
  '-2':{ symbol: '◆', name: 'Eum', cls: '미인지', label: '설계자 보고', desc: '미인지 — 설계자가 방향 수립' },
};

class 언약패널 {
  constructor(컨테이너ID) { this.el = document.getElementById(컨테이너ID); }

  async 로드() {
    const [statsRes, principlesRes, decisionsRes, issuesRes] = await Promise.all([
      fetch(`${API}/covenant/stats`).then(r=>r.json()).catch(()=>({})),
      fetch(`${API}/covenant/principles`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/covenant/decisions?limit=20`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/covenant/issues`).then(r=>r.json()).catch(()=>[]),
    ]);
    this.렌더(statsRes, principlesRes, decisionsRes, issuesRes);
  }

  렌더(stats, principles, decisions, issues) {
    if (!this.el) return;
    this.el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="card cov-layer cov-base"><h4>기반 / 보호</h4><div style="font-size:11px;color:var(--text-2)">보호적 울타리 · 비례적 제한<br><b style="color:var(--확정)">경계 차단: ${stats.boundaryBlocks||0}건</b></div></div>
        <div class="card cov-layer cov-relation"><h4>관계 / 협력</h4><div style="font-size:11px;color:var(--text-2)">나 → 가족 → 이웃 → 세계<br><b style="color:var(--미확인)">축적된 원칙: ${stats.principles||0}건</b></div></div>
        <div class="card cov-layer cov-growth"><h4>성장 / 혁신</h4><div style="font-size:11px;color:var(--text-2)">고도화 · 병합 · 세분화<br><b style="color:#6B5B8A">성장 단위: ${stats.growthLevel||3}</b></div></div>
      </div>
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><div class="stat-v">${stats.totalDecisions||0}</div><div class="stat-l">전체 결정</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${stats.ti||0}</div><div class="stat-l">▲ 즉시실행</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${stats.om||0}</div><div class="stat-l">● 학습후실행</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${stats.ta||0}</div><div class="stat-l">▼ 자동이관</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미인지)">${stats.eum||0}</div><div class="stat-l">◆ 설계자보고</div></div>
        <div class="stat"><div class="stat-v">${stats.designerIssues||0}</div><div class="stat-l">설계자 이슈</div></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="card-h"><span class="card-t">결정할 사건 입력</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-width:500px">
          <input id="_covType" placeholder="사건 종류 (예: 가격결정)" style="padding:5px 8px;border:1px solid var(--border);border-radius:3px;font-size:11px">
          <input id="_covDesc" placeholder="설명 (예: 제품가격 10% 인상)" style="padding:5px 8px;border:1px solid var(--border);border-radius:3px;font-size:11px">
          <div style="display:flex;gap:4px;font-size:10px;align-items:center">
            <label title="이 결정이 나에게 미치는 영향 (-5~+5)">나<input id="_covSelf" type="number" value="0" style="width:36px;padding:2px;border:1px solid var(--border);border-radius:2px;margin-left:2px"></label>
            <label title="가족에게 미치는 영향">가족<input id="_covFamily" type="number" value="0" style="width:36px;padding:2px;border:1px solid var(--border);border-radius:2px;margin-left:2px"></label>
            <label title="이웃/고객에게 미치는 영향">이웃<input id="_covNeighbor" type="number" value="0" style="width:36px;padding:2px;border:1px solid var(--border);border-radius:2px;margin-left:2px"></label>
            <label title="세계/사회에 미치는 영향">세계<input id="_covWorld" type="number" value="0" style="width:36px;padding:2px;border:1px solid var(--border);border-radius:2px;margin-left:2px"></label>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-p" id="_covSubmit">결정하기</button>
            <button class="btn" id="_covRefresh">새로고침</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="card-h"><span class="card-t">최근 결정</span></div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:260px;overflow-y:auto">
          ${decisions.length ? decisions.reverse().map(d => {
            const p = PHASE_MAP[d.phase?.value] || PHASE_MAP['-2'];
            return `<div class="pipe"><span style="font-size:13px">${p.symbol}</span><span class="badge ${p.cls}" style="font-size:8px;min-width:56px;text-align:center">${p.label}</span><span style="flex:1;font-weight:500">${d.event?.type||d.event?.description||'—'}</span><span style="color:var(--text-3);font-size:9px">${d.layers?.gospel?'윤리:'+d.layers.gospel.ethicsScore:''} ${d.layers?.torah?'비례:'+d.layers.torah.score:''}</span></div>`;
          }).join('') : '<p style="color:var(--text-3);font-size:11px">아직 결정이 없어요. 위에서 사건을 입력하세요.</p>'}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="card">
          <div class="card-h"><span class="card-t">축적된 원칙</span></div>
          <div style="display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto">
            ${principles.length ? principles.map(p=>`<div class="pipe"><div class="dot ${p.confidence>=10?'확정':p.confidence>0?'미확인':'미인지'}"></div><span style="flex:1;font-weight:500">${p.key}</span><span style="color:var(--text-3);font-size:9px">신뢰:${p.confidence} ${p.count}회</span></div>`).join('') : '<p style="color:var(--text-3);font-size:11px">Ti 결정이 쌓이면 원칙이 됩니다</p>'}
          </div>
        </div>
        <div class="card">
          <div class="card-h"><span class="card-t">설계자 이슈 (Eum)</span></div>
          <div style="display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto">
            ${issues.length ? issues.map(i=>`<div class="pipe"><span style="font-size:11px">◆</span><span style="flex:1">${i.note||'—'}</span><span style="color:var(--text-3);font-size:9px">#${i.decision}</span></div>`).join('') : '<p style="color:var(--text-3);font-size:11px">Eum 사건이 여기에 올라옵니다</p>'}
          </div>
        </div>
      </div>`;

    document.getElementById('_covSubmit')?.addEventListener('click', () => this._submit());
    document.getElementById('_covRefresh')?.addEventListener('click', () => this.로드());
  }

  async _submit() {
    const event = {
      type: document.getElementById('_covType')?.value || '',
      description: document.getElementById('_covDesc')?.value || '',
      impact: {
        self: parseInt(document.getElementById('_covSelf')?.value)||0,
        family: parseInt(document.getElementById('_covFamily')?.value)||0,
        neighbor: parseInt(document.getElementById('_covNeighbor')?.value)||0,
        world: parseInt(document.getElementById('_covWorld')?.value)||0,
      },
    };
    try {
      const res = await fetch(`${API}/covenant/decide`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({event,context:{}}) });
      const d = await res.json();
      const p = PHASE_MAP[d.phase?.value] || PHASE_MAP['-2'];
      document.dispatchEvent(new CustomEvent('알림', { detail:{ msg:`${p.symbol} ${p.label}: ${event.type||event.description}`, type:p.cls }}));
      this.로드();
    } catch {}
  }
}

export { 언약패널, PHASE_MAP };
