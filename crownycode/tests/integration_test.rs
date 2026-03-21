// crownycode/tests/integration_test.rs
// Phase 0 통합 테스트 — 파이프라인 전체 흐름 검증

use crownycode::pipeline::{kps, ir, codegen};
use crownycode::phase::judge::{PhaseJudge, Phase};
use crownycode::cell::store::CrownyDb;

fn temp_db() -> CrownyDb {
    let path = format!("/tmp/crownycode_test_{}.db", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
    CrownyDb::open(&path).unwrap()
}

// ── KPS 파서 테스트 ───────────────────────────────────────────

#[test]
fn test_kps_ko_http() {
    let nodes = kps::parse("비동기 HTTP 서버 만들어줘").unwrap();
    let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
    assert!(kinds.contains(&&kps::KpsKind::Action));
    assert!(kinds.contains(&&kps::KpsKind::Target));
    assert!(kinds.contains(&&kps::KpsKind::Constraint));
}

#[test]
fn test_kps_en_with_lang_hint() {
    let nodes = kps::parse("create a REST API in python").unwrap();
    assert!(nodes.iter().any(|n| n.kind == kps::KpsKind::LangHint));
    let hint = nodes.iter()
        .find(|n| n.kind == kps::KpsKind::LangHint)
        .unwrap();
    assert_eq!(hint.tokens[0], "python");
}

#[test]
fn test_kps_rust_hint() {
    let nodes = kps::parse("러스트로 정렬 함수 짜줘").unwrap();
    let lang = nodes.iter()
        .find(|n| n.kind == kps::KpsKind::LangHint)
        .map(|n| n.tokens[0].clone());
    assert_eq!(lang, Some("rust".to_string()));
}

// ── IR 빌더 테스트 ────────────────────────────────────────────

#[test]
fn test_ir_http_server() {
    let nodes = kps::parse("HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    assert!(tree.intent.contains("http_server"));
    assert!(!tree.nodes.is_empty());
}

#[test]
fn test_ir_async_constraint() {
    let nodes = kps::parse("비동기 HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    assert!(tree.constraints.contains(&ir::Constraint::Async));
}

#[test]
fn test_ir_lang_hint_preserved() {
    let nodes = kps::parse("파이썬으로 HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    assert_eq!(tree.lang_hint, Some("python".to_string()));
}

// ── 코드 생성 테스트 ─────────────────────────────────────────

#[test]
fn test_codegen_python_http() {
    let nodes = kps::parse("HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let opts = codegen::GenOptions {
        verbose_comments: false,
        include_tests: false,
        phase_meta: Phase::Confirmed,
    };
    let code = codegen::generate(&tree, "python", &opts).unwrap();
    assert!(code.contains("def ") || code.contains("app"));
}

#[test]
fn test_codegen_rust_http() {
    let nodes = kps::parse("비동기 HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let opts = codegen::GenOptions {
        verbose_comments: true,
        include_tests: false,
        phase_meta: Phase::Confirmed,
    };
    let code = codegen::generate(&tree, "rust", &opts).unwrap();
    assert!(code.contains("fn ") || code.contains("axum"));
}

#[test]
fn test_codegen_with_tests() {
    let nodes = kps::parse("정렬 함수 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let opts = codegen::GenOptions {
        verbose_comments: false,
        include_tests: true,
        phase_meta: Phase::Uncertain,
    };
    let code = codegen::generate(&tree, "python", &opts).unwrap();
    assert!(code.contains("def test_"));
}

#[test]
fn test_codegen_crowny_stub() {
    let nodes = kps::parse("HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let opts = codegen::GenOptions {
        verbose_comments: false,
        include_tests: false,
        phase_meta: Phase::Confirmed,
    };
    let code = codegen::generate(&tree, "crowny", &opts).unwrap();
    // Phase 5: 실제 ISA729 코드 생성 — SECTION .text 또는 HLT 포함
    assert!(code.contains("SECTION") || code.contains("HLT") || code.contains("GLOBAL"));
}

// ── 4상 판별기 테스트 ─────────────────────────────────────────

#[test]
fn test_phase_known_intent_confirmed() {
    let db = temp_db();
    let nodes = kps::parse("HTTP 서버 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let judge = PhaseJudge::new(&db);
    let result = judge.evaluate(&tree).unwrap();
    assert_eq!(result.phase, Phase::Confirmed);
}

#[test]
fn test_phase_unknown_intent() {
    let db = temp_db();
    let nodes = kps::parse("퀀텀 블록체인 만들어줘").unwrap();
    let tree = ir::build(&nodes).unwrap();
    let judge = PhaseJudge::new(&db);
    let result = judge.evaluate(&tree).unwrap();
    assert_eq!(result.phase, Phase::Unknown);
}

#[test]
fn test_phase_db_high_confidence() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("custom_tool", "python", "def run(): pass", 0.95);
    // DB에 높은 신뢰도 셀이 있으면 확정
    let net = db.cell_net();
    let cell = net.find_by_intent("custom_tool").unwrap();
    assert!(cell.energy >= 0.8);
}

#[test]
fn test_phase_db_low_confidence_uncertain() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("fuzzy_tool", "python", "def run(): pass", 0.5);
    let net = db.cell_net();
    let cell = net.find_by_intent("fuzzy_tool").unwrap();
    assert!(cell.energy >= 0.4 && cell.energy < 0.8);
}

// ── CellDB 테스트 ────────────────────────────────────────────

#[test]
fn test_celldb_upsert_and_find() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("http_server", "python", "app = Flask(__name__)", 0.9);
    let net = db.cell_net();
    let cell = net.find_by_intent("http_server");
    assert!(cell.is_some());
    assert_eq!(cell.unwrap().best_pattern().unwrap().target_lang, "python");
}

#[test]
fn test_celldb_upsert_merges_confidence() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("merger_test", "python", "v1", 0.8);
    db.cell_net_mut().upsert_pattern("merger_test", "python", "v2", 0.6);
    let net = db.cell_net();
    let cell = net.find_by_intent("merger_test").unwrap();
    // 새 동작: 같은 언어에서 confidence가 높은 패턴만 유지 (0.8 > 0.6)
    // energy는 패턴 confidence 기반이므로 0.8 근처
    assert!(cell.energy >= 0.7);
}

#[test]
fn test_celldb_search() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("search_target", "python", "def search(): pass", 0.8);
    let net = db.cell_net();
    let results = net.search("search_target");
    assert!(!results.is_empty());
}

#[test]
fn test_celldb_refute_lowers_confidence() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("refute_test", "python", "code", 0.9);
    db.cell_net_mut().refute("refute_test");
    let net = db.cell_net();
    let cell = net.find_by_intent("refute_test").unwrap();
    assert!(cell.energy < 0.9);
}

#[test]
fn test_celldb_count() {
    let db = temp_db();
    assert_eq!(db.cell_net().len() as i64, 0);
    db.cell_net_mut().upsert_pattern("a", "python", "code", 0.8);
    db.cell_net_mut().upsert_pattern("b", "rust",   "code", 0.8);
    assert_eq!(db.cell_net().len() as i64, 2);
}
