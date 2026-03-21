// ═══════════════════════════════════════════════════════════════
// 3) 초통합도시관리 · 빌딩관리 · 긴급경보 엔진
//
// 도시 = 빌딩 셀 그래프 + 센서 네트워크 + 긴급 프로토콜
// 4상 경보: Ti(정상) Om(주의) Ta(경고) Eum(긴급)
// ═══════════════════════════════════════════════════════════════

'use strict';

class CityEngine {
  constructor(memory) {
    this.memory = memory;
    this.alerts = [];
  }

  // 빌딩 등록
  createBuilding(name, address, floors, usage) {
    const cells = [];
    const bld = this.memory.createValue(name, 3, address, { layer: 0, confirmed: true, tag: 'building' });
    cells.push(bld);

    const systems = [
      { name: `${name}:전력`, content: '정상', layer: 0 },
      { name: `${name}:수도`, content: '정상', layer: 0 },
      { name: `${name}:가스`, content: '정상', layer: 0 },
      { name: `${name}:엘리베이터`, content: `${floors}층`, layer: 0 },
      { name: `${name}:소방`, content: '점검필요', layer: 0 },
      { name: `${name}:보안`, content: 'CCTV+출입', layer: 0 },
      { name: `${name}:통신`, content: '인터넷+전화', layer: 0 },
    ];

    for (const s of systems) {
      const cell = this.memory.createValue(s.name, 3, s.content, { layer: s.layer });
      cells.push(cell);
      this.memory.connectBidirectional(bld.id, cell.id);
    }

    // 모니터링 셀
    const monitor = this.memory.createValue(`${name}:종합상태`, 8, '4상판단', { layer: 2 });
    cells.push(monitor);
    for (let i = 1; i < cells.length - 1; i++) {
      this.memory.connect(cells[i].id, monitor.id, 'ti');
    }

    return { buildingId: bld.id, systemIds: cells.map(c => c.id), totalSystems: systems.length };
  }

  // 센서 이벤트 수신
  sensorEvent(buildingId, system, value, severity) {
    // severity: 'normal' | 'caution' | 'warning' | 'critical'
    const severityMap = { normal: 2, caution: 0, warning: -2, critical: -1 };
    const cell = this.memory.getCell(buildingId);
    if (!cell) return null;

    // Claim으로 이벤트 기록
    const claim = this.memory.createClaim(
      cell.name || `빌딩#${buildingId}`,
      system,
      `${value} (${severity})`,
      severityMap[severity] ?? 0,
      severity === 'critical' ? 0 : 1
    );

    // 긴급 시 경보
    if (severity === 'critical' || severity === 'warning') {
      const alert = {
        id: this.alerts.length + 1,
        buildingId,
        building: cell.name,
        system,
        value,
        severity,
        timestamp: Date.now(),
        resolved: false,
      };
      this.alerts.push(alert);
      return { alert, claim };
    }

    return { claim };
  }

  // 경보 해제
  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
    }
    return alert;
  }

  // 시나리오 시뮬레이션
  runScenario(scenario) {
    // scenario: { name, events: [{ buildingId, system, value, severity }] }
    const results = [];
    for (const event of (scenario.events || [])) {
      const r = this.sensorEvent(event.buildingId, event.system, event.value, event.severity);
      results.push(r);
    }
    return {
      scenario: scenario.name,
      eventsProcessed: results.length,
      alertsTriggered: results.filter(r => r.alert).length,
      results,
    };
  }

  getAlerts(activeOnly = true) {
    return activeOnly ? this.alerts.filter(a => !a.resolved) : this.alerts;
  }

  getBuildings() {
    // tag가 'building'인 셀 목록
    return this.memory.search('building').filter(c => c.tag === 'building' || (c.content && c.type === 3));
  }

  stats() {
    return {
      totalAlerts: this.alerts.length,
      activeAlerts: this.alerts.filter(a => !a.resolved).length,
      resolvedAlerts: this.alerts.filter(a => a.resolved).length,
    };
  }
}

module.exports = { CityEngine };
