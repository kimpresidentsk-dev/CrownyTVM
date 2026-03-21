// ═══════════════════════════════════════════════════════════════
// CrownyCore — 전술/전략 의사결정 엔진
//
// 팔란티어 고담이 구조적으로 못 하는 5가지:
//   1. ACH (Analysis of Competing Hypotheses) — 가설 자동 경쟁
//   2. DFI (Decision Fragility Index) — 결정 취약도
//   3. Red Team (적 의사결정 모델링)
//   4. Wargame (인식론적 워게임)
//   5. MDMP Pipeline (7단계 인식론 게이트)
//
// 핵심 우위: 모든 데이터에 인식상태(Ti/Om/Ta/Eum)가 내장되어
//           연산 수준에서 불확실성을 처리. 고담은 이것이 불가능.
// ═══════════════════════════════════════════════════════════════

'use strict';

// ═══ 1. ACH — 경쟁 가설 분석 ═══
// Richards Heuer 방법론: 가장 많은 반증 증거를 가진 가설을 제거
// → 남은 가설이 가장 가능성 높은 것

class ACHEngine {
  constructor() {
    this.hypotheses = [];  // { id, name, desc, status }
    this.evidence = [];     // { id, name, source, reliability }
    this.matrix = new Map(); // 'h-e' → score (-13 ~ +13)
    this.nextId = 1;
  }

  // 가설 추가
  addHypothesis(name, desc) {
    const h = { id: this.nextId++, name, desc, status: 0 }; // 0=Om(미확인)
    this.hypotheses.push(h);
    return h;
  }

  // 증거 추가
  addEvidence(name, source, reliability) {
    // reliability: -13 ~ +13 (출처 신뢰도)
    const e = { id: this.nextId++, name, source, reliability: reliability ?? 5 };
    this.evidence.push(e);
    return e;
  }

  // 가설-증거 관계 설정
  // score: +13(강하게 일치) ~ -13(강하게 반박), 0(관련없음)
  score(hypothesisId, evidenceId, score) {
    this.matrix.set(`${hypothesisId}-${evidenceId}`, score);
  }

  // ACH 평가 — Heuer 방법론
  // 핵심: 가장 많은 반증이 있는 가설을 제거, 가장 적은 반증이 남은 가설이 승리
  evaluate() {
    const results = this.hypotheses.map(h => {
      let consistent = 0;      // 일치 증거 수
      let inconsistent = 0;    // 반박 증거 수
      let weightedIncon = 0;   // 가중 반박 점수
      let weightedCon = 0;     // 가중 일치 점수
      let diagnosticPower = 0;

      this.evidence.forEach(e => {
        const s = this.matrix.get(`${h.id}-${e.id}`) ?? 0;
        const weight = Math.abs(e.reliability) / 13;

        if (s > 0) { consistent++; weightedCon += s * weight; }
        if (s < 0) { inconsistent++; weightedIncon += Math.abs(s) * weight; }
      });

      // ACH 점수: 반박이 적을수록 높음 (Heuer의 핵심 통찰)
      const achScore = 13 - Math.min(13, Math.round(weightedIncon));

      // 진단력: 가설을 구분하는 증거가 많을수록 높음
      diagnosticPower = consistent + inconsistent;

      return {
        hypothesis: h,
        achScore,
        consistent,
        inconsistent,
        weightedInconsistency: +weightedIncon.toFixed(2),
        weightedConsistency: +weightedCon.toFixed(2),
        diagnosticPower,
        // 4상 판정
        epistemic: achScore >= 10 ? 1 : achScore >= 5 ? 0 : achScore >= 0 ? -1 : -2,
      };
    });

    // 점수순 정렬 (높을수록 가능성 높음)
    results.sort((a, b) => b.achScore - a.achScore);
    return results;
  }

  // 새 증거가 순위를 바꾸는지 감지
  detectShift(newEvidenceId) {
    const before = this.evaluate();
    // 새 증거의 영향 계산
    const shifts = [];
    for (const h of this.hypotheses) {
      const s = this.matrix.get(`${h.id}-${newEvidenceId}`) ?? 0;
      if (Math.abs(s) >= 5) {
        shifts.push({ hypothesis: h.name, impact: s > 0 ? '일치(강화)' : '반박(약화)', score: s });
      }
    }
    return { newRanking: before.map(r => r.hypothesis.name), shifts };
  }

  getMatrix() {
    const rows = [];
    for (const h of this.hypotheses) {
      const row = { hypothesis: h.name, scores: {} };
      for (const e of this.evidence) {
        row.scores[e.name] = this.matrix.get(`${h.id}-${e.id}`) ?? 0;
      }
      rows.push(row);
    }
    return { hypotheses: this.hypotheses, evidence: this.evidence, matrix: rows };
  }
}

// ═══ 2. DFI — 결정 취약도 지수 ═══

class DFICalculator {
  // 결정에 영향을 준 가정 셀들의 인식상태를 하나씩 뒤집어보며
  // 결정이 바뀌는 최소 뒤집기 수 = DFI
  static compute(covenantEngine, decisionEvent, assumptions) {
    // assumptions: [{ cellId, currentEpistemic, value }]
    const original = covenantEngine.decide(decisionEvent, {});
    const originalAction = original.action;

    let minFlips = assumptions.length; // 최악의 경우 전부 뒤집어야
    const criticalAssumptions = [];

    // 단일 뒤집기 검사
    for (const a of assumptions) {
      // 가정을 Ta(잘못 아는 것)로 뒤집기
      const modified = { ...decisionEvent, contradicts: [a.cellId.toString()] };
      const flipped = covenantEngine.decide(modified, {});

      if (flipped.action !== originalAction) {
        criticalAssumptions.push({
          cellId: a.cellId,
          description: a.description || `가정 #${a.cellId}`,
          flippedAction: flipped.action,
          impact: '단일 뒤집기로 결정 변경',
        });
        if (1 < minFlips) minFlips = 1;
      }
    }

    // DFI = 13 - (13/전체가정수 * 위험가정수)
    const dfi = Math.max(0, Math.min(13,
      Math.round(13 * (1 - criticalAssumptions.length / Math.max(1, assumptions.length)))
    ));

    return {
      dfi,
      dfiLabel: dfi >= 10 ? '견고' : dfi >= 7 ? '보통' : dfi >= 3 ? '취약' : '극히 취약',
      totalAssumptions: assumptions.length,
      criticalCount: criticalAssumptions.length,
      criticalAssumptions,
      originalAction,
    };
  }
}

// ═══ 3. Red Team — 적 의사결정 모델링 ═══

class RedTeamEngine {
  constructor(CovenantEngineClass) {
    // 별도 CovenantEngine 인스턴스 (적의 시점)
    this.enemyEngine = new CovenantEngineClass();
    this.estimatedKnowledge = []; // 적이 알고 있다고 추정하는 정보
    this.deceptionOps = [];       // 기만 기회
  }

  // 적의 추정 지식 설정
  setEstimatedKnowledge(items) {
    // items: [{ fact, epistemic, description }]
    // epistemic: 1=적이 확실히 앎, 0=적이 불확실, -1=적이 잘못 앎, -2=적이 모름
    this.estimatedKnowledge = items;
  }

  // 적 시점에서 의사결정 예측
  predictEnemyCOA(situation) {
    const event = {
      ...situation,
      type: situation.type || 'enemy_decision',
      description: situation.description || '적 상황 판단',
    };

    // 적이 잘못 알고 있는 것(Ta)을 context에 반영
    const wrongAssumptions = this.estimatedKnowledge.filter(k => k.epistemic === -1);
    if (wrongAssumptions.length > 0) {
      event.contradicts = wrongAssumptions.map(w => w.fact);
    }

    const decision = this.enemyEngine.decide(event, {});

    return {
      predictedAction: decision.action,
      enemyEpistemicState: {
        known: this.estimatedKnowledge.filter(k => k.epistemic === 1).length,
        uncertain: this.estimatedKnowledge.filter(k => k.epistemic === 0).length,
        wrong: this.estimatedKnowledge.filter(k => k.epistemic === -1).length,
        unaware: this.estimatedKnowledge.filter(k => k.epistemic === -2).length,
      },
      decision,
    };
  }

  // 기만 기회 탐색 — 적이 Ta(잘못 아는 것)인 항목 활용
  findDeceptionOpportunities() {
    this.deceptionOps = this.estimatedKnowledge
      .filter(k => k.epistemic === -1)
      .map(k => ({
        fact: k.fact,
        description: k.description,
        opportunity: `적은 "${k.description}"을 잘못 알고 있음 → 이를 유지/강화하면 적 판단 오류 유도 가능`,
      }));
    return this.deceptionOps;
  }

  // 적의 Eum(미인지) 항목 — 우리가 알지만 적이 모르는 것
  findInformationAdvantage() {
    return this.estimatedKnowledge
      .filter(k => k.epistemic === -2)
      .map(k => ({
        fact: k.fact,
        description: k.description,
        advantage: `적이 "${k.description}"의 존재 자체를 모름 → 기습/역습 기회`,
      }));
  }
}

// ═══ 4. 워게임 엔진 (인식론적) ═══

class WargameEngine {
  constructor(ach, dfi, redTeam) {
    this.ach = ach;
    this.dfi = dfi;
    this.redTeam = redTeam;
    this.results = [];
  }

  // COA 평가 — 가정 민감도 포함
  evaluateCOA(coa) {
    // coa: { name, description, assumptions, criteria, enemySituation }
    const result = {
      coaName: coa.name,
      description: coa.description,
      scores: {},
      totalScore: 0,
      dfi: null,
      enemyResponse: null,
      achAlignment: null,
    };

    // 기준별 점수 (가중 평균)
    let weightSum = 0;
    let scoreSum = 0;
    for (const criterion of (coa.criteria || [])) {
      // criterion: { name, weight, score, epistemic }
      const w = criterion.weight || 1;
      const s = criterion.score || 0;
      const epistemicMultiplier = criterion.epistemic === 1 ? 1.0 :
                                   criterion.epistemic === 0 ? 0.5 :
                                   criterion.epistemic === -1 ? 0.1 : 0.0;
      const adjusted = s * epistemicMultiplier;
      result.scores[criterion.name] = { raw: s, adjusted: +adjusted.toFixed(2), weight: w, epistemic: criterion.epistemic };
      scoreSum += adjusted * w;
      weightSum += w;
    }
    result.totalScore = weightSum > 0 ? +(scoreSum / weightSum).toFixed(2) : 0;

    // DFI 계산
    if (coa.assumptions) {
      // 간이 DFI: 가정 중 Ti가 아닌 것의 비율
      const tiCount = coa.assumptions.filter(a => a.epistemic === 1).length;
      result.dfi = Math.round(13 * tiCount / Math.max(1, coa.assumptions.length));
      result.dfiLabel = result.dfi >= 10 ? '견고' : result.dfi >= 7 ? '보통' : result.dfi >= 3 ? '취약' : '극히 취약';
      result.assumptions = coa.assumptions;
    }

    // 적 대응 예측
    if (coa.enemySituation && this.redTeam) {
      result.enemyResponse = this.redTeam.predictEnemyCOA(coa.enemySituation);
    }

    this.results.push(result);
    return result;
  }

  // COA 비교 매트릭스
  compare() {
    if (this.results.length === 0) return { winner: null, results: [] };

    const sorted = [...this.results].sort((a, b) => {
      // 1차: 점수, 2차: DFI (높을수록 좋음)
      const scoreDiff = b.totalScore - a.totalScore;
      if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
      return (b.dfi || 0) - (a.dfi || 0);
    });

    return {
      winner: sorted[0],
      ranking: sorted.map((r, i) => ({
        rank: i + 1,
        coa: r.coaName,
        score: r.totalScore,
        dfi: r.dfi,
        dfiLabel: r.dfiLabel,
      })),
      results: sorted,
    };
  }

  reset() { this.results = []; }
}

// ═══ 5. MDMP 파이프라인 (7단계 인식론 게이트) ═══

class MDMPPipeline {
  constructor() {
    this.phases = [
      { id: 1, name: '임무 수령',   gate: { minTi: 1, minEvidence: 0, desc: '상급부대 의도 확인' } },
      { id: 2, name: '임무 분석',   gate: { minTi: 3, minEvidence: 2, desc: '적 상황, 지형, 시간, 부대 분석' } },
      { id: 3, name: 'COA 개발',   gate: { minTi: 5, minEvidence: 3, desc: '지형/기상/전투력 비율 확정' } },
      { id: 4, name: 'COA 분석',   gate: { minTi: 5, minEvidence: 3, desc: '워게임 완료, DFI ≥ 3' } },
      { id: 5, name: 'COA 비교',   gate: { minTi: 5, minEvidence: 3, desc: '비교 매트릭스 완성' } },
      { id: 6, name: 'COA 승인',   gate: { minTi: 7, minEvidence: 5, desc: '사령관 결심' } },
      { id: 7, name: '명령 하달',   gate: { minTi: 7, minEvidence: 5, desc: 'OPORD 발행' } },
    ];
    this.currentPhase = 1;
    this.cells = {};       // phaseId → [cellIds]
    this.overrides = [];   // 사령관 오버라이드 기록
  }

  // 단계에 셀 추가
  addCell(phaseId, cell) {
    if (!this.cells[phaseId]) this.cells[phaseId] = [];
    this.cells[phaseId].push(cell);
  }

  // 게이트 통과 여부 확인
  canAdvance(phaseId) {
    const phase = this.phases.find(p => p.id === phaseId);
    if (!phase) return { pass: false, reason: '단계 없음' };

    const cells = this.cells[phaseId] || [];
    const tiCount = cells.filter(c => (c.status || c.epistemic) === 1 || c.status === 2).length;
    const evidenceTotal = cells.reduce((s, c) => s + (c.evidence || 0), 0);

    const pass = tiCount >= phase.gate.minTi && evidenceTotal >= phase.gate.minEvidence;
    const gaps = [];

    if (tiCount < phase.gate.minTi) {
      gaps.push(`확정(Ti) 셀 ${tiCount}/${phase.gate.minTi} — ${phase.gate.minTi - tiCount}개 추가 확인 필요`);
    }
    if (evidenceTotal < phase.gate.minEvidence) {
      gaps.push(`근거 ${evidenceTotal}/${phase.gate.minEvidence} — ${phase.gate.minEvidence - evidenceTotal}건 추가 수집 필요`);
    }

    return {
      phase: phase.name,
      phaseId,
      pass,
      tiCount,
      evidenceTotal,
      required: phase.gate,
      gaps,
    };
  }

  // 다음 단계 진행
  advance() {
    const check = this.canAdvance(this.currentPhase);
    if (!check.pass) return { advanced: false, ...check };
    this.currentPhase = Math.min(this.currentPhase + 1, 7);
    return { advanced: true, newPhase: this.currentPhase, phaseName: this.phases[this.currentPhase - 1]?.name };
  }

  // 사령관 오버라이드 (게이트 미통과 시 강제 진행)
  forceAdvance(commanderName, reason) {
    const check = this.canAdvance(this.currentPhase);
    this.overrides.push({
      phase: this.currentPhase,
      phaseName: this.phases[this.currentPhase - 1]?.name,
      commander: commanderName,
      reason,
      gaps: check.gaps,
      timestamp: Date.now(),
    });
    this.currentPhase = Math.min(this.currentPhase + 1, 7);
    return { advanced: true, override: true, newPhase: this.currentPhase, gaps: check.gaps };
  }

  // 현재 상태
  getStatus() {
    return {
      currentPhase: this.currentPhase,
      currentPhaseName: this.phases[this.currentPhase - 1]?.name,
      totalPhases: 7,
      progress: Math.round((this.currentPhase - 1) / 7 * 100),
      phases: this.phases.map(p => ({
        ...p,
        status: p.id < this.currentPhase ? 'completed' :
                p.id === this.currentPhase ? 'current' : 'pending',
        cells: (this.cells[p.id] || []).length,
        gateCheck: this.canAdvance(p.id),
      })),
      overrides: this.overrides,
    };
  }
}

module.exports = {
  ACHEngine,
  DFICalculator,
  RedTeamEngine,
  WargameEngine,
  MDMPPipeline,
};
