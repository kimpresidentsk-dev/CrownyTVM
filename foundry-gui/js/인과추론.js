// CrownyCore — 인과추론 시각화 (전면 한국어)
const API = '/api/foundry';

const REL_INFO = {
  1:   { name: '인과',   symbol: '→', cls: '인과',   desc: '원인→결과 확인됨' },
  0:   { name: '상관',   symbol: '~', cls: '상관',   desc: '같이 움직이지만 원인은 아직 모름' },
  '-1': { name: '허위',   symbol: '⊘', cls: '허위',   desc: '가짜 관계 — 다른 원인이 있음' },
  '-2': { name: '미인지', symbol: '?', cls: '미인지', desc: '관계가 있는지 아직 모름' },
};

class 인과추론패널 {
  constructor(컨테이너ID) { this.el = document.getElementById(컨테이너ID); this.edges=[]; this.stats={}; }

  async 로드() {
    try {
      const [er, sr] = await Promise.all([ fetch(`${API}/causal/edges`), fetch(`${API}/causal/stats`) ]);
      this.edges = (await er.json()).edges || [];
      this.stats = await sr.json();
      this.렌더();
    } catch {}
  }

  렌더() {
    if (!this.el) return;
    const s = this.stats;
    this.el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><div class="stat-v">${s.total||0}</div><div class="stat-l">전체 관계</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${s.causal||0}</div><div class="stat-l">→ 인과</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미확인)">${s.correlate||0}</div><div class="stat-l">~ 상관</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${s.spurious||0}</div><div class="stat-l">⊘ 허위</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--미인지)">${s.unknown||0}</div><div class="stat-l">? 미인지</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-p" id="_causalDetect" title="셀들 사이에서 자동으로 관계를 찾아요">동시발생 감지</button>
        <button class="btn btn-p" id="_causalInfer" title="모든 관계를 다시 판단해서 승격/강등해요">자동 추론</button>
        <button class="btn" id="_causalRefresh">새로고침</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
        <input id="_relSrc" type="number" placeholder="원인 셀 ID" style="width:80px" title="원인이 되는 셀 번호">
        <span style="color:var(--text-3)">→</span>
        <input id="_relTgt" type="number" placeholder="결과 셀 ID" style="width:80px" title="영향받는 셀 번호">
        <select id="_relType" title="관계 종류">
          <option value="-2">? 미인지</option>
          <option value="0">~ 상관</option>
          <option value="1">→ 인과</option>
        </select>
        <button class="btn" id="_relAdd" title="관계 추가">추가</button>
        <button class="btn" id="_relIntervene" title="원인 셀을 바꿨을 때 결과가 변하는지 테스트">개입 테스트</button>
      </div>
      <div style="font-size:10px;font-weight:600;color:var(--text-3);margin-bottom:6px;letter-spacing:.04em">관계 목록</div>
      <div style="display:flex;flex-direction:column;gap:3px;max-height:350px;overflow-y:auto">
        ${this.edges.length ? this.edges.map(e => {
          const info = REL_INFO[e.type] || REL_INFO['-2'];
          return `<div class="pipe"><div class="dot ${info.cls}"></div><span style="font-family:monospace;min-width:30px">#${e.source}</span><span style="font-weight:600;min-width:16px;text-align:center;color:var(--${info.cls==='인과'?'확정':info.cls==='상관'?'미확인':info.cls==='허위'?'오류':'미인지'})">${info.symbol}</span><span style="font-family:monospace;min-width:30px">#${e.target}</span><span class="badge ${info.cls}" style="font-size:8px">${info.name}</span><span style="color:var(--text-3);font-size:9px;margin-left:auto">신뢰:${e.confidence} 근거:${e.evidence} 시간:${e.temporal>0?'선행':'='} 개입:${e.intervention>0?'변화':e.intervention<0?'불변':'?'}</span></div>`;
        }).join('') : '<p style="color:var(--text-3);font-size:11px">관계가 없어요. 셀을 만든 후 "동시발생 감지"를 눌러보세요.</p>'}
      </div>`;

    document.getElementById('_causalDetect')?.addEventListener('click', async () => {
      const r = await fetch(`${API}/causal/detect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({windowMs:999999999})});
      const d = await r.json();
      document.dispatchEvent(new CustomEvent('알림',{detail:{msg:`${d.detected}개 관계 발견`,type:d.detected>0?'확정':'미확인'}}));
      this.로드();
    });
    document.getElementById('_causalInfer')?.addEventListener('click', async () => {
      const r = await fetch(`${API}/causal/infer`,{method:'POST'});
      const d = await r.json();
      document.dispatchEvent(new CustomEvent('알림',{detail:{msg:`승격 ${d.promoted}건, 강등 ${d.demoted}건`,type:d.promoted>0?'확정':'미확인'}}));
      this.로드();
    });
    document.getElementById('_causalRefresh')?.addEventListener('click', () => this.로드());
    document.getElementById('_relAdd')?.addEventListener('click', async () => {
      const src=parseInt(document.getElementById('_relSrc')?.value), tgt=parseInt(document.getElementById('_relTgt')?.value), type=parseInt(document.getElementById('_relType')?.value);
      if(!src||!tgt) return;
      await fetch(`${API}/causal/relate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:src,target:tgt,type})});
      await fetch(`${API}/causal/temporal`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:src,target:tgt})});
      this.로드();
    });
    document.getElementById('_relIntervene')?.addEventListener('click', async () => {
      const src=parseInt(document.getElementById('_relSrc')?.value), tgt=parseInt(document.getElementById('_relTgt')?.value);
      if(!src||!tgt) return;
      await fetch(`${API}/cells/${src}/evidence`,{method:'POST'});
      const tc=await(await fetch(`${API}/cells/${tgt}`)).json();
      const r=await fetch(`${API}/causal/intervene`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:src,target:tgt,targetChanged:tc.evidence>0})});
      const d=await r.json();
      document.dispatchEvent(new CustomEvent('알림',{detail:{msg:d.intervention>0?'결과 변화 확인 → 인과 증거':'결과 불변 → 약한 증거',type:d.intervention>0?'확정':'미확인'}}));
      this.로드();
    });
  }
}

export { 인과추론패널, REL_INFO };
