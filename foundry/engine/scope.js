// ═══════════════════════════════════════════════════════════════
// CrownyCore — 6단계 계층 스코프 + 크로스앱 전파 엔진
//
// 개인 → 가정 → 스타트업 → 비영리 → 기업 → 국가
//
// 상위 scope는 하위를 포함해서 볼 수 있지만,
// 하위가 명시적으로 공유(share)하지 않은 셀은 볼 수 없음
// = 개인 주권 (팔란티어와의 철학적 차이)
// ═══════════════════════════════════════════════════════════════

'use strict';

const SCOPES = Object.freeze({
  PERSONAL:  0,  // 개인
  FAMILY:    1,  // 가정
  STARTUP:   2,  // 스타트업
  NONPROFIT: 3,  // 비영리 (교회 등)
  ENTERPRISE:4,  // 기업
  NATION:    5,  // 국가
});

const SCOPE_NAME = Object.freeze({
  [SCOPES.PERSONAL]:  '개인',
  [SCOPES.FAMILY]:    '가정',
  [SCOPES.STARTUP]:   '스타트업',
  [SCOPES.NONPROFIT]: '비영리',
  [SCOPES.ENTERPRISE]:'기업',
  [SCOPES.NATION]:    '국가',
});

const SCOPE_APP = Object.freeze({
  [SCOPES.PERSONAL]:  'life',
  [SCOPES.FAMILY]:    'family',
  [SCOPES.STARTUP]:   'startup',
  [SCOPES.NONPROFIT]: 'church',
  [SCOPES.ENTERPRISE]:'business',
  [SCOPES.NATION]:    'city',
});

// ═══ 전파 규칙 엔진 ═══
// Claim이 생성될 때 scope 간 자동 전파

class PropagationEngine {
  constructor(memory) {
    this.memory = memory;
    this.rules = [];
    this._initDefaultRules();
  }

  _initDefaultRules() {
    // 전파 규칙: sourceScope가 null이면 어느 scope에서든 발동
    this.rules = [
      // 헌금 → 교회 재정 집계 (어느 앱에서든)
      { name: '헌금집계', sourcePredicate: '헌금', sourceScope: null, targetScope: SCOPES.NONPROFIT,
        transform: (claim) => ({ subject: '교회재정', predicate: '수입', object: `${claim.claim?.subject||''}: ${claim.claim?.object||''}`, layer: 1 }) },

      // 지출 → 가정 가계부 (어느 앱에서든)
      { name: '가계부집계', sourcePredicate: '지출', sourceScope: null, targetScope: SCOPES.FAMILY,
        transform: (claim) => ({ subject: '가계부', predicate: '지출', object: `${claim.claim?.subject||''}: ${claim.claim?.object||''}`, layer: 1 }) },

      // 공지 → 개인 일정 (비영리에서)
      { name: '공지전파', sourcePredicate: '공지', sourceScope: SCOPES.NONPROFIT, targetScope: SCOPES.PERSONAL,
        transform: (claim) => ({ subject: '일정', predicate: claim.claim?.predicate || '공지', object: claim.claim?.object || '', layer: 1 }) },

      // 긴급경보 → 전체 (관제에서)
      { name: '긴급전파', sourcePredicate: '긴급경보', sourceScope: null, targetScope: SCOPES.PERSONAL,
        transform: (claim) => ({ subject: '긴급', predicate: '경보', object: claim.claim?.object || '', layer: 0 }) },

      // 장애 → 관제 (스타트업/기업에서)
      { name: '장애전파', sourcePredicate: '장애', sourceScope: null, targetScope: SCOPES.NATION,
        transform: (claim) => ({ subject: claim.claim?.subject||'', predicate: '서비스이상', object: claim.claim?.object||'', layer: 2 }) },

      // 매출 → 기업 집계 (스타트업에서)
      { name: '매출집계', sourcePredicate: '매출', sourceScope: SCOPES.STARTUP, targetScope: SCOPES.ENTERPRISE,
        transform: (claim) => ({ subject: '기업재무', predicate: '매출집계', object: `${claim.claim?.subject||''}: ${claim.claim?.object||''}`, layer: 1 }) },
    ];
  }

  // 전파 규칙 추가
  addRule(rule) { this.rules.push(rule); }

  // Claim 생성 시 자동 전파 실행
  propagate(claim, sourceScope) {
    const results = [];
    for (const rule of this.rules) {
      if (rule.sourcePredicate === claim.claim?.predicate && (rule.sourceScope === null || rule.sourceScope === sourceScope)) {
        const newClaim = rule.transform(claim);
        const created = this.memory.createClaim(newClaim.subject, newClaim.predicate, newClaim.object, 0, newClaim.layer);
        results.push({ rule: rule.name, from: sourceScope, to: rule.targetScope, claim: created });
      }
    }
    return results;
  }

  getRules() { return this.rules.map(r => ({ name: r.name, sourcePredicate: r.sourcePredicate, from: SCOPE_NAME[r.sourceScope], to: SCOPE_NAME[r.targetScope] })); }
}

module.exports = { SCOPES, SCOPE_NAME, SCOPE_APP, PropagationEngine };
