// crownycode/tests/phase4_test.rs

use crownycode::pipeline::kps::{self, KpsKind};
use crownycode::gateway::{is_free_country, country_name, FREE_COUNTRIES};
use crownycode::gateway::quota::{QuotaManager, BASE_FREE_QUOTA};
use crownycode::gateway::contribute::{ContributeManager, ContribStatus, BONUS_PER_CONTRIBUTION};
use crownycode::cell::store::CellStore;
use rusqlite::Connection;

fn temp_db() -> CellStore {
    CellStore::open(&format!("/tmp/p4_{}.db", uuid::Uuid::new_v4())).unwrap()
}

fn mem_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    QuotaManager::new(&conn).init_schema().unwrap();
    ContributeManager::new(&conn).init_schema().unwrap();
    conn
}

// ── 힌디어 어댑터 ────────────────────────────────────────────

#[test]
fn test_hi_auto_detect_via_kps() {
    let nodes = kps::parse("HTTP सर्वर बनाओ").unwrap();
    assert!(!nodes.is_empty());
    assert!(nodes.iter().any(|n| n.kind == KpsKind::Action));
}

#[test]
fn test_hi_in_supported_langs() {
    let langs = kps::supported_langs();
    assert!(langs.contains(&"hi"), "힌디어가 지원 언어에 없음");
}

#[test]
fn test_hi_force_lang() {
    let nodes = kps::parse_with_lang("HTTP सर्वर बनाओ", "hi").unwrap();
    assert!(!nodes.is_empty());
}

#[test]
fn test_hi_target_mapping() {
    use crownycode::pipeline::kps::hi::HiAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = HiAdapter;
    assert_eq!(a.extract_target("HTTP सर्वर बनाओ"), "http_server");
    assert_eq!(a.extract_target("क्रमबद्ध फ़ंक्शन"), "sort_function");
}

#[test]
fn test_hi_lang_hint_python() {
    use crownycode::pipeline::kps::hi::HiAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = HiAdapter;
    assert_eq!(a.extract_lang_hint("Python में HTTP सर्वर बनाओ"), Some("python".to_string()));
}

#[test]
fn test_hi_constraints_fast_safe() {
    use crownycode::pipeline::kps::hi::HiAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = HiAdapter;
    let cs = a.extract_constraints("तेज़ और सुरक्षित API बनाओ");
    assert!(cs.contains(&"fast".to_string()));
    assert!(cs.contains(&"safe".to_string()));
}

// ── 포르투갈어(BR) 어댑터 ────────────────────────────────────

#[test]
fn test_pt_br_auto_detect() {
    let nodes = kps::parse("Crie um servidor HTTP em Python").unwrap();
    assert!(!nodes.is_empty());
}

#[test]
fn test_pt_br_in_supported_langs() {
    let langs = kps::supported_langs();
    assert!(langs.contains(&"pt-br"), "포르투갈어가 지원 언어에 없음");
}

#[test]
fn test_pt_br_force_lang() {
    let nodes = kps::parse_with_lang("Crie um servidor HTTP", "pt-br").unwrap();
    assert!(!nodes.is_empty());
    assert!(nodes.iter().any(|n| n.kind == KpsKind::Action));
}

#[test]
fn test_pt_br_target_mapping() {
    use crownycode::pipeline::kps::pt_br::PtBrAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = PtBrAdapter;
    assert_eq!(a.extract_target("Crie um servidor HTTP"), "http_server");
    assert_eq!(a.extract_target("faça uma api rest"),    "rest_api");
}

#[test]
fn test_pt_br_constraints_many() {
    use crownycode::pipeline::kps::pt_br::PtBrAdapter;
    use crownycode::pipeline::kps::adapter::LangAdapter;
    let a = PtBrAdapter;
    let cs = a.extract_constraints("Crie uma API REST assíncrona com autenticação e testes");
    assert!(cs.contains(&"async".to_string()));
    assert!(cs.contains(&"rest".to_string()));
    assert!(cs.contains(&"auth".to_string()));
    assert!(cs.contains(&"tested".to_string()));
}

#[test]
fn test_five_languages_registered() {
    let langs = kps::supported_langs();
    assert!(langs.contains(&"ko"),    "한국어 누락");
    assert!(langs.contains(&"en"),    "영어 누락");
    assert!(langs.contains(&"sw"),    "스와힐리어 누락");
    assert!(langs.contains(&"hi"),    "힌디어 누락");
    assert!(langs.contains(&"pt-br"), "포르투갈어 누락");
}

// ── 무상 게이트웨이 국가 판별 ─────────────────────────────────

#[test]
fn test_free_country_list_not_empty() {
    assert!(!FREE_COUNTRIES.is_empty());
    assert!(FREE_COUNTRIES.len() >= 15, "최소 15개국 이상");
}

#[test]
fn test_is_free_country_true() {
    for (code, _) in &FREE_COUNTRIES[..5] {
        assert!(is_free_country(code), "{code} should be free");
    }
}

#[test]
fn test_is_free_country_false() {
    for code in &["KR", "US", "JP", "DE", "FR", "GB", "CN", "AU"] {
        assert!(!is_free_country(code), "{code} should not be free");
    }
}

#[test]
fn test_country_name_lookup() {
    assert_eq!(country_name("KE"), Some("케냐"));
    assert_eq!(country_name("IN"), Some("인도"));
    assert_eq!(country_name("XX"), None);
}

// ── 쿼터 관리 ────────────────────────────────────────────────

#[test]
fn test_quota_base_is_100() {
    assert_eq!(BASE_FREE_QUOTA, 100);
}

#[test]
fn test_quota_fresh_dev_full() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    let s = qm.status("fresh_dev").unwrap();
    assert_eq!(s.remaining(), BASE_FREE_QUOTA);
    assert_eq!(s.used_api_calls, 0);
}

#[test]
fn test_quota_consume_and_check() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    for _ in 0..10 { qm.consume_api_call("dev1", None).unwrap(); }
    let s = qm.status("dev1").unwrap();
    assert_eq!(s.used_api_calls, 10);
    assert_eq!(s.remaining(), 90);
}

#[test]
fn test_quota_exhaustion_blocks_free_country() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    for _ in 0..100 { qm.consume_api_call("dev_ke", None).unwrap(); }
    assert!(!qm.can_call_api("dev_ke", true).unwrap());
}

#[test]
fn test_paid_user_always_allowed() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    for _ in 0..500 { qm.consume_api_call("paid", None).unwrap(); }
    assert!(qm.can_call_api("paid", false).unwrap());
}

#[test]
fn test_bonus_restores_access() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    for _ in 0..100 { qm.consume_api_call("dev_tz", None).unwrap(); }
    assert!(!qm.can_call_api("dev_tz", true).unwrap());
    qm.grant_contribution_bonus("dev_tz", 20, "기여").unwrap();
    assert!(qm.can_call_api("dev_tz", true).unwrap());
}

#[test]
fn test_quota_usage_rate() {
    let conn = mem_conn();
    let qm = QuotaManager::new(&conn);
    for _ in 0..50 { qm.consume_api_call("dev1", None).unwrap(); }
    let s = qm.status("dev1").unwrap();
    assert!((s.usage_rate() - 0.5).abs() < 0.01);
}

// ── 커뮤니티 기여 ─────────────────────────────────────────────

#[test]
fn test_contribution_bonus_amount() {
    assert_eq!(BONUS_PER_CONTRIBUTION, 5);
}

#[test]
fn test_valid_python_contribution() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let result = cm.submit(
        "dev_ng", "http_server", "python",
        "from flask import Flask\napp=Flask(__name__)\n@app.route('/')\ndef i(): return 'ok'"
    ).unwrap();
    assert_eq!(result.status, ContribStatus::Accepted);
    assert_eq!(result.quota_bonus, BONUS_PER_CONTRIBUTION);
    assert!(result.id > 0);
}

#[test]
fn test_valid_rust_contribution() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let result = cm.submit(
        "dev_in", "cli_tool", "rust",
        "use clap::Parser;\n#[derive(Parser)]\nstruct Args { name: String }\nfn main() { Args::parse(); }"
    ).unwrap();
    assert_eq!(result.status, ContribStatus::Accepted);
}

#[test]
fn test_short_code_rejected() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let result = cm.submit("dev1", "http_server", "python", "tiny").unwrap();
    assert_eq!(result.status, ContribStatus::Rejected);
    assert_eq!(result.quota_bonus, 0);
}

#[test]
fn test_unsupported_language_rejected() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let result = cm.submit("dev1", "server", "brainfuck", "+".repeat(30).as_str()).unwrap();
    assert_eq!(result.status, ContribStatus::Rejected);
}

#[test]
fn test_contribution_applies_to_celldb() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let db = temp_db();

    cm.submit("dev_bd", "json_parser", "python",
        "import json\ndef parse(s: str) -> dict: return json.loads(s)  # JSON parser").unwrap();

    let applied = cm.apply_to_celldb(&db).unwrap();
    assert_eq!(applied, 1);
    assert!(db.find_by_intent("json_parser").unwrap().is_some());
}

#[test]
fn test_contribution_skips_higher_confidence_existing() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let db = temp_db();

    db.upsert_pattern("http_server", "python", "premium_code", 0.99).unwrap();

    cm.submit("dev1", "http_server", "python",
        "from flask import Flask  # basic version is long enough to be submitted").unwrap();

    let applied = cm.apply_to_celldb(&db).unwrap();
    assert_eq!(applied, 0);

    let cell = db.find_by_intent("http_server").unwrap().unwrap();
    assert_eq!(cell.code, "premium_code", "기존 고품질 코드 보호됨");
}

#[test]
fn test_my_contributions_history() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);

    cm.submit("dev_rw", "sort_fn", "python",
        "def sort(lst): return sorted(lst)  # short but clean sort implementation").unwrap();
    cm.submit("dev_rw", "file_reader", "rust",
        "use std::fs;\nfn read(p: &str) -> String { fs::read_to_string(p).unwrap() }").unwrap();

    let records = cm.my_contributions("dev_rw").unwrap();
    assert_eq!(records.len(), 2);
}

#[test]
fn test_contrib_stats_after_apply() {
    let conn = mem_conn();
    let cm = ContributeManager::new(&conn);
    let db = temp_db();

    cm.submit("dev1", "cli_tool", "rust",
        "fn main() { println!(\"hello crownycode!\"); } // simple cli tool entry point").unwrap();
    cm.apply_to_celldb(&db).unwrap();

    let stats = cm.stats().unwrap();
    assert_eq!(stats.total, 1);
    assert_eq!(stats.applied, 1);
}
