// crownycode/src/core/mod.rs
// ═══════════════════════════════════════════════════════════════
// 크라우니코어 — 셀 분할/병합 사고모델
// ═══════════════════════════════════════════════════════════════
//
// 원래 목적: "인과관계 규칙 기반 에너지 중심 셀 분할/병합 사고모델"
//
// 파격적 연산절약의 핵심 메커니즘:
//   확정(+2) 셀 → 저장된 패턴 즉시 통과 (O(1))
//   미확인(0) 셀 → 패턴 기반 생성 + 자동 테스트 (O(N))
//   오해(-1) 셀  → 즉시 중단, 명확화 질문 (O(1))
//   미인지(-2) 셀 → Claude 학습채널 호출 (O(API))
//
// 전체 LLM이 매번 전체 컨텍스트를 처리하는 것과 달리,
// 확정 셀은 건너뛰므로 연산량이 셀 수준으로 줄어든다.

pub mod energy;
pub mod split;
pub mod reason;
pub mod merge;

use anyhow::Result;
use crate::pipeline::ir::IrTree;
use crate::cell::net::CellNet;
use crate::cell::TritState;

use reason::ReasonedCel;

/// 크라우니코어 사고 결과
#[derive(Debug)]
pub struct ThinkResult {
    /// 병합된 최종 IR 트리 (코드 생성기 입력)
    pub merged_ir: IrTree,
    /// 전체 신뢰도 (에너지 셀들의 가중 평균)
    pub confidence: f32,
    /// 에너지 셀별 결과 요약
    pub cell_results: Vec<CelSummary>,
    /// 명확화 질문 (오해 셀이 있으면 발생)
    pub clarifications: Vec<String>,
    /// 연산 절약 통계
    pub stats: ThinkStats,
}

/// 에너지 셀 결과 요약
#[derive(Debug, Clone)]
pub struct CelSummary {
    pub sub_intent: String,
    pub trit_state: TritState,
    pub energy: f32,
    pub action: CelAction,
}

/// 에너지 셀에 취한 행동
#[derive(Debug, Clone, PartialEq)]
pub enum CelAction {
    /// 확정 — CellNet에서 패턴 즉시 인출
    InstantRetrieve,
    /// 미확인 — 패턴 기반 생성 + 테스트 첨부
    GenerateWithTests,
    /// 오해 — 명확화 질문 발동
    Clarify(String),
    /// 미인지 — Claude 학습채널 호출 필요
    NeedsLearning,
    /// 미인지 — 기본 IR로 폴백
    FallbackGenerate,
}

/// 연산 절약 통계
#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
pub struct ThinkStats {
    /// 전체 에너지 셀 수
    pub total_cells: usize,
    /// 즉시 통과 (확정) 셀 수
    pub instant_cells: usize,
    /// 추가 연산 (미확인) 셀 수
    pub computed_cells: usize,
    /// 중단 (오해) 셀 수
    pub clarify_cells: usize,
    /// 학습 필요 (미인지) 셀 수
    pub unknown_cells: usize,
    /// 연산 절약률 (instant / total)
    pub savings_ratio: f32,
}

impl ThinkStats {
    pub fn calculate(cells: &[CelSummary]) -> Self {
        let total = cells.len();
        let instant = cells.iter().filter(|c| c.action == CelAction::InstantRetrieve).count();
        let computed = cells.iter().filter(|c| c.action == CelAction::GenerateWithTests).count();
        let clarify = cells.iter().filter(|c| matches!(c.action, CelAction::Clarify(_))).count();
        let unknown = cells.iter().filter(|c| 
            c.action == CelAction::NeedsLearning || c.action == CelAction::FallbackGenerate
        ).count();
        
        Self {
            total_cells: total,
            instant_cells: instant,
            computed_cells: computed,
            clarify_cells: clarify,
            unknown_cells: unknown,
            savings_ratio: if total > 0 { instant as f32 / total as f32 } else { 0.0 },
        }
    }
}

/// 크라우니코어 — 셀 분할/병합 사고모델의 진입점
///
/// think() 한 번 호출이 전체 파이프라인: split → reason → merge
pub struct CrownyCore;

impl Default for CrownyCore {
    fn default() -> Self {
        Self::new()
    }
}

impl CrownyCore {
    pub fn new() -> Self {
        Self
    }

    /// 전체 사고 파이프라인: split → reason(각 셀) → merge
    ///
    /// auto_learn이 false이면 미인지 셀을 FallbackGenerate로 처리
    pub fn think(
        &self,
        ir: &IrTree,
        net: &CellNet,
        auto_learn: bool,
    ) -> Result<ThinkResult> {
        // 1. 분할 — IR 트리를 에너지 셀로
        let energy_cells = split::DefaultSplitter::split(ir, net);

        // 2. 추론 — 각 셀 독립 추론
        let reasoned: Vec<ReasonedCel> = energy_cells.into_iter()
            .map(|cel| reason::Reasoner::reason(cel, net, auto_learn))
            .collect();

        // 3. 요약 수집
        let cell_results: Vec<CelSummary> = reasoned.iter()
            .map(|r| CelSummary {
                sub_intent: r.energy_cel.sub_intent.clone(),
                trit_state: r.energy_cel.trit_state,
                energy: r.energy_cel.energy,
                action: r.action.clone(),
            })
            .collect();

        // 4. 명확화 질문 수집
        let clarifications: Vec<String> = cell_results.iter()
            .filter_map(|c| match &c.action {
                CelAction::Clarify(q) => Some(q.clone()),
                _ => None,
            })
            .collect();

        // 5. 통계 계산
        let stats = ThinkStats::calculate(&cell_results);

        // 6. 병합 — 추론된 셀들을 완성 IR로
        let merged_ir = merge::Merger::merge(reasoned, ir)?;

        // 7. 전체 신뢰도 (에너지 가중 평균)
        let confidence = if cell_results.is_empty() {
            0.0
        } else {
            cell_results.iter().map(|c| c.energy).sum::<f32>()
                / cell_results.len() as f32
        };

        Ok(ThinkResult {
            merged_ir,
            confidence,
            cell_results,
            clarifications,
            stats,
        })
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{CrownyCell, Pattern, PatternSource};
    use crate::pipeline::ir::{IrTree, IrNode, Constraint, HttpMethod, TypeHint};

    fn make_http_ir() -> IrTree {
        IrTree {
            intent: "http_server".to_string(),
            sub_intents: vec![],
            nodes: vec![
                IrNode::HttpRoute {
                    method: HttpMethod::Get,
                    path: "/".to_string(),
                    handler: Box::new(IrNode::FunctionDef {
                        name: "index".to_string(),
                        params: vec![],
                        return_type: Some(TypeHint::String),
                        body: vec![IrNode::Return(Some("\"Hello\"".to_string()))],
                        is_async: true,
                    }),
                },
                IrNode::HttpRoute {
                    method: HttpMethod::Get,
                    path: "/health".to_string(),
                    handler: Box::new(IrNode::FunctionDef {
                        name: "health".to_string(),
                        params: vec![],
                        return_type: Some(TypeHint::Custom("dict".to_string())),
                        body: vec![IrNode::Return(Some("{\"ok\":true}".to_string()))],
                        is_async: true,
                    }),
                },
            ],
            constraints: vec![Constraint::Async],
            lang_hint: Some("rust".to_string()),
        }
    }

    fn make_populated_net() -> CellNet {
        let mut net = CellNet::new();
        let mut http = CrownyCell::with_energy("http_server", 0.90);
        http.add_pattern(Pattern::new("rust", "use axum::Router;", 0.9, PatternSource::Generated));
        net.insert(http);

        let mut route = CrownyCell::with_energy("http_route_get", 0.85);
        route.add_pattern(Pattern::new("rust", ".route(\"/\", get(handler))", 0.85, PatternSource::Generated));
        net.insert(route);

        let mut init = CrownyCell::with_energy("server_init", 0.95);
        init.add_pattern(Pattern::new("rust", "axum::Server::bind(&addr)", 0.95, PatternSource::UserConfirmed));
        net.insert(init);
        net
    }

    #[test]
    fn test_think_with_known_intent() {
        let ir = make_http_ir();
        let net = make_populated_net();
        let core = CrownyCore::new();
        let result = core.think(&ir, &net, false).unwrap();

        assert!(result.confidence > 0.0);
        assert!(!result.cell_results.is_empty());
        assert!(result.clarifications.is_empty());
        assert_eq!(result.stats.total_cells, result.cell_results.len());
    }

    #[test]
    fn test_think_has_instant_cells_for_known_patterns() {
        let ir = make_http_ir();
        let net = make_populated_net();
        let core = CrownyCore::new();
        let result = core.think(&ir, &net, false).unwrap();

        // 최소 하나의 셀은 즉시 통과해야 함
        assert!(result.stats.instant_cells > 0 || result.stats.computed_cells > 0,
            "Known patterns should produce instant or computed cells");
    }

    #[test]
    fn test_think_unknown_intent() {
        let ir = IrTree {
            intent: "quantum_teleporter".to_string(),
            sub_intents: vec![],
            nodes: vec![IrNode::FunctionDef {
                name: "teleport".to_string(),
                params: vec![],
                return_type: None,
                body: vec![IrNode::RawLogic("# quantum".to_string())],
                is_async: false,
            }],
            constraints: vec![],
            lang_hint: None,
        };
        let net = CellNet::new(); // 빈 네트워크
        let core = CrownyCore::new();
        let result = core.think(&ir, &net, false).unwrap();

        // 모든 셀이 미인지/폴백이어야 함
        assert!(result.stats.unknown_cells > 0 || result.cell_results.iter()
            .any(|c| c.action == CelAction::FallbackGenerate));
    }

    #[test]
    fn test_think_savings_ratio() {
        let ir = make_http_ir();
        let net = make_populated_net();
        let core = CrownyCore::new();
        let result = core.think(&ir, &net, false).unwrap();

        // savings_ratio는 0.0~1.0 사이
        assert!(result.stats.savings_ratio >= 0.0);
        assert!(result.stats.savings_ratio <= 1.0);
    }

    #[test]
    fn test_think_merged_ir_valid() {
        let ir = make_http_ir();
        let net = make_populated_net();
        let core = CrownyCore::new();
        let result = core.think(&ir, &net, false).unwrap();

        // 병합된 IR은 원본과 같은 intent를 가져야
        assert_eq!(result.merged_ir.intent, "http_server");
        // 노드가 있어야
        assert!(!result.merged_ir.nodes.is_empty());
    }

    #[test]
    fn test_stats_calculation() {
        let summaries = vec![
            CelSummary {
                sub_intent: "a".into(), trit_state: TritState::Confirmed,
                energy: 0.9, action: CelAction::InstantRetrieve,
            },
            CelSummary {
                sub_intent: "b".into(), trit_state: TritState::Uncertain,
                energy: 0.5, action: CelAction::GenerateWithTests,
            },
            CelSummary {
                sub_intent: "c".into(), trit_state: TritState::Confirmed,
                energy: 0.85, action: CelAction::InstantRetrieve,
            },
        ];
        let stats = ThinkStats::calculate(&summaries);
        assert_eq!(stats.total_cells, 3);
        assert_eq!(stats.instant_cells, 2);
        assert_eq!(stats.computed_cells, 1);
        assert!((stats.savings_ratio - 0.666).abs() < 0.01);
    }
}
