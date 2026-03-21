// crownycode/tests/phase1_test.rs
// Phase 1 통합 테스트 — 신규 기능 전용

use crownycode::pipeline::kps::{self, KpsKind};
use crownycode::pipeline::ir::{self, Constraint};
use crownycode::phase::judge::{PhaseJudge, Phase};
use crownycode::phase::signals;
use crownycode::cell::store::{CellStore, TrustDirection};
use chrono::Utc;

fn temp_db() -> CellStore {
    CellStore::open(&format!("/tmp/p1_{}.db", uuid::Uuid::new_v4())).unwrap()
}

// ── KPS 어댑터 자동 감지 ─────────────────────────────────────

#[test]
fn test_auto_detect_ko() {
    let nodes = kps::parse("비동기 REST API 서버 만들어줘").unwrap();
    let has_action = nodes.iter().any(|n| n.kind == KpsKind::Action);
    let has_async  = nodes.iter().any(|n| n.kind == KpsKind::Constraint && n.tokens.contains(&"async".to_string()));
    assert!(has_action, "action 없음");
    assert!(has_async, "async 제약 없음");
}

#[test]
fn test_auto_detect_en() {
    let nodes = kps::parse("create an async REST API with authentication in python").unwrap();
    let lang = nodes.iter().find(|n| n.kind == KpsKind::LangHint).map(|n| n.tokens[0].clone());
    assert_eq!(lang, Some("python".to_string()));
    let constraints: Vec<_> = nodes.iter()
        .filter(|n| n.kind == KpsKind::Constraint)
        .flat_map(|n| n.tokens.clone()).collect();
    assert!(constraints.contains(&"async".to_string()));
    assert!(constraints.contains(&"rest".to_string()));
    assert!(constraints.contains(&"auth".to_string()));
}

#[test]
fn test_en_adapter_many_constraints() {
    let nodes = kps::parse("build a simple CLI tool in rust with logging and tests").unwrap();
    let cs: Vec<_> = nodes.iter()
        .filter(|n| n.kind == KpsKind::Constraint)
        .flat_map(|n| n.tokens.clone()).collect();
    assert!(cs.contains(&"simple".to_string()));
    assert!(cs.contains(&"logging".to_string()));
    assert!(cs.contains(&"tested".to_string()));
}

#[test]
fn test_ko_extended_verbs() {
    // 새로 추가된 한국어 동사들
    let cases = [
        "REST API 개발해줘",
        "정렬 함수 설계해줘",
        "CLI 도구 빌드해줘",
    ];
    for input in &cases {
        let nodes = kps::parse(input).unwrap();
        assert!(nodes.iter().any(|n| n.kind == KpsKind::Action), "{input} action 없음");
    }
}

#[test]
fn test_supported_langs() {
    let langs = kps::supported_langs();
    assert!(langs.contains(&"ko"));
    assert!(langs.contains(&"en"));
}

// ── 신호 계산 ────────────────────────────────────────────────

#[test]
fn test_age_signal_fresh_cell() {
    use crownycode::cell::Cell;
    let cell = Cell {
        id: "test".to_string(),
        intent: "http_server".to_string(),
        target_lang: "python".to_string(),
        code: "".to_string(),
        confidence: 0.9,
        source: "generated".to_string(),
        created_at: Utc::now(),
        used_at: None,
        refutation_count: 0,
        use_count: 0,
    };
    assert!(signals::age_signal(&cell) > 0.95);
}

#[test]
fn test_similarity_exact() {
    assert_eq!(signals::similarity_signal("http_server", "http_server"), 1.0);
}

#[test]
fn test_similarity_partial() {
    let s = signals::similarity_signal("http_server_auth", "http_server");
    assert!(s > 0.5 && s < 1.0, "got {s}");
}

#[test]
fn test_similarity_unrelated() {
    let s = signals::similarity_signal("sort_function", "http_server");
    assert!(s < 0.1, "got {s}");
}

#[test]
fn test_refutation_penalty_scale() {
    assert_eq!(signals::refutation_signal(0), 1.0);
    assert!(signals::refutation_signal(1) < 1.0);
    assert!(signals::refutation_signal(3) < signals::refutation_signal(1));
    assert!(signals::refutation_signal(5) <= 0.1);
}

#[test]
fn test_signal_set_weighted() {
    let ss = signals::SignalSet {
        age_signal:        0.95,
        usage_signal:      0.8,
        refutation_signal: 1.0,
        similarity_signal: 1.0,
    };
    assert!(ss.weighted_confidence() >= 0.75);
}

// ── 4상 판별기 v2 ────────────────────────────────────────────

#[test]
fn test_judge_v2_seed_confirmed() {
    let db = temp_db();
    let nodes = kps::parse("HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let result = PhaseJudge::new(&db).evaluate(&tree).unwrap();
    assert_eq!(result.phase, Phase::Confirmed);
    assert!(result.signal_breakdown.is_some());
}

#[test]
fn test_judge_v2_db_cell_high_confidence() {
    let db = temp_db();
    db.upsert_pattern("rest_api", "python", "code", 0.92).unwrap();
    let nodes = kps::parse("REST API 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let result = PhaseJudge::new(&db).evaluate(&tree).unwrap();
    // 시드 또는 DB에서 발견 → 확정 또는 미확인
    assert!(matches!(result.phase, Phase::Confirmed | Phase::Uncertain));
}

#[test]
fn test_judge_v2_heavy_refutation_drops() {
    let db = temp_db();
    db.upsert_pattern("rest_api", "python", "code", 0.9).unwrap();
    for _ in 0..5 { db.refute("rest_api", "심각한 버그").unwrap(); }
    let nodes = kps::parse("REST API 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let result = PhaseJudge::new(&db).evaluate(&tree).unwrap();
    // 반박 5번 → 신뢰도 하락 → 더 낮은 Phase로 이동
    assert!(result.confidence < 0.9);
}

#[test]
fn test_judge_v2_conflict_sort_async() {
    let db = temp_db();
    let nodes = kps::parse("비동기 정렬 함수 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let result = PhaseJudge::new(&db).evaluate(&tree).unwrap();
    assert_eq!(result.phase, Phase::Misunderstood);
    assert!(!result.clarifications.is_empty());
    println!("명확화 질문: {:?}", result.clarifications);
}

#[test]
fn test_judge_v2_unknown() {
    let db = temp_db();
    let nodes = kps::parse("퀀텀 머신 블록체인 NFT 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let result = PhaseJudge::new(&db).evaluate(&tree).unwrap();
    assert_eq!(result.phase, Phase::Unknown);
}

// ── CellDB 신뢰 전파 ─────────────────────────────────────────

#[test]
fn test_fuzzy_search_by_token() {
    let db = temp_db();
    db.upsert_pattern("http_server_auth", "python", "code", 0.85).unwrap();
    let results = db.search_by_intent_tokens("http_server").unwrap();
    assert!(!results.is_empty(), "퍼지 검색 결과 없음");
}

#[test]
fn test_trust_propagation_boost() {
    let db = temp_db();
    db.upsert_pattern("http_server", "python", "code_a", 0.8).unwrap();
    db.upsert_pattern("api_server",  "python", "code_b", 0.7).unwrap();
    db.add_edge("http_server", "api_server", "related").unwrap();

    let before = db.find_by_intent("api_server").unwrap().unwrap().confidence;
    db.propagate_trust("http_server", TrustDirection::Boost, 1).unwrap();
    let after = db.find_by_intent("api_server").unwrap().unwrap().confidence;

    assert!(after > before, "Boost 후 confidence가 오르지 않음 ({before} -> {after})");
}

#[test]
fn test_trust_propagation_decay() {
    let db = temp_db();
    db.upsert_pattern("buggy_server", "python", "bad_code", 0.8).unwrap();
    db.upsert_pattern("related_server", "python", "code", 0.75).unwrap();
    db.add_edge("buggy_server", "related_server", "related").unwrap();

    let before = db.find_by_intent("related_server").unwrap().unwrap().confidence;
    db.propagate_trust("buggy_server", TrustDirection::Decay, 1).unwrap();
    let after = db.find_by_intent("related_server").unwrap().unwrap().confidence;

    assert!(after < before, "Decay 후 confidence가 내려가지 않음 ({before} -> {after})");
}

#[test]
fn test_trust_propagation_refutes_edge() {
    let db = temp_db();
    db.upsert_pattern("secure_api", "python", "good", 0.9).unwrap();
    db.upsert_pattern("vuln_pattern", "python", "bad",  0.8).unwrap();
    db.add_edge("secure_api", "vuln_pattern", "refutes").unwrap();

    let before = db.find_by_intent("vuln_pattern").unwrap().unwrap().confidence;
    // secure_api가 vuln_pattern을 refutes → Decay 전파
    db.propagate_trust("secure_api", TrustDirection::Decay, 1).unwrap();
    let after = db.find_by_intent("vuln_pattern").unwrap().unwrap().confidence;

    assert!(after < before, "refutes 엣지 Decay가 동작하지 않음 ({before} -> {after})");
}

#[test]
fn test_trust_propagation_depth_2() {
    let db = temp_db();
    db.upsert_pattern("root",   "python", "r", 0.9).unwrap();
    db.upsert_pattern("middle", "python", "m", 0.7).unwrap();
    db.upsert_pattern("leaf",   "python", "l", 0.6).unwrap();
    db.add_edge("root",   "middle", "related").unwrap();
    db.add_edge("middle", "leaf",   "related").unwrap();

    let leaf_before = db.find_by_intent("leaf").unwrap().unwrap().confidence;
    let affected = db.propagate_trust("root", TrustDirection::Boost, 2).unwrap();

    assert!(affected >= 2, "depth=2에서 최소 2개 셀 영향 기대, got {affected}");
    let leaf_after = db.find_by_intent("leaf").unwrap().unwrap().confidence;
    assert!(leaf_after > leaf_before, "depth=2 전파가 leaf에 도달하지 않음");
}

#[test]
fn test_propagation_no_negative_confidence() {
    let db = temp_db();
    db.upsert_pattern("target", "python", "code", 0.05).unwrap();  // 이미 낮음
    db.upsert_pattern("source", "python", "code", 0.9).unwrap();
    db.add_edge("source", "target", "refutes").unwrap();
    db.propagate_trust("source", TrustDirection::Decay, 1).unwrap();
    let after = db.find_by_intent("target").unwrap().unwrap().confidence;
    assert!(after >= 0.0, "confidence가 음수가 됨: {after}");
}
