// crownycode/tests/phase2_test.rs
// Phase 2 통합 테스트

use crownycode::pipeline::kps::{self, KpsKind};
use crownycode::developer::profile::{DeveloperProfile, StepPriority};
use crownycode::developer::store::DevStore;
use crownycode::developer::level::DevLevel;
use crownycode::cell::store::CrownyDb;

fn temp_db() -> CrownyDb {
    CrownyDb::open(&format!("/tmp/p2_{}.db", uuid::Uuid::new_v4())).unwrap()
}

// ── use_count 분리 ────────────────────────────────────────────

#[test]
fn test_use_count_increments() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("http_server", "python", "code", 0.9);
    let before = db.cell_net().find_by_intent("http_server").unwrap().activation_count;
    db.cell_net_mut().record_usage("http_server");
    db.cell_net_mut().record_usage("http_server");
    let after = db.cell_net().find_by_intent("http_server").unwrap().activation_count;
    assert_eq!(after, before + 2);
}

#[test]
fn test_use_count_independent_from_refutation() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("test_intent", "python", "code", 0.8);
    db.cell_net_mut().refute("test_intent");
    db.cell_net_mut().record_usage("test_intent");
    let net = db.cell_net();
    let cell = net.find_by_intent("test_intent").unwrap();
    // 반박은 confidence를 낮추지만 use_count는 따로 유지
    assert!(cell.energy < 0.8);
    assert_eq!(cell.activation_count, 1);
}

#[test]
fn test_use_count_zero_on_new_cell() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("fresh_cell", "rust", "fn main(){}", 0.7);
    let net = db.cell_net();
    let cell = net.find_by_intent("fresh_cell").unwrap();
    assert_eq!(cell.activation_count, 0);
}

// ── 개발자 레벨 시스템 ────────────────────────────────────────

#[test]
fn test_level_thresholds() {
    assert_eq!(DevLevel::from_cell_count(0),   DevLevel::Seed);
    assert_eq!(DevLevel::from_cell_count(9),   DevLevel::Seed);
    assert_eq!(DevLevel::from_cell_count(10),  DevLevel::Sprout);
    assert_eq!(DevLevel::from_cell_count(29),  DevLevel::Sprout);
    assert_eq!(DevLevel::from_cell_count(30),  DevLevel::Explorer);
    assert_eq!(DevLevel::from_cell_count(75),  DevLevel::Craftsman);
    assert_eq!(DevLevel::from_cell_count(150), DevLevel::Architect);
    assert_eq!(DevLevel::from_cell_count(300), DevLevel::Creator);
}

#[test]
fn test_codegen_params_seed_verbose() {
    let p = DevLevel::Seed.codegen_params();
    assert!(p.verbose_comments);
    assert!(p.include_tests);
    assert!(p.include_docstring);
    assert!(p.simplify_patterns);
}

#[test]
fn test_codegen_params_creator_concise() {
    let p = DevLevel::Creator.codegen_params();
    assert!(!p.verbose_comments);
    assert!(!p.include_tests);
    assert!(!p.simplify_patterns);
}

#[test]
fn test_cells_to_next_seed() {
    assert_eq!(DevLevel::Seed.cells_to_next(5), Some(5));
    assert_eq!(DevLevel::Seed.cells_to_next(9), Some(1));
}

#[test]
fn test_cells_to_next_creator_none() {
    assert_eq!(DevLevel::Creator.cells_to_next(999), None);
}

// ── 개발자 프로필 ────────────────────────────────────────────

#[test]
fn test_profile_level_up_at_10() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    for i in 0..10 {
        p.learn_intent(&format!("intent_{i}"), 0.9);
    }
    assert_eq!(p.level, DevLevel::Sprout);
    assert_eq!(p.known_intents.len(), 10);
}

#[test]
fn test_profile_learn_removes_uncertain() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    p.mark_uncertain("http_server");
    assert_eq!(p.uncertain_intents.len(), 1);
    p.learn_intent("http_server", 0.9);
    assert_eq!(p.uncertain_intents.len(), 0);
    assert_eq!(p.known_intents.len(), 1);
}

#[test]
fn test_profile_misunderstood_removes_known() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    p.learn_intent("sort_function", 0.9);
    p.mark_misunderstood("sort_function");
    assert_eq!(p.known_intents.len(), 0);
    assert_eq!(p.misunderstood_intents.len(), 1);
}

#[test]
fn test_profile_duplicate_learn_updates_confidence() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    p.learn_intent("http_server", 0.7);
    p.learn_intent("http_server", 0.95);
    assert_eq!(p.known_intents.len(), 1);
    assert!((p.known_intents[0].confidence - 0.95).abs() < 0.01);
}

#[test]
fn test_next_steps_order() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    p.mark_misunderstood("rest_api");
    p.mark_uncertain("json_parser");
    let steps = p.next_steps();
    assert!(!steps.is_empty());
    assert_eq!(steps[0].priority, StepPriority::Critical);
}

#[test]
fn test_success_rate_calculation() {
    let mut p = DeveloperProfile::new("dev1", "테스트");
    p.total_requests = 20;
    p.successful_generations = 16;
    assert!((p.success_rate() - 0.8).abs() < 0.01);
}

#[test]
fn test_free_gateway_countries() {
    let free_codes = ["KE", "TZ", "NG", "IN", "BD", "ET", "UG", "MZ"];
    for code in &free_codes {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.country_code = Some(code.to_string());
        assert!(p.is_free_gateway(), "{code} should be free");
    }
}

#[test]
fn test_not_free_gateway() {
    let non_free = ["KR", "US", "JP", "DE", "FR"];
    for code in &non_free {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.country_code = Some(code.to_string());
        assert!(!p.is_free_gateway(), "{code} should not be free");
    }
}

// ── DevStore — SQLite 영속성 ──────────────────────────────────

#[test]
fn test_devstore_create_and_load() {
    let db = temp_db();
    let dev_store = DevStore::new(db.connection());
    dev_store.init_schema().unwrap();

    let mut profile = DeveloperProfile::new("dev_test", "크라우니");
    profile.learn_intent("http_server", 0.9);
    profile.mark_uncertain("rest_api");
    dev_store.upsert_developer(&profile).unwrap();

    let loaded = dev_store.load_developer("dev_test").unwrap().unwrap();
    assert_eq!(loaded.name, "크라우니");
    assert_eq!(loaded.known_intents.len(), 1);
    assert_eq!(loaded.uncertain_intents.len(), 1);
}

#[test]
fn test_devstore_get_or_create_default() {
    let db = temp_db();
    let dev_store = DevStore::new(db.connection());
    dev_store.init_schema().unwrap();

    let p1 = dev_store.get_or_create_default().unwrap();
    let p2 = dev_store.get_or_create_default().unwrap();
    assert_eq!(p1.dev_id, p2.dev_id);
}

#[test]
fn test_devstore_record_request() {
    let db = temp_db();
    let dev_store = DevStore::new(db.connection());
    dev_store.init_schema().unwrap();

    let profile = DeveloperProfile::new("req_test", "테스터");
    dev_store.upsert_developer(&profile).unwrap();

    dev_store.record_request("req_test", true).unwrap();
    dev_store.record_request("req_test", true).unwrap();
    dev_store.record_request("req_test", false).unwrap();

    let loaded = dev_store.load_developer("req_test").unwrap().unwrap();
    assert_eq!(loaded.total_requests, 3);
    assert_eq!(loaded.successful_generations, 2);
}

#[test]
fn test_devstore_developer_count() {
    let db = temp_db();
    let dev_store = DevStore::new(db.connection());
    dev_store.init_schema().unwrap();

    assert_eq!(dev_store.developer_count().unwrap(), 0);
    dev_store.upsert_developer(&DeveloperProfile::new("a", "A")).unwrap();
    dev_store.upsert_developer(&DeveloperProfile::new("b", "B")).unwrap();
    assert_eq!(dev_store.developer_count().unwrap(), 2);
}

#[test]
fn test_devstore_total_learned_intents() {
    let db = temp_db();
    let dev_store = DevStore::new(db.connection());
    dev_store.init_schema().unwrap();

    let mut p = DeveloperProfile::new("stats_dev", "통계");
    p.learn_intent("http_server", 0.9);
    p.learn_intent("sort_function", 0.8);
    p.mark_uncertain("rest_api");  // uncertain은 카운트 안 됨
    dev_store.upsert_developer(&p).unwrap();

    assert_eq!(dev_store.total_learned_intents().unwrap(), 2);
}

// ── 스와힐리어 어댑터 ─────────────────────────────────────────

#[test]
fn test_sw_auto_detect_via_kps() {
    // 스와힐리어 키워드가 두 개 이상 → 자동 감지
    let nodes = kps::parse("Unda seva ya HTTP haraka kwa python").unwrap();
    assert!(!nodes.is_empty());
    // 행위 동사 추출 확인
    assert!(nodes.iter().any(|n| n.kind == KpsKind::Action));
}

#[test]
fn test_sw_in_supported_langs() {
    let langs = kps::supported_langs();
    assert!(langs.contains(&"sw"), "스와힐리어가 지원 언어에 없음");
}

#[test]
fn test_sw_target_normalized() {
    use crownycode::pipeline::kps::sw::SwAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = SwAdapter;
    assert_eq!(a.extract_target("unda seva ya http"), "http_server");
    assert_eq!(a.extract_target("andika kazi ya kupanga"), "sort_function");
}

#[test]
fn test_sw_constraints_fast_safe() {
    use crownycode::pipeline::kps::sw::SwAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = SwAdapter;
    let cs = a.extract_constraints("jenga programu haraka na salama");
    assert!(cs.contains(&"fast".to_string()));
    assert!(cs.contains(&"safe".to_string()));
}

#[test]
fn test_sw_parse_force_lang() {
    let nodes = kps::parse_with_lang("Unda seva ya HTTP", "sw").unwrap();
    assert!(!nodes.is_empty());
    assert!(nodes.iter().any(|n| n.kind == KpsKind::Action));
}
