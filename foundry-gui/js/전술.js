// CrownyCore — 전술 GUI
// ACH 매트릭스 | 워게임 COA | MDMP 파이프라인 | 적 모델링
const API = '/api/foundry';

class 전술앱 {
  constructor(id) { this.el = document.getElementById(id); this.tab = 'ach'; }

  async 초기화() { if (!this.el) return; this.렌더(); }

  async 렌더() {
    if (!this.el) return;
    const tabs = [
      { id: 'ach', label: 'ACH 가설 분석' },
      { id: 'wargame', label: '워게임' },
      { id: 'mdmp', label: 'MDMP' },
      { id: 'redteam', label: '적 모델링' },
    ];
    this.el.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:6px;flex-wrap:wrap">
        ${tabs.map(t => `<button class="btn ${this.tab === t.id ? 'btn-p' : ''} _tt" data-tab="${t.id}" style="font-size:10px;padding:3px 8px">${t.label}</button>`).join('')}
      </div>
      <div id="_tc"></div>`;
    this.el.querySelectorAll('._tt').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.렌더(); }));
    const ct = document.getElementById('_tc');
    if (!ct) return;
    switch (this.tab) {
      case 'ach': await this._achTab(ct); break;
      case 'wargame': await this._wargameTab(ct); break;
      case 'mdmp': await this._mdmpTab(ct); break;
      case 'redteam': await this._redteamTab(ct); break;
    }
  }

  // ─── ACH 매트릭스 (#42) ───
  async _achTab(ct) {
    const [evalRes, matRes] = await Promise.all([
      fetch(`${API}/tactical/ach/evaluate`).then(r => r.json()).catch(() => []),
      fetch(`${API}/tactical/ach/matrix`).then(r => r.json()).catch(() => ({})),
    ]);

    const hypotheses = matRes.hypotheses || [];
    const evidence = matRes.evidence || [];

    ct.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:10px">
        <button class="btn btn-p" id="_achAddH">+ 가설</button>
        <button class="btn" id="_achAddE">+ 증거</button>
        <button class="btn" id="_achEval">평가</button>
      </div>

      <!-- ACH 매트릭스 -->
      ${hypotheses.length && evidence.length ? `
      <div class="card" style="margin-bottom:8px;overflow-x:auto">
        <table style="width:100%;font-size:9px;border-collapse:collapse;min-width:300px">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th style="padding:4px;text-align:left;font-size:8px">증거 \\ 가설</th>
              ${hypotheses.map(h => `<th style="padding:4px;font-size:8px;text-align:center">${h.name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${evidence.map(e => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:3px;font-weight:500" title="${e.source}">${e.name}</td>
                ${hypotheses.map(h => {
                  const row = (matRes.matrix || []).find(r => r.hypothesis === h.name);
                  const score = row?.scores?.[e.name] ?? 0;
                  const bg = score > 5 ? 'var(--확정-bg)' : score < -5 ? 'var(--오류-bg)' : score !== 0 ? 'var(--미확인-bg)' : '';
                  const color = score > 0 ? 'var(--확정)' : score < 0 ? 'var(--오류)' : 'var(--text-3)';
                  return `<td style="padding:3px;text-align:center;background:${bg};color:${color};font-weight:600;cursor:pointer" class="_achScore" data-h="${h.id}" data-e="${e.id}" title="클릭하여 점수 변경">${score > 0 ? '+' : ''}${score || '·'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : '<div class="card" style="padding:10px;color:var(--text-3);font-size:10px">가설과 증거를 추가하면 매트릭스가 표시됩니다</div>'}

      <!-- 평가 결과 -->
      ${evalRes.length ? `
      <div class="card">
        <div class="card-h"><span class="card-t">ACH 평가 결과</span></div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${evalRes.map((r, i) => `
            <div class="pipe" style="padding:4px 8px;border-left:3px solid ${i === 0 ? 'var(--확정)' : 'var(--border)'}">
              <span style="font-weight:700;min-width:20px">${i + 1}.</span>
              <span style="font-weight:500;flex:1">${r.hypothesis.name}</span>
              <span style="font-size:10px;font-weight:600;color:${r.achScore >= 10 ? 'var(--확정)' : r.achScore >= 5 ? 'var(--미확인)' : 'var(--오류)'}">ACH:${r.achScore}</span>
              <span style="font-size:9px;color:var(--text-3)">일치${r.consistent} 반박${r.inconsistent}</span>
            </div>
          `).join('')}
        </div>
        <div style="font-size:8px;color:var(--text-3);margin-top:6px">Heuer 방법론: 반박이 가장 적은 가설이 가장 가능성 높음</div>
      </div>` : ''}
    `;

    // 이벤트
    ct.querySelector('#_achAddH')?.addEventListener('click', async () => {
      const name = prompt('가설 이름:'); if (!name) return;
      const desc = prompt('설명:') || '';
      await fetch(`${API}/tactical/ach/hypothesis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, desc }) });
      this.렌더();
    });

    ct.querySelector('#_achAddE')?.addEventListener('click', async () => {
      const name = prompt('증거 이름:'); if (!name) return;
      const source = prompt('출처 (SIGINT/HUMINT/IMINT/OSINT):') || '';
      const reliability = parseInt(prompt('신뢰도 (-13~+13):') || '5');
      await fetch(`${API}/tactical/ach/evidence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, source, reliability }) });
      this.렌더();
    });

    ct.querySelector('#_achEval')?.addEventListener('click', () => this.렌더());

    ct.querySelectorAll('._achScore').forEach(cell => {
      cell.addEventListener('click', async () => {
        const score = parseInt(prompt(`점수 입력 (-13~+13)\n+: 가설 지지, -: 가설 반박, 0: 관련 없음:`) || '0');
        await fetch(`${API}/tactical/ach/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hypothesisId: +cell.dataset.h, evidenceId: +cell.dataset.e, score }) });
        this.렌더();
      });
    });
  }

  // ─── 워게임 (#43) ───
  async _wargameTab(ct) {
    const compare = await fetch(`${API}/tactical/wargame/compare`).then(r => r.json()).catch(() => ({}));
    const results = compare.results || [];

    ct.innerHTML = `
      <div style="display:flex;gap:4px;margin-bottom:10px">
        <button class="btn btn-p" id="_wgAdd">+ COA 평가</button>
        <button class="btn" id="_wgReset">초기화</button>
      </div>

      ${results.length ? `
      <div class="card" style="margin-bottom:8px">
        <div class="card-h"><span class="card-t">COA 비교 매트릭스</span></div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${results.map((r, i) => `
            <div class="pipe" style="padding:6px 8px;border-left:3px solid ${i === 0 ? 'var(--확정)' : 'var(--border)'}">
              <span style="font-weight:700;min-width:16px">${i + 1}</span>
              <div style="flex:1">
                <div style="font-weight:600">${r.coaName}</div>
                <div style="font-size:9px;color:var(--text-3)">${r.description || ''}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:14px;font-weight:700;color:${r.totalScore >= 5 ? 'var(--확정)' : r.totalScore >= 2 ? 'var(--미확인)' : 'var(--오류)'}">${r.totalScore}</div>
                <div style="font-size:8px;color:${r.dfi >= 7 ? 'var(--확정)' : r.dfi >= 3 ? 'var(--미확인)' : 'var(--오류)'}">DFI:${r.dfi ?? '?'} ${r.dfiLabel || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ${compare.winner ? `<div style="font-size:10px;color:var(--text-3)">추천: <b>${compare.winner.coaName}</b> (점수 ${compare.winner.totalScore}, DFI ${compare.winner.dfi})</div>` : ''}
      ` : '<div class="card" style="padding:10px;color:var(--text-3);font-size:10px">COA를 추가하면 비교 결과가 표시됩니다</div>'}
    `;

    ct.querySelector('#_wgAdd')?.addEventListener('click', async () => {
      const name = prompt('COA 이름:'); if (!name) return;
      const desc = prompt('설명:') || '';
      const critStr = prompt('기준 (이름:가중치:점수, 쉼표 구분)\n예: 적타격:5:8,아군피해:4:-3,시간:3:5') || '';
      const criteria = critStr.split(',').map(s => {
        const [n, w, sc] = s.split(':');
        return { name: n?.trim(), weight: parseInt(w) || 1, score: parseInt(sc) || 0, epistemic: 1 };
      }).filter(c => c.name);

      await fetch(`${API}/tactical/wargame/coa`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, criteria }) });
      this.렌더();
    });

    ct.querySelector('#_wgReset')?.addEventListener('click', async () => {
      await fetch(`${API}/tactical/wargame/reset`, { method: 'POST' });
      this.렌더();
    });
  }

  // ─── MDMP (#44) ───
  async _mdmpTab(ct) {
    const status = await fetch(`${API}/tactical/mdmp/status`).then(r => r.json()).catch(() => ({}));
    const phases = status.phases || [];

    ct.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-weight:700;font-size:13px">MDMP</span>
        <span style="font-size:11px;color:var(--text-2)">${status.currentPhaseName || '—'}</span>
        <div style="flex:1;height:6px;background:var(--bg);border-radius:3px;margin-left:8px">
          <div style="width:${status.progress || 0}%;height:100%;background:var(--확정);border-radius:3px;transition:width .3s"></div>
        </div>
        <span style="font-size:10px;font-weight:600">${status.progress || 0}%</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
        ${phases.map(p => {
          const st = p.status === 'completed' ? '확정' : p.status === 'current' ? '미확인' : '미인지';
          const icon = p.status === 'completed' ? '▲' : p.status === 'current' ? '●' : '○';
          return `<div class="pipe" style="padding:4px 8px;border-left:3px solid var(--${st})">
            <span style="min-width:14px">${icon}</span>
            <span style="font-weight:${p.status === 'current' ? '700' : '400'};flex:1">${p.id}. ${p.name}</span>
            <span style="font-size:9px;color:var(--text-3)">${p.cells || 0}셀</span>
            ${p.gateCheck && p.status === 'current' ? `
              <span class="badge ${p.gateCheck.pass ? '확정' : '오류'}" style="font-size:7px">
                Ti:${p.gateCheck.tiCount}/${p.gate.minTi} 근거:${p.gateCheck.evidenceTotal}/${p.gate.minEvidence}
              </span>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:4px">
        <button class="btn btn-p" id="_mdmpAdvance">다음 단계</button>
        <button class="btn" id="_mdmpForce" style="color:var(--오류)">사령관 오버라이드</button>
        <button class="btn" id="_mdmpAddCell">셀 추가</button>
      </div>

      ${(status.overrides || []).length ? `
      <div style="margin-top:8px;font-size:9px;color:var(--오류)">
        <div style="font-weight:600">오버라이드 이력:</div>
        ${status.overrides.map(o => `<div>${o.phaseName}: ${o.commander} — ${o.reason} (갭: ${o.gaps?.join(', ') || '없음'})</div>`).join('')}
      </div>` : ''}
    `;

    ct.querySelector('#_mdmpAdvance')?.addEventListener('click', async () => {
      const r = await fetch(`${API}/tactical/mdmp/advance`, { method: 'POST' }).then(r => r.json());
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: r.advanced ? `→ ${r.phaseName}` : `차단: ${r.gaps?.join(', ')}`, type: r.advanced ? '확정' : '오류' } }));
      this.렌더();
    });

    ct.querySelector('#_mdmpForce')?.addEventListener('click', async () => {
      const reason = prompt('오버라이드 사유:');
      if (!reason) return;
      const r = await fetch(`${API}/tactical/mdmp/force`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commander: '사령관', reason }) }).then(r => r.json());
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `오버라이드 → ${r.newPhase}단계`, type: '오류' } }));
      this.렌더();
    });

    ct.querySelector('#_mdmpAddCell')?.addEventListener('click', async () => {
      const name = prompt('정보 셀 이름:'); if (!name) return;
      const evidence = parseInt(prompt('근거 수:') || '1');
      await fetch(`${API}/tactical/mdmp/cell`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseId: status.currentPhase, cell: { name, status: 2, evidence } }) });
      this.렌더();
    });
  }

  // ─── 적 모델링 (#45) ───
  async _redteamTab(ct) {
    const [deception, advantage] = await Promise.all([
      fetch(`${API}/tactical/redteam/deception`).then(r => r.json()).catch(() => []),
      fetch(`${API}/tactical/redteam/advantage`).then(r => r.json()).catch(() => []),
    ]);

    ct.innerHTML = `
      <div class="card" style="margin-bottom:8px">
        <div class="card-h"><span class="card-t">적 추정 지식 설정</span></div>
        <button class="btn btn-p" id="_rtSet">적 지식 설정</button>
        <button class="btn" id="_rtPredict">적 행동 예측</button>
      </div>

      ${deception.length ? `
      <div class="card" style="margin-bottom:8px;border-left:3px solid var(--오류)">
        <div class="card-h"><span class="card-t">기만 기회 (적의 오인 활용)</span></div>
        ${deception.map(d => `<div class="pipe" style="padding:3px 6px"><span style="color:var(--오류);font-size:10px">${d.opportunity}</span></div>`).join('')}
      </div>` : ''}

      ${advantage.length ? `
      <div class="card" style="border-left:3px solid var(--확정)">
        <div class="card-h"><span class="card-t">정보 우위 (적의 미인지 활용)</span></div>
        ${advantage.map(a => `<div class="pipe" style="padding:3px 6px"><span style="color:var(--확정);font-size:10px">${a.advantage}</span></div>`).join('')}
      </div>` : ''}

      ${!deception.length && !advantage.length ? '<div class="card" style="padding:10px;color:var(--text-3);font-size:10px">적 지식을 설정하면 기만 기회와 정보 우위가 표시됩니다</div>' : ''}
    `;

    ct.querySelector('#_rtSet')?.addEventListener('click', async () => {
      const input = prompt('적 추정 지식 (JSON 배열)\n예: [{"fact":"아군위치","epistemic":-1,"description":"아군 주력 서부 집중(실제:중부)"},{"fact":"예비대","epistemic":-2,"description":"예비대 3여단"}]');
      if (!input) return;
      try {
        const items = JSON.parse(input);
        await fetch(`${API}/tactical/redteam/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
        this.렌더();
      } catch { document.dispatchEvent(new CustomEvent('알림', { detail: { msg: 'JSON 형식 오류', type: '오류' } })); }
    });

    ct.querySelector('#_rtPredict')?.addEventListener('click', async () => {
      const r = await fetch(`${API}/tactical/redteam/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'enemy_action', description: '적 다음 행동 예측' }) }).then(r => r.json());
      const ep = r.enemyEpistemicState || {};
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `적 예측: ${r.predictedAction} (확인${ep.known} 오인${ep.wrong} 미인지${ep.unaware})`, type: '미확인' } }));
    });
  }
}

export { 전술앱 };
