#![allow(dead_code)]
// crownycode/src/core/energy.rs
// ═══════════════════════════════════════════════════════════════
// 에너지 셀 — 독립 추론 가능한 최소 단위
// ═══════════════════════════════════════════════════════════════
//
// IR 트리가 곧바로 코드 생성기로 가지 않는다.
// 먼저 '에너지 셀'로 분할된다.
// 각 셀은 CellNet에서 자기 상태를 조회하고,
// 확정이면 즉시 통과, 미확인이면 추가 연산.

use crate::pipeline::ir::IrNode;
use crate::cell::{CellId, TritState};

/// 에너지 셀 — 크라우니코어의 추론 단위
///
/// HTTP 서버 요청이 들어오면:
///   에너지 셀 분할:
///   ├─ 셀A: "http_route_get" (확정 +2, energy 0.9)
///   ├─ 셀B: "async_handler"  (미확인 0, energy 0.6)
///   ├─ 셀C: "response_json"  (확정 +2, energy 0.85)
///   └─ 셀D: "server_init"    (확정 +2, energy 0.95)
///
///   확정 3개 → 즉시 통과 O(1)×3
///   미확인 1개 → 추가 연산 O(N)×1
///   = 파격적 연산절약
#[derive(Debug, Clone)]
pub struct EnergyCel {
    /// 하위 의도 (예: "http_route_get", "server_init")
    pub sub_intent: String,
    /// IR 트리의 부분
    pub ir_fragment: IrNode,
    /// 이 부분의 4상 상태 (CellNet에서 조회)
    pub trit_state: TritState,
    /// 활성화 에너지
    pub energy: f32,
    /// CellNet에서 매칭된 기존 셀 (있으면)
    pub matched_cell: Option<CellId>,
    /// 분할 전 원래 노드 인덱스 (병합 시 순서 복원용)
    pub original_index: usize,
}

impl EnergyCel {
    /// 새 에너지 셀 생성
    pub fn new(
        sub_intent: &str,
        ir_fragment: IrNode,
        original_index: usize,
    ) -> Self {
        Self {
            sub_intent: sub_intent.to_string(),
            ir_fragment,
            trit_state: TritState::Unknown,
            energy: 0.0,
            matched_cell: None,
            original_index,
        }
    }

    /// CellNet 조회 결과 적용
    pub fn with_cell_match(
        mut self,
        trit_state: TritState,
        energy: f32,
        cell_id: Option<CellId>,
    ) -> Self {
        self.trit_state = trit_state;
        self.energy = energy;
        self.matched_cell = cell_id;
        self
    }

    /// 이 셀이 즉시 통과 가능한지 (확정 상태)
    pub fn is_instant(&self) -> bool {
        self.trit_state == TritState::Confirmed
    }

    /// 이 셀이 추가 연산이 필요한지 (미확인 상태)
    pub fn needs_computation(&self) -> bool {
        self.trit_state == TritState::Uncertain
    }

    /// 이 셀이 중단을 요구하는지 (오해 상태)
    pub fn needs_clarification(&self) -> bool {
        self.trit_state == TritState::Refuted
    }

    /// 이 셀이 학습이 필요한지 (미인지 상태)
    pub fn needs_learning(&self) -> bool {
        self.trit_state == TritState::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_cel_creation() {
        let cel = EnergyCel::new(
            "http_route_get",
            IrNode::RawLogic("test".to_string()),
            0,
        );
        assert_eq!(cel.sub_intent, "http_route_get");
        assert_eq!(cel.trit_state, TritState::Unknown);
        assert_eq!(cel.energy, 0.0);
        assert!(cel.matched_cell.is_none());
    }

    #[test]
    fn test_with_cell_match() {
        let cel = EnergyCel::new("test", IrNode::RawLogic("x".into()), 0)
            .with_cell_match(TritState::Confirmed, 0.9, Some(42));
        assert_eq!(cel.trit_state, TritState::Confirmed);
        assert_eq!(cel.energy, 0.9);
        assert_eq!(cel.matched_cell, Some(42));
    }

    #[test]
    fn test_state_checks() {
        let confirmed = EnergyCel::new("a", IrNode::RawLogic("".into()), 0)
            .with_cell_match(TritState::Confirmed, 0.9, None);
        assert!(confirmed.is_instant());
        assert!(!confirmed.needs_computation());

        let uncertain = EnergyCel::new("b", IrNode::RawLogic("".into()), 0)
            .with_cell_match(TritState::Uncertain, 0.5, None);
        assert!(!uncertain.is_instant());
        assert!(uncertain.needs_computation());

        let refuted = EnergyCel::new("c", IrNode::RawLogic("".into()), 0)
            .with_cell_match(TritState::Refuted, 0.2, None);
        assert!(refuted.needs_clarification());

        let unknown = EnergyCel::new("d", IrNode::RawLogic("".into()), 0);
        assert!(unknown.needs_learning());
    }
}
