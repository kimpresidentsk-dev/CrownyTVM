// crownycode/src/core/split.rs
// ═══════════════════════════════════════════════════════════════
// Splitter — IR 트리를 에너지 셀로 분할
// ═══════════════════════════════════════════════════════════════
//
// 분할 기준: IR 노드의 의미적 독립성
//   HttpRoute → [라우트 등록, 핸들러 함수, 서버 초기화]
//   FunctionDef (복잡) → 본문을 하위 셀로 분할
//   단순 노드 → 단일 에너지 셀
//
// 각 셀의 trit_state는 CellNet에서 조회하여 설정.
// 이 조회 결과가 추론 단계에서 즉시통과/추가연산을 결정.

use crate::pipeline::ir::{IrTree, IrNode, HttpMethod};
use crate::cell::net::CellNet;
use super::energy::EnergyCel;

/// 기본 분할기
pub struct DefaultSplitter;

impl DefaultSplitter {
    /// IR 트리 → 에너지 셀 목록
    ///
    /// 분할 규칙:
    /// 1. HttpRoute → 라우트별 셀 + 전체 서버 초기화 셀
    /// 2. 복잡한 FunctionDef (body > 2) → 헤더 + 본문 분리
    /// 3. 단순 노드 → 단일 셀
    pub fn split(ir: &IrTree, net: &CellNet) -> Vec<EnergyCel> {
        let mut cells = Vec::new();
        let has_http = ir.nodes.iter().any(|n| matches!(n, IrNode::HttpRoute { .. }));

        // HTTP 서버 요청이면 서버 초기화 셀 추가
        if has_http {
            let init_cel = make_cel("server_init", IrNode::RawLogic(
                "# 서버 초기화 — 바인드 + 리슨".to_string()
            ), cells.len());
            cells.push(evaluate_cel(init_cel, net));
        }

        for node in ir.nodes.iter() {
            match node {
                IrNode::HttpRoute { method, path: _, handler } => {
                    // 각 라우트를 독립 셀로
                    let sub_intent = format!("http_route_{}", method_str(method));
                    let cel = make_cel(&sub_intent, node.clone(), cells.len());
                    cells.push(evaluate_cel(cel, net));

                    // 핸들러가 복잡하면 추가 분할
                    if let IrNode::FunctionDef { body, is_async, .. } = handler.as_ref() {
                        if *is_async {
                            let async_cel = make_cel(
                                "async_handler",
                                IrNode::RawLogic("# 비동기 핸들러 처리".to_string()),
                                cells.len(),
                            );
                            cells.push(evaluate_cel(async_cel, net));
                        }
                        if body.len() > 2 {
                            let body_cel = make_cel(
                                "handler_body_complex",
                                IrNode::RawLogic("# 복잡한 핸들러 본문".to_string()),
                                cells.len(),
                            );
                            cells.push(evaluate_cel(body_cel, net));
                        }
                    }
                }

                IrNode::FunctionDef { name, body, is_async: _, .. } => {
                    if body.len() > 2 {
                        // 복잡한 함수: 시그니처 셀 + 본문 셀
                        let sig_intent = format!("func_sig_{}", name);
                        let sig_cel = make_cel(&sig_intent, node.clone(), cells.len());
                        cells.push(evaluate_cel(sig_cel, net));

                        for (bi, body_node) in body.iter().enumerate() {
                            let body_intent = format!("func_body_{}_{}", name, bi);
                            let body_cel = make_cel(
                                &body_intent,
                                body_node.clone(),
                                cells.len(),
                            );
                            cells.push(evaluate_cel(body_cel, net));
                        }
                    } else {
                        // 단순 함수: 단일 셀
                        let intent = format!("func_{}", name);
                        let cel = make_cel(&intent, node.clone(), cells.len());
                        cells.push(evaluate_cel(cel, net));
                    }
                }

                IrNode::StructDef { name, .. } => {
                    let intent = format!("struct_{}", name);
                    let cel = make_cel(&intent, node.clone(), cells.len());
                    cells.push(evaluate_cel(cel, net));
                }

                // 단순 노드: 단일 셀
                _ => {
                    let intent = ir_node_intent(node, &ir.intent);
                    let cel = make_cel(&intent, node.clone(), cells.len());
                    cells.push(evaluate_cel(cel, net));
                }
            }
        }

        // 응답 직렬화 셀 (HTTP 서버에 기본 포함)
        if has_http {
            let resp_cel = make_cel("response_serialize", IrNode::RawLogic(
                "# 응답 직렬화 — JSON/HTML 변환".to_string()
            ), cells.len());
            cells.push(evaluate_cel(resp_cel, net));
        }

        // 빈 결과 방지: 최소 1개 셀
        if cells.is_empty() {
            let fallback = make_cel(&ir.intent, IrNode::RawLogic(
                format!("# {} 기본 구현", ir.intent)
            ), 0);
            cells.push(evaluate_cel(fallback, net));
        }

        cells
    }
}

/// 에너지 셀 생성 헬퍼
fn make_cel(sub_intent: &str, ir_fragment: IrNode, index: usize) -> EnergyCel {
    EnergyCel::new(sub_intent, ir_fragment, index)
}

/// CellNet에서 셀 상태 조회하여 에너지 셀에 적용
fn evaluate_cel(cel: EnergyCel, net: &CellNet) -> EnergyCel {
    // 1. 정확 매칭
    if let Some(cell) = net.find_by_intent(&cel.sub_intent) {
        return cel.with_cell_match(cell.trit_state, cell.energy, Some(cell.id));
    }

    // 2. 퍼지 매칭 (토큰 기반)
    let fuzzy = net.fuzzy_search(&cel.sub_intent);
    if let Some(best) = fuzzy.first() {
        // 퍼지 매칭은 에너지를 80%로 감쇠
        let adjusted_energy = best.energy * 0.8;
        let state = crate::cell::TritState::from_energy(adjusted_energy);
        return cel.with_cell_match(state, adjusted_energy, Some(best.id));
    }

    // 3. 매칭 없음 → Unknown
    cel
}

/// HttpMethod → 문자열
fn method_str(method: &HttpMethod) -> &'static str {
    match method {
        HttpMethod::Get    => "get",
        HttpMethod::Post   => "post",
        HttpMethod::Put    => "put",
        HttpMethod::Delete => "delete",
        HttpMethod::Patch  => "patch",
    }
}

/// IR 노드에서 의도 문자열 추출
fn ir_node_intent(node: &IrNode, parent_intent: &str) -> String {
    match node {
        IrNode::VarDecl { name, .. } => format!("var_{}", name),
        IrNode::Return(_) => format!("{}_return", parent_intent),
        IrNode::RawLogic(s) => {
            let clean: String = s.chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == ' ')
                .collect();
            let short = clean.split_whitespace().take(3).collect::<Vec<_>>().join("_");
            if short.is_empty() { parent_intent.to_string() } else { short.to_lowercase() }
        }
        _ => parent_intent.to_string(),
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::ir::*;
    use crate::cell::{CrownyCell, Pattern, PatternSource, TritState};

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
            ],
            constraints: vec![Constraint::Async],
            lang_hint: None,
        }
    }

    fn make_net_with_patterns() -> CellNet {
        let mut net = CellNet::new();
        let mut http = CrownyCell::with_energy("http_server", 0.90);
        http.add_pattern(Pattern::new("rust", "use axum;", 0.9, PatternSource::Generated));
        net.insert(http);

        let mut route = CrownyCell::with_energy("http_route_get", 0.85);
        route.add_pattern(Pattern::new("rust", ".route(get)", 0.85, PatternSource::Generated));
        net.insert(route);

        let mut init = CrownyCell::with_energy("server_init", 0.95);
        init.add_pattern(Pattern::new("rust", "Server::bind", 0.95, PatternSource::UserConfirmed));
        net.insert(init);
        net
    }

    #[test]
    fn test_split_http_produces_multiple_cells() {
        let ir = make_http_ir();
        let net = make_net_with_patterns();
        let cells = DefaultSplitter::split(&ir, &net);
        // 최소: server_init + http_route_get + async_handler + response_serialize
        assert!(cells.len() >= 3, "HTTP server should split into 3+ cells, got {}", cells.len());
    }

    #[test]
    fn test_split_evaluates_state_from_cellnet() {
        let ir = make_http_ir();
        let net = make_net_with_patterns();
        let cells = DefaultSplitter::split(&ir, &net);

        // server_init은 CellNet에 있으므로 확정이어야
        let init_cel = cells.iter().find(|c| c.sub_intent == "server_init");
        assert!(init_cel.is_some(), "Should have server_init cell");
        let init = init_cel.unwrap();
        assert_eq!(init.trit_state, TritState::Confirmed);
        assert!(init.energy > 0.7);
    }

    #[test]
    fn test_split_unknown_for_empty_net() {
        let ir = make_http_ir();
        let net = CellNet::new();
        let cells = DefaultSplitter::split(&ir, &net);
        
        // 빈 네트워크에서는 모든 셀이 Unknown
        for cel in &cells {
            assert_eq!(cel.trit_state, TritState::Unknown,
                "Cell '{}' should be Unknown with empty net", cel.sub_intent);
        }
    }

    #[test]
    fn test_split_simple_function() {
        let ir = IrTree {
            intent: "sort_function".to_string(),
            sub_intents: vec![],
            nodes: vec![IrNode::FunctionDef {
                name: "sort".to_string(),
                params: vec![Param { name: "items".into(), type_hint: Some(TypeHint::List(Box::new(TypeHint::Int))) }],
                return_type: Some(TypeHint::List(Box::new(TypeHint::Int))),
                body: vec![IrNode::Return(Some("sorted(items)".into()))],
                is_async: false,
            }],
            constraints: vec![],
            lang_hint: None,
        };
        let net = CellNet::new();
        let cells = DefaultSplitter::split(&ir, &net);
        // 단순 함수: body <= 2이므로 단일 셀
        assert!(cells.len() >= 1);
    }

    #[test]
    fn test_split_preserves_original_index() {
        let ir = make_http_ir();
        let net = CellNet::new();
        let cells = DefaultSplitter::split(&ir, &net);
        for (i, cel) in cells.iter().enumerate() {
            assert_eq!(cel.original_index, i);
        }
    }

    #[test]
    fn test_split_never_empty() {
        let ir = IrTree {
            intent: "empty".to_string(),
            sub_intents: vec![],
            nodes: vec![],
            constraints: vec![],
            lang_hint: None,
        };
        let net = CellNet::new();
        let cells = DefaultSplitter::split(&ir, &net);
        assert!(!cells.is_empty(), "Split should never return empty");
    }

    #[test]
    fn test_split_fuzzy_match() {
        let ir = IrTree {
            intent: "http_server_auth".to_string(),
            sub_intents: vec![],
            nodes: vec![IrNode::RawLogic("# auth server".into())],
            constraints: vec![],
            lang_hint: None,
        };
        let net = make_net_with_patterns();
        let cells = DefaultSplitter::split(&ir, &net);
        
        // "http_server_auth" → "http_server" 퍼지 매칭
        let has_matched = cells.iter().any(|c| c.matched_cell.is_some());
        assert!(has_matched, "Should fuzzy match http_server");
    }
}
