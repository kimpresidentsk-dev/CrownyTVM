// ═══════════════════════════════════════════════════════════════
// CrownyCore — 언약적 의사결정 아키텍처 (Covenantal Decision Architecture)
//
// 3계층 언약 구조:
//   Layer 1 (토라/경계): 보호적 울타리, 비례적 제한, 헌법적 경계
//   Layer 2 (복음/관계): 관계적 윤리, 나→가족→이웃→세계 가중치
//   Layer 3 (성령/초월): 초월적 규칙기반, 고도화·병합·세분화 성장
//
// 4상 작동 원칙:
//   Ti (+1) 아는 것     → 즉시 작동
//   Om ( 0) 모르는 것   → 즉시 중단 → 학습 → 재작동
//   Ta (-1) 잘못 아는 것 → 자동 프로젝트 이관 (에이전트 자신은 모름)
//   Eum(-2) 미인지      → 설계자 이슈 업로드 → 고유 방향 수립
//
// 성장: 3진법적 배수 (3→9→27→81→243→729)
// ═══════════════════════════════════════════════════════════════

'use strict';

// ═══ 27방사형 언약 슬롯 정의 ═══
//
// 안쪽 링 (0~8): 토라/경계 — 존재, 정체, 경계
// 중간 링 (9~17): 복음/관계 — 관계, 윤리, 신뢰
// 바깥 링 (18~26): 성령/초월 — 성장, 분별, 설계

const SLOT = Object.freeze({
  // ─── 안쪽 링: 토라/경계 (보호적 울타리) ───
  STATUS:      0,   // 4상 상태 (Ti/Om/Ta/Eum)
  FORWARD:     1,   // 앞방향 연결
  BACKWARD:    2,   // 뒷방향 연결
  CONTENT:     3,   // 핵심 값/데이터
  TYPE:        4,   // 데이터 유형
  NAME:        5,   // 식별자
  SOURCE:      6,   // 출처/기원
  BOUNDARY:    7,   // 비례적 제한 (넘지 못할 경계, "이에는 이"의 상한선)
  CREATED:     8,   // 생성 시각

  // ─── 중간 링: 복음/관계 (사랑의 우선순위) ───
  SELF_IMPACT:    9,   // 자기 영향도 (나부터)
  FAMILY_IMPACT: 10,   // 가족 영향도
  NEIGHBOR_IMPACT:11,  // 이웃 영향도
  WORLD_IMPACT:  12,   // 세계 영향도
  LOVE_WEIGHT:   13,   // 사랑 가중치 (관계 거리 역수)
  ETHICS_SCORE:  14,   // 윤리 점수 (-13~+13)
  EVIDENCE:      15,   // 근거 수
  TRUST:         16,   // 신뢰도 (-13~+13)
  MODIFIED:      17,   // 변경 시각

  // ─── 바깥 링: 성령/초월 (성장과 분별) ───
  SOPHISTICATION: 18,  // 고도화 지표 (depth)
  MERGE_HISTORY:  19,  // 병합 이력 (breadth)
  SEGMENTATION:   20,  // 세분화 수준 (precision)
  CONSENSUS:      21,  // 합의 수준
  TRANSCEND_TRUST:22,  // 초월 신뢰도 (3계층 통합)
  UNKNOWN_COUNT:  23,  // 미인지 카운터 (Eum 발생 횟수)
  TRANSFER_LOG:   24,  // 이관 이력 (Ta 발생 시)
  DESIGNER_ISSUE: 25,  // 설계자 이슈 (Eum 에스컬레이션)
  DIRECTION:      26,  // 고유 방향 (설계자가 수립)
});

// 링 매핑
const RING = Object.freeze({
  TORAH:     { name: '토라/경계',  slots: [0,1,2,3,4,5,6,7,8],       desc: '보호적 울타리 — 비례적 제한, 헌법적 경계' },
  GOSPEL:    { name: '복음/관계',  slots: [9,10,11,12,13,14,15,16,17], desc: '관계적 윤리 — 나→가족→이웃→세계' },
  SPIRIT:    { name: '성령/초월',  slots: [18,19,20,21,22,23,24,25,26], desc: '초월적 규칙기반 — 고도화·병합·세분화' },
});

// 슬롯 메타데이터
const SLOT_META = [
  { i:0,  ring:'토라', name:'4상상태',     key:'status' },
  { i:1,  ring:'토라', name:'앞방향',      key:'forward' },
  { i:2,  ring:'토라', name:'뒷방향',      key:'backward' },
  { i:3,  ring:'토라', name:'내용',        key:'content' },
  { i:4,  ring:'토라', name:'유형',        key:'type' },
  { i:5,  ring:'토라', name:'이름',        key:'name' },
  { i:6,  ring:'토라', name:'출처',        key:'source' },
  { i:7,  ring:'토라', name:'비례제한',    key:'boundary' },
  { i:8,  ring:'토라', name:'생성시각',    key:'created' },
  { i:9,  ring:'복음', name:'자기영향',    key:'selfImpact' },
  { i:10, ring:'복음', name:'가족영향',    key:'familyImpact' },
  { i:11, ring:'복음', name:'이웃영향',    key:'neighborImpact' },
  { i:12, ring:'복음', name:'세계영향',    key:'worldImpact' },
  { i:13, ring:'복음', name:'사랑가중치',  key:'loveWeight' },
  { i:14, ring:'복음', name:'윤리점수',    key:'ethicsScore' },
  { i:15, ring:'복음', name:'근거수',      key:'evidence' },
  { i:16, ring:'복음', name:'신뢰도',      key:'trust' },
  { i:17, ring:'복음', name:'변경시각',    key:'modified' },
  { i:18, ring:'성령', name:'고도화',      key:'sophistication' },
  { i:19, ring:'성령', name:'병합이력',    key:'mergeHistory' },
  { i:20, ring:'성령', name:'세분화',      key:'segmentation' },
  { i:21, ring:'성령', name:'합의수준',    key:'consensus' },
  { i:22, ring:'성령', name:'초월신뢰',    key:'transcendTrust' },
  { i:23, ring:'성령', name:'미인지횟수',  key:'unknownCount' },
  { i:24, ring:'성령', name:'이관이력',    key:'transferLog' },
  { i:25, ring:'성령', name:'설계자이슈',  key:'designerIssue' },
  { i:26, ring:'성령', name:'고유방향',    key:'direction' },
];

// ═══ 4상 작동 원칙 ═══

const PROTOCOL = Object.freeze({
  TI:  { value: 1,  action: 'EXECUTE',   desc: '아는 것 → 즉시 작동' },
  OM:  { value: 0,  action: 'HALT_LEARN', desc: '모르는 것 → 중단 → 학습 → 재작동' },
  TA:  { value:-1,  action: 'TRANSFER',   desc: '잘못 아는 것 → 자동 이관' },
  EUM: { value:-2,  action: 'ESCALATE',   desc: '미인지 → 설계자 이슈 업로드' },
});

// ═══ 언약적 의사결정 엔진 ═══

class CovenantEngine {
  constructor() {
    this.decisions = [];
    this.principles = new Map();  // 확정된 원칙 (Ti 축적)
    this.transfers = [];          // 이관 이력
    this.designerIssues = [];     // 설계자 이슈
    this.growthLevel = 3;         // 현재 성장 단위 (3→9→27...)
    this.cycleCount = 0;
  }

  // ─── 핵심: 의사결정 실행 ───
  decide(event, context = {}) {
    const now = Date.now();
    const decision = {
      id: this.decisions.length + 1,
      event,
      context,
      timestamp: now,
      phase: null,
      action: null,
      result: null,
      layers: { torah: null, gospel: null, spirit: null },
    };

    // Layer 1: 토라 검사 — 경계 위반 여부
    const torahResult = this._checkTorah(event, context);
    decision.layers.torah = torahResult;

    if (torahResult.violated) {
      // 경계 위반 → 즉시 차단 (비례적 제한)
      decision.phase = PROTOCOL.TI;
      decision.action = 'BOUNDARY_BLOCK';
      decision.result = { blocked: true, reason: torahResult.reason, boundary: torahResult.boundary };
      this.decisions.push(decision);
      return decision;
    }

    // Layer 2: 복음 검사 — 관계적 영향 평가
    const gospelResult = this._checkGospel(event, context);
    decision.layers.gospel = gospelResult;

    // Layer 3: 성령 검사 — 4상 판단
    const spiritResult = this._checkSpirit(event, context, torahResult, gospelResult);
    decision.layers.spirit = spiritResult;
    decision.phase = spiritResult.protocol;

    // 4상 분기 실행
    switch (spiritResult.protocol.value) {
      case 1: // Ti — 즉시 작동
        decision.action = 'EXECUTE';
        decision.result = this._execute(event, context, gospelResult);
        // 원칙으로 축적
        this._accumulate(event, decision);
        break;

      case 0: // Om — 중단 → 학습 → 재작동
        decision.action = 'HALT_LEARN';
        decision.result = {
          halted: true,
          learningRequired: spiritResult.gaps,
          suggestion: '학습 후 재제출하세요',
        };
        break;

      case -1: // Ta — 자동 이관
        decision.action = 'TRANSFER';
        decision.result = {
          transferred: true,
          reason: '현재 에이전트의 인식 오류 가능성',
          transferTo: spiritResult.transferTarget || 'NEXT_AGENT',
        };
        this.transfers.push({ decision: decision.id, event, timestamp: now });
        break;

      case -2: // Eum — 설계자 이슈
        decision.action = 'ESCALATE';
        decision.result = {
          escalated: true,
          reason: '판단 기준 부재 — 설계자 방향 수립 필요',
          designerNote: spiritResult.designerNote || event,
        };
        this.designerIssues.push({ decision: decision.id, event, timestamp: now, note: spiritResult.designerNote });
        break;
    }

    this.decisions.push(decision);

    // 성장 체크 (3진법적 배수)
    this._checkGrowth();

    return decision;
  }

  // ─── Layer 1: 토라/경계 검사 ───
  _checkTorah(event, context) {
    const boundaries = this._getBoundaries(event.domain || 'general');
    const result = { violated: false, reason: null, boundary: null, score: 0 };

    for (const b of boundaries) {
      if (b.check(event, context)) {
        result.violated = true;
        result.reason = b.reason;
        result.boundary = b.name;
        return result;
      }
    }

    // 비례성 점수 (0~13): 행동의 크기가 원인에 비례하는가
    result.score = this._proportionalityScore(event, context);
    return result;
  }

  _getBoundaries(domain) {
    // 헌법적 경계 — 어떤 상황에서도 넘지 못하는 선
    return [
      {
        name: '생명보호',
        reason: '생명에 위험을 초래하는 결정',
        check: (e) => e.tags?.includes('life-threatening') || false,
      },
      {
        name: '비례적제한',
        reason: '행동이 원인에 비례하지 않음 (과잉 대응)',
        check: (e, ctx) => (ctx.responseScale || 0) > (ctx.causeScale || 0) * 3,
      },
      {
        name: '진실성',
        reason: '거짓 정보 기반 결정',
        check: (e) => e.tags?.includes('unverified-source') && e.confidence === 0,
      },
      {
        name: '권한경계',
        reason: '권한 범위 초과',
        check: (e, ctx) => ctx.requiredAuth > (ctx.currentAuth || 0),
      },
    ];
  }

  _proportionalityScore(event, context) {
    // "이에는 이" — 비례성 검사
    const cause = context.causeScale || 1;
    const response = context.responseScale || 1;
    const ratio = response / cause;
    if (ratio <= 1) return 13;      // 비례 이하 = 최고 점수
    if (ratio <= 2) return 8;       // 약간 초과
    if (ratio <= 3) return 3;       // 경계선
    return 0;                        // 비례 초과
  }

  // ─── Layer 2: 복음/관계 검사 ───
  _checkGospel(event, context) {
    // "나부터 → 가족 → 이웃 → 세계" 영향 평가
    const impacts = {
      self:     event.impact?.self     ?? 0,
      family:   event.impact?.family   ?? 0,
      neighbor: event.impact?.neighbor ?? 0,
      world:    event.impact?.world    ?? 0,
    };

    // 사랑 가중치: 가까울수록 높은 가중치
    const weights = { self: 1.0, family: 0.8, neighbor: 0.5, world: 0.3 };

    const weightedScore =
      impacts.self * weights.self +
      impacts.family * weights.family +
      impacts.neighbor * weights.neighbor +
      impacts.world * weights.world;

    // 윤리 점수: 자기 희생이 타인 이익보다 클 때 가장 높음
    const sacrifice = Math.max(0, -impacts.self);
    const benefit = Math.max(0, impacts.family + impacts.neighbor + impacts.world);
    const ethicsScore = benefit > 0 && sacrifice > 0
      ? Math.min(13, Math.round((sacrifice + benefit) * 2))
      : Math.round(weightedScore);

    return {
      impacts,
      weightedScore: +weightedScore.toFixed(2),
      ethicsScore: Math.max(-13, Math.min(13, ethicsScore)),
      priority: impacts.self !== 0 ? 'self'
        : impacts.family !== 0 ? 'family'
        : impacts.neighbor !== 0 ? 'neighbor' : 'world',
    };
  }

  // ─── Layer 3: 성령/초월 검사 — 4상 판단 ───
  _checkSpirit(event, context, torah, gospel) {
    const result = { protocol: null, gaps: [], transferTarget: null, designerNote: null };

    // 원칙 DB에서 유사 선례 검색
    const precedent = this._findPrecedent(event);

    if (precedent && precedent.confidence >= 3) {
      // Ti: 선례 충분 → 즉시 작동
      result.protocol = PROTOCOL.TI;
      return result;
    }

    if (precedent && precedent.confidence > 0 && precedent.confidence < 3) {
      // Om: 선례 있으나 약함 → 학습 필요
      result.protocol = PROTOCOL.OM;
      result.gaps = precedent.gaps || ['추가 근거 필요 (confidence ' + precedent.confidence + '/3)'];
      return result;
    }

    // 모순 감지: 기존 원칙과 충돌하는가?
    const contradiction = this._detectContradiction(event);
    if (contradiction) {
      // Ta: 잘못 알 수 있음 → 이관
      result.protocol = PROTOCOL.TA;
      result.transferTarget = contradiction.suggestedAgent || 'REVIEW_BOARD';
      return result;
    }

    // 선례 없음: event.type이 있으면 Om(학습 가능), 없으면 Eum(미인지)
    if (!precedent) {
      if (event.type || event.category) {
        // 유형은 있으나 선례 없음 → Om: 첫 시도는 학습으로 처리
        // 즉시 원칙 초기화 (confidence=1)하여 다음 호출 시 Ti 가능
        this._accumulate(event, { id: 0 });
        result.protocol = PROTOCOL.OM;
        result.gaps = ['첫 사건 — 원칙 초기화 후 재제출 시 작동'];
        return result;
      }
      // 유형조차 없으면 Eum
      result.protocol = PROTOCOL.EUM;
      result.designerNote = `분류 불가 사건: ${event.description || JSON.stringify(event).slice(0, 100)}`;
      return result;
    }

    // 기본: Om
    result.protocol = PROTOCOL.OM;
    result.gaps = ['선례 신뢰도 불충분'];
    return result;
  }

  // ─── 실행 ───
  _execute(event, context, gospel) {
    return {
      executed: true,
      ethicsScore: gospel.ethicsScore,
      priority: gospel.priority,
      weightedScore: gospel.weightedScore,
    };
  }

  // ─── 원칙 축적 ───
  _accumulate(event, decision) {
    const key = event.type || event.category || 'general';
    const existing = this.principles.get(key);
    if (existing) {
      existing.confidence = Math.min(13, existing.confidence + 1);
      existing.count++;
      existing.lastUsed = Date.now();
      existing.decisions.push(decision.id);
    } else {
      this.principles.set(key, {
        key,
        confidence: 3,
        count: 1,
        firstCreated: Date.now(),
        lastUsed: Date.now(),
        decisions: [decision.id],
        gaps: [],
      });
    }
  }

  // ─── 선례 검색 ───
  _findPrecedent(event) {
    const key = event.type || event.category || 'general';
    return this.principles.get(key) || null;
  }

  // ─── 모순 감지 ───
  _detectContradiction(event) {
    // 기존 원칙 중 이 사건과 충돌하는 것이 있는지
    for (const [key, principle] of this.principles) {
      if (event.contradicts?.includes(key)) {
        return { principle: key, suggestedAgent: 'CONTRADICTION_RESOLVER' };
      }
    }
    return null;
  }

  // ─── 3진법적 성장 ───
  _checkGrowth() {
    this.cycleCount++;
    const tiCount = this.decisions.filter(d => d.phase?.value === 1).length;

    // 3의 거듭제곱 도달 시 성장
    if (tiCount > 0 && tiCount % this.growthLevel === 0 && tiCount >= this.growthLevel) {
      const prevLevel = this.growthLevel;
      this.growthLevel = Math.min(this.growthLevel * 3, 729);

      // 세분화: 하위 카테고리 자동 생성
      // 병합: 유사 원칙 통합
      // 고도화: 신뢰도 상향

      return {
        grown: true,
        from: prevLevel,
        to: this.growthLevel,
        principleCount: this.principles.size,
        tiCount,
      };
    }
    return null;
  }

  // ═══ 조회 ═══

  getDecision(id) { return this.decisions.find(d => d.id === id); }
  getDecisions(limit = 50) { return this.decisions.slice(-limit); }
  getPrinciples() { return Array.from(this.principles.entries()).map(([k, v]) => ({ key: k, ...v })); }
  getTransfers() { return this.transfers; }
  getDesignerIssues() { return this.designerIssues; }

  stats() {
    const d = this.decisions;
    return {
      totalDecisions: d.length,
      ti: d.filter(x => x.phase?.value === 1).length,
      om: d.filter(x => x.phase?.value === 0).length,
      ta: d.filter(x => x.phase?.value === -1).length,
      eum: d.filter(x => x.phase?.value === -2).length,
      boundaryBlocks: d.filter(x => x.action === 'BOUNDARY_BLOCK').length,
      principles: this.principles.size,
      transfers: this.transfers.length,
      designerIssues: this.designerIssues.length,
      growthLevel: this.growthLevel,
      cycleCount: this.cycleCount,
    };
  }
}

module.exports = { SLOT, SLOT_META, RING, PROTOCOL, CovenantEngine };
