// ═══════════════════════════════════════════════════════════════
// 1) 규칙적 라이프스타일 엔진
//
// 27슬롯 하루: 기반(의무 9) + 관계(사람 9) + 성장(발전 9)
// 습관 추적 → 근거 축적 → 자동 확정 → 원칙 성장
// ═══════════════════════════════════════════════════════════════

'use strict';

class LifeEngine {
  constructor(memory) {
    this.memory = memory;
  }

  // 라이프스타일 프로필 생성
  createProfile(name) {
    const cells = [];

    // 기반 습관 (의무/건강/생존)
    const baseHabits = [
      { name: `${name}:기상`, content: '06:00', layer: 0 },
      { name: `${name}:운동`, content: '30분', layer: 0 },
      { name: `${name}:식사`, content: '3끼 규칙', layer: 0 },
      { name: `${name}:수면`, content: '23:00', layer: 0 },
      { name: `${name}:위생`, content: '일일루틴', layer: 0 },
    ];

    // 관계 활동
    const relHabits = [
      { name: `${name}:가족시간`, content: '저녁식사', layer: 1 },
      { name: `${name}:친구연락`, content: '주1회', layer: 1 },
      { name: `${name}:봉사`, content: '월1회', layer: 1 },
    ];

    // 성장 활동
    const growthHabits = [
      { name: `${name}:독서`, content: '30분', layer: 2 },
      { name: `${name}:학습`, content: '새기술', layer: 2 },
      { name: `${name}:묵상`, content: '아침', layer: 2 },
      { name: `${name}:일기`, content: '저녁', layer: 2 },
    ];

    const allHabits = [...baseHabits, ...relHabits, ...growthHabits];
    const ids = [];

    for (const h of allHabits) {
      const cell = this.memory.createValue(h.name, 3, h.content, { layer: h.layer });
      ids.push(cell.id);
    }

    // 순차 연결 (하루 흐름)
    for (let i = 0; i < ids.length - 1; i++) {
      this.memory.connectBidirectional(ids[i], ids[i + 1]);
    }

    // 통계 셀
    const statsCell = this.memory.createValue(`${name}:달성률`, 8, '자동계산', { layer: 2 });
    const streakCell = this.memory.createValue(`${name}:연속일`, 1, 0, { layer: 2 });

    return {
      name,
      habitIds: ids,
      statsId: statsCell.id,
      streakId: streakCell.id,
      totalHabits: allHabits.length,
    };
  }

  // 습관 체크 (근거 추가)
  checkHabit(cellId) {
    return this.memory.addEvidenceToCell(cellId);
  }

  // 하루 체크 — 모든 습관에 근거 추가
  checkDay(habitIds) {
    const results = [];
    for (const id of habitIds) {
      const cell = this.memory.addEvidenceToCell(id);
      results.push({ id, name: cell?.name, evidence: cell?.evidence, status: cell?.statusName });
    }
    return results;
  }

  // 달성률 계산
  calcAchievement(habitIds) {
    let confirmed = 0;
    let total = habitIds.length;
    for (const id of habitIds) {
      const cell = this.memory.getCell(id);
      if (cell && cell.status === 2) confirmed++; // Ti = 확정
    }
    return { confirmed, total, rate: total > 0 ? +(confirmed / total * 100).toFixed(1) : 0 };
  }
}

module.exports = { LifeEngine };
