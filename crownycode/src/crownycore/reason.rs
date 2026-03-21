// crownycode/src/core/reason.rs
// ═══════════════════════════════════════════════════════════════
// Reasoner — 각 에너지 셀의 독립 추론
// ═══════════════════════════════════════════════════════════════
//
// 이것이 '파격적 연산절약'의 핵심:
//   확정(+2) → 저장된 패턴 즉시 인출. 추가 연산 없음. O(1)
//   미확인(0) → 패턴 기반 생성 + 자동 테스트. O(N)
//   오해(-1) → 즉시 중단. 명확화 질문. O(1)
//   미인지(-2) → Claude 학습채널 또는 폴백. O(API) or O(1)

use crate::pipeline::ir::IrNode;
use crate::cell::net::CellNet;
use crate::cell::TritState;
use super::energy::EnergyCel;
use super::CelAction;

/// 추론된 에너지 셀
#[derive(Debug)]
pub struct ReasonedCel {
    /// 원래 에너지 셀
    pub energy_cel: EnergyCel,
    /// 추론 결과 IR (확정이면 CellNet에서 가져온 것)
    pub result_ir: Option<IrNode>,
    /// 취한 행동
    pub action: CelAction,
    /// 테스트 코드 (미확인 시 자동 생성)
    pub test_code: Option<String>,
}

pub struct Reasoner;

impl Reasoner {
    /// 에너지 셀 독립 추론
    ///
    /// 4상 상태에 따라 완전히 다른 경로를 탄다.
    /// 확정 셀은 CellNet 조회 1회로 끝 → O(1)
    pub fn reason(
        cel: EnergyCel,
        net: &CellNet,
        auto_learn: bool,
    ) -> ReasonedCel {
        match cel.trit_state {
            TritState::Confirmed => reason_confirmed(cel, net),
            TritState::Uncertain => reason_uncertain(cel, net),
            TritState::Refuted   => reason_refuted(cel),
            TritState::Unknown   => reason_unknown(cel, auto_learn),
        }
    }
}

/// 확정(+2) — 즉시 통과
///
/// CellNet에서 저장된 패턴을 인출.
/// 추가 연산 없음. 이것이 연산 절약의 핵심.
fn reason_confirmed(cel: EnergyCel, net: &CellNet) -> ReasonedCel {
    // 매칭된 셀의 코드 패턴이 있으면 IR에 주입
    let result_ir = if let Some(cell_id) = cel.matched_cell {
        net.get(cell_id).and_then(|cell| {
            cell.best_pattern().map(|pattern| {
                // 저장된 코드를 RawLogic으로 감싸서 반환
                IrNode::RawLogic(format!(
                    "// [확정 +2] CellNet 인출: {}\n{}",
                    cel.sub_intent,
                    pattern.code
                ))
            })
        })
    } else {
        None
    };

    ReasonedCel {
        result_ir,
        action: CelAction::InstantRetrieve,
        test_code: None,
        energy_cel: cel,
    }
}

/// 미확인(0) — 추가 연산 + 테스트 생성
///
/// 기존 패턴을 기반으로 코드를 생성하되,
/// 자동으로 단위 테스트를 첨부한다.
fn reason_uncertain(cel: EnergyCel, net: &CellNet) -> ReasonedCel {
    let (result_ir, test_code) = if let Some(cell_id) = cel.matched_cell {
        let cell = net.get(cell_id);
        let code = cell.and_then(|c| c.best_pattern())
            .map(|p| p.code.clone())
            .unwrap_or_default();

        let ir = IrNode::RawLogic(format!(
            "// [미확인 0] 패턴 기반 생성 (테스트 첨부): {}\n{}",
            cel.sub_intent, code
        ));

        // 자동 테스트 생성
        let test = generate_test_stub(&cel.sub_intent, &code);
        (Some(ir), Some(test))
    } else {
        // 매칭 없지만 미확인 → 원본 IR + 기본 테스트
        let ir = IrNode::RawLogic(format!(
            "// [미확인 0] 기본 생성 (검증 필요): {}",
            cel.sub_intent
        ));
        let test = generate_test_stub(&cel.sub_intent, "");
        (Some(ir), Some(test))
    };

    ReasonedCel {
        result_ir,
        action: CelAction::GenerateWithTests,
        test_code,
        energy_cel: cel,
    }
}

/// 오해(-1) — 즉시 중단, 명확화 질문
fn reason_refuted(cel: EnergyCel) -> ReasonedCel {
    let question = format!(
        "'{}' 의도가 반박된 패턴과 연결되어 있습니다. 의도를 명확히 해주세요.",
        cel.sub_intent
    );
    ReasonedCel {
        result_ir: None,
        action: CelAction::Clarify(question),
        test_code: None,
        energy_cel: cel,
    }
}

/// 미인지(-2) — Claude 학습 또는 폴백
fn reason_unknown(cel: EnergyCel, auto_learn: bool) -> ReasonedCel {
    if auto_learn {
        // Claude 학습채널 호출 필요 (실제 호출은 Engine 레벨에서)
        ReasonedCel {
            result_ir: None,
            action: CelAction::NeedsLearning,
            test_code: None,
            energy_cel: cel,
        }
    } else {
        // 폴백: 원본 IR을 그대로 사용
        let ir = IrNode::RawLogic(format!(
            "// [미인지 -2] 폴백 생성: {}",
            cel.sub_intent
        ));
        ReasonedCel {
            result_ir: Some(ir),
            action: CelAction::FallbackGenerate,
            test_code: None,
            energy_cel: cel,
        }
    }
}

/// 자동 테스트 스텁 생성
fn generate_test_stub(sub_intent: &str, code: &str) -> String {
    let fn_name = sub_intent.replace(['-', '.', ' '], "_");
    format!(
        "// 자동 생성 테스트 — {} (미확인 상태)\n\
         #[test]\n\
         fn test_{fn_name}() {{\n\
         {}\
         }}",
        sub_intent,
        if code.is_empty() {
            "    // TODO: 코드가 생성되면 테스트 추가\n    assert!(true);\n".to_string()
        } else {
            format!("    // 기본 검증: 코드가 비어있지 않음\n    let code = r#\"{}\"#;\n    assert!(!code.is_empty());\n",
                code.lines().next().unwrap_or(""))
        }
    )
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{CrownyCell, Pattern, PatternSource};

    fn make_cel_with_state(intent: &str, state: TritState, cell_id: Option<u64>) -> EnergyCel {
        EnergyCel::new(intent, IrNode::RawLogic("test".into()), 0)
            .with_cell_match(state, state_to_energy(state), cell_id)
    }

    fn state_to_energy(state: TritState) -> f32 {
        match state {
            TritState::Confirmed => 0.9,
            TritState::Uncertain => 0.5,
            TritState::Refuted   => 0.2,
            TritState::Unknown   => 0.0,
        }
    }

    #[test]
    fn test_reason_confirmed_instant_retrieve() {
        let mut net = CellNet::new();
        let mut cell = CrownyCell::with_energy("http_route_get", 0.9);
        cell.add_pattern(Pattern::new("rust", "get(handler)", 0.9, PatternSource::Generated));
        let id = net.insert(cell);

        let cel = make_cel_with_state("http_route_get", TritState::Confirmed, Some(id));
        let result = Reasoner::reason(cel, &net, false);

        assert_eq!(result.action, CelAction::InstantRetrieve);
        assert!(result.result_ir.is_some());
        assert!(result.test_code.is_none());
    }

    #[test]
    fn test_reason_uncertain_generates_test() {
        let mut net = CellNet::new();
        let mut cell = CrownyCell::with_energy("async_handler", 0.5);
        cell.add_pattern(Pattern::new("rust", "async fn handle()", 0.5, PatternSource::Generated));
        let id = net.insert(cell);

        let cel = make_cel_with_state("async_handler", TritState::Uncertain, Some(id));
        let result = Reasoner::reason(cel, &net, false);

        assert_eq!(result.action, CelAction::GenerateWithTests);
        assert!(result.result_ir.is_some());
        assert!(result.test_code.is_some());
        assert!(result.test_code.unwrap().contains("#[test]"));
    }

    #[test]
    fn test_reason_refuted_clarification() {
        let net = CellNet::new();
        let cel = make_cel_with_state("bad_intent", TritState::Refuted, None);
        let result = Reasoner::reason(cel, &net, false);

        assert!(matches!(result.action, CelAction::Clarify(_)));
        assert!(result.result_ir.is_none());
    }

    #[test]
    fn test_reason_unknown_needs_learning() {
        let net = CellNet::new();
        let cel = make_cel_with_state("novel_thing", TritState::Unknown, None);
        let result = Reasoner::reason(cel, &net, true);

        assert_eq!(result.action, CelAction::NeedsLearning);
        assert!(result.result_ir.is_none());
    }

    #[test]
    fn test_reason_unknown_fallback_when_no_learn() {
        let net = CellNet::new();
        let cel = make_cel_with_state("novel_thing", TritState::Unknown, None);
        let result = Reasoner::reason(cel, &net, false);

        assert_eq!(result.action, CelAction::FallbackGenerate);
        assert!(result.result_ir.is_some());
    }

    #[test]
    fn test_generate_test_stub() {
        let stub = generate_test_stub("http_route_get", "get(handler)");
        assert!(stub.contains("#[test]"));
        assert!(stub.contains("test_http_route_get"));
        assert!(stub.contains("assert!"));
    }

    #[test]
    fn test_generate_test_stub_empty_code() {
        let stub = generate_test_stub("unknown", "");
        assert!(stub.contains("TODO"));
    }
}
