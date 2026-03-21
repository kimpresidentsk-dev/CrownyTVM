// CrownyCore — 도시관리·빌딩관리·긴급경보 UI
const API = '/api/foundry';

class 도시앱 {
  constructor(컨테이너ID) { this.el = document.getElementById(컨테이너ID); }

  async 초기화() {
    if (!this.el) return;
    const [alertRes, statsRes] = await Promise.all([
      fetch(`${API}/city/alerts?all=true`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/city/stats`).then(r=>r.json()).catch(()=>({})),
    ]);
    this.렌더(alertRes, statsRes);
  }

  렌더(alerts, stats) {
    const active = (alerts||[]).filter(a => !a.resolved);
    const resolved = (alerts||[]).filter(a => a.resolved);

    this.el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><div class="stat-v">${stats.totalAlerts||0}</div><div class="stat-l">전체 경보</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--오류)">${stats.activeAlerts||0}</div><div class="stat-l">진행 중</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--확정)">${stats.resolvedAlerts||0}</div><div class="stat-l">해제됨</div></div>
      </div>

      <!-- 빌딩 등록 -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-h"><span class="card-t">빌딩 등록</span></div>
        <form id="_bldForm" style="display:flex;gap:6px;flex-wrap:wrap;align-items:end">
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">빌딩명</label>
            <input name="name" placeholder="크라우니타워" required style="width:110px">
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">주소</label>
            <input name="address" placeholder="서울시 강남구" style="width:130px">
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <label style="font-size:9px;color:var(--text-3)">층수</label>
            <input name="floors" type="number" value="10" style="width:50px">
          </div>
          <button type="submit" class="btn btn-p">등록</button>
        </form>
      </div>

      <!-- 시나리오 실행 -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-h"><span class="card-t">긴급 시나리오</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn _scenario" data-type="fire" style="font-size:10px">화재 시나리오</button>
          <button class="btn _scenario" data-type="earthquake" style="font-size:10px">지진 시나리오</button>
          <button class="btn _scenario" data-type="power" style="font-size:10px">정전 시나리오</button>
          <button class="btn _scenario" data-type="flood" style="font-size:10px">침수 시나리오</button>
        </div>
      </div>

      <!-- 경보 현황 -->
      <div class="card">
        <div class="card-h"><span class="card-t">경보 현황</span></div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto" id="_alertList">
          ${active.length ? active.map(a => `
            <div class="pipe" style="border-color:var(--오류)">
              <div class="dot 오류"></div>
              <span style="font-weight:600">${a.building||'빌딩#'+a.buildingId}</span>
              <span style="color:var(--text-3);font-size:10px">${a.system}: ${a.value}</span>
              <span class="badge 오류" style="font-size:8px">${a.severity}</span>
              <button class="btn _resolve" data-id="${a.id}" style="font-size:9px;padding:1px 5px;margin-left:auto">해제</button>
            </div>`).join('') : '<div style="color:var(--text-3);font-size:11px;padding:8px">경보 없음 — 시나리오를 실행해보세요</div>'}
          ${resolved.length ? '<div style="font-size:9px;color:var(--text-3);margin-top:8px">해제된 경보:</div>' + resolved.map(a => `
            <div class="pipe" style="opacity:.5">
              <div class="dot 확정"></div>
              <span>${a.building||''} ${a.system}: ${a.value}</span>
              <span class="badge 확정" style="font-size:8px">해제</span>
            </div>`).join('') : ''}
        </div>
      </div>
    `;

    // 빌딩 등록
    document.getElementById('_bldForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await fetch(`${API}/city/building`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: f.name.value, address: f.address.value, floors: +f.floors.value })
      });
      f.reset();
      document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '빌딩 등록 완료', type: '확정' } }));
      document.dispatchEvent(new CustomEvent('데이터변경'));
      this.초기화();
    });

    // 시나리오 실행
    this.el.querySelectorAll('._scenario').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        // 먼저 빌딩이 있는지 확인
        const cells = await (await fetch(`${API}/cells?limit=100`)).json();
        const buildings = (cells.cells||[]).filter(c => c.tag === 'building' || (c.confirmed && c.type === 3 && c.layer === 0));
        if (buildings.length === 0) {
          document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '먼저 빌딩을 등록하세요', type: '미확인' } }));
          return;
        }
        const bld = buildings[0];
        const scenarios = {
          fire: { name: '화재 시나리오', events: [
            { buildingId: bld.id, system: '소방', value: '연기감지 3층', severity: 'critical' },
            { buildingId: bld.id, system: '엘리베이터', value: '자동정지', severity: 'warning' },
            { buildingId: bld.id, system: '보안', value: '대피방송 시작', severity: 'caution' },
          ]},
          earthquake: { name: '지진 시나리오', events: [
            { buildingId: bld.id, system: '구조', value: '진도 4.5 감지', severity: 'critical' },
            { buildingId: bld.id, system: '가스', value: '자동차단', severity: 'warning' },
            { buildingId: bld.id, system: '엘리베이터', value: '전층 정지', severity: 'warning' },
          ]},
          power: { name: '정전 시나리오', events: [
            { buildingId: bld.id, system: '전력', value: '주전원 차단', severity: 'critical' },
            { buildingId: bld.id, system: '전력', value: '비상발전기 가동', severity: 'caution' },
          ]},
          flood: { name: '침수 시나리오', events: [
            { buildingId: bld.id, system: '수도', value: '지하주차장 침수', severity: 'critical' },
            { buildingId: bld.id, system: '전력', value: '지하배전반 위험', severity: 'warning' },
          ]},
        };
        const scenario = scenarios[type];
        if (!scenario) return;
        const res = await fetch(`${API}/city/scenario`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify(scenario)
        });
        const result = await res.json();
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: `${scenario.name}: ${result.alertsTriggered}건 경보 발생`, type: '오류' } }));
        this.초기화();
      });
    });

    // 경보 해제
    this.el.querySelectorAll('._resolve').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`${API}/city/resolve`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ alertId: +btn.dataset.id })
        });
        document.dispatchEvent(new CustomEvent('알림', { detail: { msg: '경보 해제', type: '확정' } }));
        this.초기화();
      });
    });
  }
}

export { 도시앱 };
