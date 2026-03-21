// crownycode/src/core/merge.rs
// ═══════════════════════════════════════════════════════════════
// Merger — 추론된 에너지 셀들을 완성 IR 트리로 병합
// ═══════════════════════════════════════════════════════════════
//
// 독립 추론된 셀들을 원래 순서대로 조립한다.
// - 확정 셀의 result_ir (CellNet에서 인출한 코드)
// - 미확인 셀의 result_ir (패턴 기반 생성 + 테스트)
// - 오해 셀은 제외 (명확화 질문으로 대체)
// - 미인지 셀은 폴백 IR 또는 제외

use crate::error::Result;
use crate::pipeline::ir::{IrTree, IrNode};
use super::reason::ReasonedCel;
use super::CelAction;

pub struct Merger;

impl Merger {
    /// 추론된 에너지 셀들 → 완성 IR 트리
    ///
    /// 병합 규칙:
    /// 1. original_index 순서로 정렬
    /// 2. result_ir이 있는 셀만 노드로 포함
    /// 3. 오해(Clarify) 셀은 제외
    /// 4. 테스트 코드가 있으면 RawLogic으로 끝에 추가
    pub fn merge(cells: Vec<ReasonedCel>, original_ir: &IrTree) -> Result<IrTree> {
        let mut nodes: Vec<(usize, IrNode)> = Vec::new();
        let mut test_nodes: Vec<IrNode> = Vec::new();

        for cel in &cells {
            match &cel.action {
                CelAction::Clarify(_) => {
                    // 오해 셀: IR에 포함하지 않음
                    continue;
                }
                CelAction::NeedsLearning => {
                    // 학습 필요: IR에 포함하지 않음 (Engine에서 Claude 호출 후 재시도)
                    continue;
                }
                _ => {}
            }

            // result_ir이 있으면 사용, 없으면 원본 IR fragment 사용
            let ir_node = if let Some(ref result_ir) = cel.result_ir {
                result_ir.clone()
            } else {
                cel.energy_cel.ir_fragment.clone()
            };

            nodes.push((cel.energy_cel.original_index, ir_node));

            // 테스트 코드 수집
            if let Some(ref test) = cel.test_code {
                test_nodes.push(IrNode::RawLogic(test.clone()));
            }
        }

        // 순서 정렬
        nodes.sort_by_key(|(idx, _)| *idx);

        // 중복 제거: 같은 original_index의 첫 번째만 유지
        nodes.dedup_by_key(|(idx, _)| *idx);

        let mut merged_nodes: Vec<IrNode> = nodes.into_iter()
            .map(|(_, node)| node)
            .collect();

        // 빈 결과 방지: 최소 원본 IR 노드 사용
        if merged_nodes.is_empty() {
            merged_nodes = original_ir.nodes.clone();
        }

        // 테스트 노드 추가
        if !test_nodes.is_empty() {
            merged_nodes.push(IrNode::RawLogic(
                "\n// ═══ 자동 생성 테스트 (미확인 셀) ═══".to_string()
            ));
            merged_nodes.extend(test_nodes);
        }

        Ok(IrTree {
            intent: original_ir.intent.clone(),
            sub_intents: original_ir.sub_intents.clone(),
            nodes: merged_nodes,
            constraints: original_ir.constraints.clone(),
            lang_hint: original_ir.lang_hint.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crownycore::energy::EnergyCel;
    use crate::cell::TritState;
    use crate::pipeline::ir::Constraint;

    fn make_reasoned(
        intent: &str,
        index: usize,
        action: CelAction,
        result_code: Option<&str>,
        test: Option<&str>,
    ) -> ReasonedCel {
        let cel = EnergyCel::new(intent, IrNode::RawLogic(format!("// original: {}", intent)), index)
            .with_cell_match(
                match &action {
                    CelAction::InstantRetrieve => TritState::Confirmed,
                    CelAction::GenerateWithTests => TritState::Uncertain,
                    CelAction::Clarify(_) => TritState::Refuted,
                    _ => TritState::Unknown,
                },
                0.5,
                None,
            );
        ReasonedCel {
            energy_cel: cel,
            result_ir: result_code.map(|c| IrNode::RawLogic(c.to_string())),
            action,
            test_code: test.map(|t| t.to_string()),
        }
    }

    fn make_original_ir() -> IrTree {
        IrTree {
            intent: "http_server".to_string(),
            sub_intents: vec![],
            nodes: vec![IrNode::RawLogic("// original".to_string())],
            constraints: vec![Constraint::Async],
            lang_hint: Some("rust".to_string()),
        }
    }

    #[test]
    fn test_merge_preserves_order() {
        let cells = vec![
            make_reasoned("init", 0, CelAction::InstantRetrieve, Some("// init code"), None),
            make_reasoned("route", 1, CelAction::InstantRetrieve, Some("// route code"), None),
            make_reasoned("respond", 2, CelAction::InstantRetrieve, Some("// respond code"), None),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        assert_eq!(result.nodes.len(), 3);
        if let IrNode::RawLogic(s) = &result.nodes[0] { assert!(s.contains("init")); }
        if let IrNode::RawLogic(s) = &result.nodes[1] { assert!(s.contains("route")); }
        if let IrNode::RawLogic(s) = &result.nodes[2] { assert!(s.contains("respond")); }
    }

    #[test]
    fn test_merge_excludes_clarify_cells() {
        let cells = vec![
            make_reasoned("good", 0, CelAction::InstantRetrieve, Some("// ok"), None),
            make_reasoned("bad", 1, CelAction::Clarify("충돌 감지".into()), None, None),
            make_reasoned("also_good", 2, CelAction::InstantRetrieve, Some("// also ok"), None),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        // Clarify 셀은 제외됨
        assert_eq!(result.nodes.len(), 2);
    }

    #[test]
    fn test_merge_appends_test_code() {
        let cells = vec![
            make_reasoned("uncertain", 0, CelAction::GenerateWithTests,
                Some("// uncertain code"),
                Some("#[test]\nfn test_uncertain() { assert!(true); }")),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        // 코드 + 테스트 헤더 + 테스트 코드
        assert!(result.nodes.len() >= 2);
        let last = &result.nodes[result.nodes.len() - 1];
        if let IrNode::RawLogic(s) = last {
            assert!(s.contains("#[test]"));
        }
    }

    #[test]
    fn test_merge_uses_original_on_empty() {
        let cells: Vec<ReasonedCel> = vec![
            make_reasoned("unknown", 0, CelAction::NeedsLearning, None, None),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        // NeedsLearning만 있으면 원본 IR로 폴백
        assert!(!result.nodes.is_empty());
    }

    #[test]
    fn test_merge_preserves_metadata() {
        let cells = vec![
            make_reasoned("a", 0, CelAction::InstantRetrieve, Some("// code"), None),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        assert_eq!(result.intent, "http_server");
        assert_eq!(result.constraints, vec![Constraint::Async]);
        assert_eq!(result.lang_hint, Some("rust".to_string()));
    }

    #[test]
    fn test_merge_fallback_generates_code() {
        let cells = vec![
            make_reasoned("novel", 0, CelAction::FallbackGenerate, Some("// fallback"), None),
        ];
        let ir = make_original_ir();
        let result = Merger::merge(cells, &ir).unwrap();

        assert_eq!(result.nodes.len(), 1);
        if let IrNode::RawLogic(s) = &result.nodes[0] {
            assert!(s.contains("fallback"));
        }
    }
}
