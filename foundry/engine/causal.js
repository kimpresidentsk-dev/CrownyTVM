// ═══════════════════════════════════════════════════════════════
// CrownyCore — 인과추론 엔진 (Causal Inference Engine)
//
// 27방사형 셀 v2: 관계에도 4상 인식상태 적용
//
// 관계 타입:
//   CAUSAL   (+1) — A→B 인과: 시간선행 + 개입효과 확인
//   CORRELATE (0) — A~B 상관: 동시발생 관찰, 인과 미확인
//   SPURIOUS (-1) — A⊘B 허위: 교란변수 발견, 반박됨
//   UNKNOWN  (-2) — A?B 미인지: 연결 존재하나 성격 미파악
//
// 자율 승격 프로세스 (과학적 방법론):
//   1. 동시발생 감지 → UNKNOWN 관계 자동 생성
//   2. 시간선행 검사 → CORRELATE로 승격
//   3. 개입효과 검사 → CAUSAL로 승격
//   4. 교란변수 감지 → SPURIOUS로 강등
// ═══════════════════════════════════════════════════════════════

'use strict';

// 관계 4상
const REL = Object.freeze({
  CAUSAL:    1,   // 인과 확정
  CORRELATE: 0,   // 상관 (미확인)
  SPURIOUS: -1,   // 허위상관 (반박)
  UNKNOWN:  -2,   // 미인지
});

const REL_NAME = Object.freeze({
  [REL.CAUSAL]:   '인과',
  [REL.CORRELATE]:'상관',
  [REL.SPURIOUS]: '허위',
  [REL.UNKNOWN]:  '미인지',
});

const REL_SYMBOL = Object.freeze({
  [REL.CAUSAL]:   '→',
  [REL.CORRELATE]:'~',
  [REL.SPURIOUS]: '⊘',
  [REL.UNKNOWN]:  '?',
});

// ═══ 관계 구조 ═══
// edge = { source, target, type, confidence, evidence, temporal, intervention, confounders, createdAt, updatedAt }

function createEdge(sourceId, targetId, type = REL.UNKNOWN) {
  return {
    source: sourceId,
    target: targetId,
    type,
    confidence: 0,        // -13 ~ +13 (균형3진 신뢰도)
    evidence: 0,           // 근거 수
    temporal: 0,           // 시간선행 점수: +1=A선행, 0=동시, -1=B선행
    intervention: 0,       // 개입효과: +1=A변경→B변경, 0=미검사, -1=A변경→B불변
    confounders: [],       // 교란변수 셀 ID 목록
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══ 인과추론 엔진 ═══

class CausalEngine {
  constructor(memory) {
    this.memory = memory;
    this.edges = new Map();  // 'sourceId-targetId' → edge
  }

  _key(a, b) { return `${a}-${b}`; }

  // ─── 1. 관계 등록 (수동 또는 자동) ───
  addRelation(sourceId, targetId, type = REL.UNKNOWN) {
    const key = this._key(sourceId, targetId);
    if (this.edges.has(key)) return this.edges.get(key);
    const edge = createEdge(sourceId, targetId, type);
    this.edges.set(key, edge);
    return edge;
  }

  // ─── 2. 동시발생 감지 → UNKNOWN 자동 생성 ───
  detectCooccurrence(cellIds, windowMs = 60000) {
    const cells = cellIds
      .map(id => this.memory.getCell(id))
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);

    const newEdges = [];
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dt = Math.abs(cells[i].createdAt - cells[j].createdAt);
        if (dt <= windowMs) {
          const key = this._key(cells[i].id, cells[j].id);
          if (!this.edges.has(key)) {
            const edge = this.addRelation(cells[i].id, cells[j].id, REL.UNKNOWN);
            edge.evidence = 1;
            newEdges.push(edge);
          }
        }
      }
    }
    return newEdges;
  }

  // ─── 3. 시간선행 검사 → CORRELATE 승격 ───
  checkTemporalPrecedence(sourceId, targetId) {
    const edge = this.edges.get(this._key(sourceId, targetId));
    if (!edge) return null;

    const src = this.memory.getCell(sourceId);
    const tgt = this.memory.getCell(targetId);
    if (!src || !tgt) return null;

    // 시간선행 판정
    if (src.createdAt < tgt.createdAt) {
      edge.temporal = 1;  // source가 먼저
    } else if (src.createdAt > tgt.createdAt) {
      edge.temporal = -1; // target이 먼저 (역방향)
    } else {
      edge.temporal = 0;  // 동시
    }

    // 시간선행 확인되면 CORRELATE로 승격
    if (edge.temporal !== 0 && edge.type === REL.UNKNOWN) {
      edge.type = REL.CORRELATE;
      edge.evidence++;
      edge.confidence = Math.min(edge.confidence + 3, 13);
    }

    edge.updatedAt = Date.now();
    return edge;
  }

  // ─── 4. 개입효과 검사 → CAUSAL 승격 ───
  // interventionResult: source 값 변경 후 target이 변했는지
  checkIntervention(sourceId, targetId, targetChanged) {
    const edge = this.edges.get(this._key(sourceId, targetId));
    if (!edge) return null;

    if (targetChanged) {
      edge.intervention = 1;  // A 변경 → B 변경 (인과 증거)
      edge.evidence++;
      edge.confidence = Math.min(edge.confidence + 5, 13);

      // 충분한 증거 → CAUSAL 승격
      if (edge.evidence >= 3 && edge.temporal === 1) {
        edge.type = REL.CAUSAL;
        edge.confidence = 13;
      }
    } else {
      edge.intervention = -1; // A 변경 → B 불변 (인과 반증)
      edge.confidence = Math.max(edge.confidence - 3, -13);
    }

    edge.updatedAt = Date.now();
    return edge;
  }

  // ─── 5. 교란변수 감지 → SPURIOUS 강등 ───
  detectConfounder(sourceId, targetId, confounderId) {
    const edge = this.edges.get(this._key(sourceId, targetId));
    if (!edge) return null;

    // 교란변수 C가 A와 B 모두에 영향을 미치는지 확인
    const confEdgeA = this.edges.get(this._key(confounderId, sourceId));
    const confEdgeB = this.edges.get(this._key(confounderId, targetId));

    if (confEdgeA && confEdgeB) {
      edge.confounders.push(confounderId);
      edge.type = REL.SPURIOUS;
      edge.confidence = -13;
      edge.evidence++;
      edge.updatedAt = Date.now();
    }

    return edge;
  }

  // ─── 6. 자율 추론 실행 (전체 엣지 대상) ───
  autoInfer() {
    const results = { promoted: 0, demoted: 0, unchanged: 0 };

    for (const [key, edge] of this.edges) {
      const prevType = edge.type;

      // UNKNOWN → 시간선행 검사
      if (edge.type === REL.UNKNOWN) {
        this.checkTemporalPrecedence(edge.source, edge.target);
      }

      // CORRELATE → 개입효과가 있으면 CAUSAL로
      if (edge.type === REL.CORRELATE && edge.intervention === 1 && edge.temporal === 1 && edge.evidence >= 3) {
        edge.type = REL.CAUSAL;
        edge.confidence = 13;
      }

      // 교란변수가 있으면 SPURIOUS로
      if (edge.confounders.length > 0 && edge.type !== REL.SPURIOUS) {
        edge.type = REL.SPURIOUS;
        edge.confidence = -13;
      }

      // 결과 집계
      if (edge.type > prevType) results.promoted++;
      else if (edge.type < prevType) results.demoted++;
      else results.unchanged++;
    }

    return results;
  }

  // ─── 조회 ───

  getEdge(sourceId, targetId) {
    return this.edges.get(this._key(sourceId, targetId)) || null;
  }

  getEdgesFrom(sourceId) {
    const result = [];
    for (const [, edge] of this.edges) {
      if (edge.source === sourceId) result.push(edge);
    }
    return result;
  }

  getEdgesTo(targetId) {
    const result = [];
    for (const [, edge] of this.edges) {
      if (edge.target === targetId) result.push(edge);
    }
    return result;
  }

  getAllEdges() {
    return Array.from(this.edges.values());
  }

  getByType(type) {
    return Array.from(this.edges.values()).filter(e => e.type === type);
  }

  stats() {
    const all = Array.from(this.edges.values());
    return {
      total: all.length,
      causal: all.filter(e => e.type === REL.CAUSAL).length,
      correlate: all.filter(e => e.type === REL.CORRELATE).length,
      spurious: all.filter(e => e.type === REL.SPURIOUS).length,
      unknown: all.filter(e => e.type === REL.UNKNOWN).length,
    };
  }

  // ─── 직렬화 ───
  toJSON() { return Array.from(this.edges.values()); }
  fromJSON(arr) {
    this.edges.clear();
    for (const e of arr) this.edges.set(this._key(e.source, e.target), e);
  }
}

module.exports = { REL, REL_NAME, REL_SYMBOL, CausalEngine, createEdge };
