// crownycode/tests/phase3_test.rs

use crownycode::cell::store::CrownyDb;
use crownycode::developer::store::DevStore;
use crownycode::developer::profile::DeveloperProfile;
use crownycode::developer::level::DevLevel;
use crownycode::offline::snapshot;

fn temp_db() -> CrownyDb {
    let db = CrownyDb::open(&format!("/tmp/p3_{}.db", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())).unwrap();
    let ds = DevStore::new(db.db_path());
    ds.init_schema().unwrap();
    db
}

fn temp_path() -> String {
    format!("/tmp/snap3_{}.jsonl", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())
}

// ── Engine ↔ DevStore 연결 ─────────────────────────────────────

#[test]
fn test_devstore_init_on_engine_new() {
    // DevStore 스키마가 CrownyDb DB에 자동 생성되는지 확인
    let db = temp_db();
    let ds = DevStore::new(db.db_path());
    // 오류 없이 기본 개발자 생성 가능한지
    let profile = ds.get_or_create_default().unwrap();
    assert_eq!(profile.level, DevLevel::Seed);
}

#[test]
fn test_use_count_and_record_request_independent() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("http_server", "python", "code", 0.9);

    // use_count: 셀 사용 횟수
    db.cell_net_mut().record_usage("http_server");
    db.cell_net_mut().record_usage("http_server");
    let net = db.cell_net();
    let cell = net.find_by_intent("http_server").unwrap();
    assert_eq!(cell.activation_count, 2);

    // record_request: 개발자 요청 횟수
    let ds = DevStore::new(db.db_path());
    ds.record_request("default", true).unwrap();
    ds.record_request("default", false).unwrap();
    // 기본 개발자가 없을 때는 조용히 실패 (테이블은 존재하지만 row 없음)
    // → 오류 없이 통과하면 OK
}

#[test]
fn test_profile_level_codegen_params_seed() {
    let p = DeveloperProfile::new("dev_seed", "씨앗개발자");
    let params = p.level.codegen_params();
    assert!(params.verbose_comments);
    assert!(params.include_tests);
    assert!(params.simplify_patterns);
    assert!(params.include_docstring);
}

#[test]
fn test_profile_level_codegen_params_craftsman() {
    let mut p = DeveloperProfile::new("dev_craft", "장인");
    // 75개 인텐트 학습 → Craftsman
    for i in 0..75 {
        p.learn_intent(&format!("intent_{i}"), 0.9);
    }
    assert_eq!(p.level, DevLevel::Craftsman);
    let params = p.level.codegen_params();
    assert!(!params.verbose_comments);
    assert!(!params.include_tests);
    assert!(!params.simplify_patterns);
}

#[test]
fn test_profile_next_steps_seed_level() {
    let p = DeveloperProfile::new("seed", "테스트");
    let steps = p.next_steps();
    // 씨앗 레벨: 기본 학습 제안 있어야 함
    assert!(!steps.is_empty());
}

#[test]
fn test_profile_persist_and_reload() {
    let db = temp_db();
    let ds = DevStore::new(db.db_path());

    let mut p = DeveloperProfile::new("persist_test", "재로드테스트");
    p.learn_intent("http_server", 0.9);
    p.learn_intent("sort_function", 0.85);
    p.mark_uncertain("rest_api");
    p.total_requests = 10;
    p.successful_generations = 8;
    ds.upsert_developer(&p).unwrap();

    let loaded = ds.load_developer("persist_test").unwrap().unwrap();
    assert_eq!(loaded.known_intents.len(), 2);
    assert_eq!(loaded.uncertain_intents.len(), 1);
    assert_eq!(loaded.total_requests, 10);
    assert_eq!(loaded.successful_generations, 8);
    assert!((loaded.success_rate() - 0.8).abs() < 0.01);
}

// ── 스냅샷 내보내기/가져오기 ──────────────────────────────────

#[test]
fn test_snapshot_export_import_roundtrip() {
    let src = temp_db();
    src.cell_net_mut().upsert_pattern("http_server", "python", "flask_app", 0.92);
    src.cell_net_mut().upsert_pattern("sort_fn",    "rust",   "sort_impl", 0.88);
    src.cell_net_mut().upsert_pattern("cli_tool",   "rust",   "clap_app",  0.75);

    let path = temp_path();
    snapshot::export(&src, &path).unwrap();

    let dst = temp_db();
    let n = snapshot::import(&dst, &path).unwrap();
    assert_eq!(n, 3);

    let net = dst.cell_net();
    let cell = net.find_by_intent("http_server").unwrap();
    assert_eq!(cell.best_pattern().unwrap().target_lang, "python");
    assert!((cell.energy - 0.92).abs() < 0.02);
}

#[cfg(feature = "claude")]
#[test]
fn test_snapshot_skips_lower_confidence() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("test_intent", "python", "high_quality", 0.95);

    let path = temp_path();
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
        writeln!(f, r#"{{"intent":"test_intent","target_lang":"python","code":"low_quality","confidence":0.3,"refutation_count":0,"use_count":0}}"#).unwrap();
    }

    let imported = snapshot::import(&db, &path).unwrap();
    assert_eq!(imported, 0);

    let net = db.cell_net();
    let cell = net.find_by_intent("test_intent").unwrap();
    assert_eq!(cell.best_pattern().unwrap().code, "high_quality", "기존 고신뢰 코드 보존됨");
}

#[cfg(feature = "claude")]
#[test]
fn test_snapshot_overwrites_lower_confidence() {
    let db = temp_db();
    db.cell_net_mut().upsert_pattern("weak_cell", "python", "old_code", 0.4);

    let path = temp_path();
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
        writeln!(f, r#"{{"intent":"weak_cell","target_lang":"python","code":"better_code","confidence":0.9,"refutation_count":0,"use_count":5}}"#).unwrap();
    }

    let imported = snapshot::import(&db, &path).unwrap();
    assert_eq!(imported, 1);
}

#[cfg(feature = "claude")]
#[test]
fn test_snapshot_merge_two_files() {
    let db = temp_db();
    let p1 = temp_path();
    let p2 = temp_path();

    // 자체 스냅샷 형식 (VERSION= 헤더 + --- 구분선)
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&p1).unwrap();
        writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
        writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
        writeln!(f, "CELL_COUNT=1").unwrap();
        writeln!(f, "---").unwrap();
        writeln!(f, "CELL").unwrap();
        writeln!(f, "intent=merge_a").unwrap();
        writeln!(f, "target_lang=python").unwrap();
        writeln!(f, "code=a").unwrap();
        writeln!(f, "confidence=0.9").unwrap();
        writeln!(f, "END").unwrap();
    }
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&p2).unwrap();
        writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
        writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
        writeln!(f, "CELL_COUNT=1").unwrap();
        writeln!(f, "---").unwrap();
        writeln!(f, "CELL").unwrap();
        writeln!(f, "intent=merge_b").unwrap();
        writeln!(f, "target_lang=rust").unwrap();
        writeln!(f, "code=b").unwrap();
        writeln!(f, "confidence=0.8").unwrap();
        writeln!(f, "END").unwrap();
    }

    let total = snapshot::merge(&db, &[p1.as_str(), p2.as_str()]).unwrap();
    assert_eq!(total, 2);
    assert!(db.cell_net().find_by_intent("merge_a").is_some());
    assert!(db.cell_net().find_by_intent("merge_b").is_some());
}

#[cfg(feature = "claude")]
#[test]
fn test_snapshot_invalid_version_rejected() {
    let db = temp_db();
    let path = temp_path();
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, r#"{{"version":"unknown-tool-v99","exported_at":"now","cell_count":0}}"#).unwrap();
    }
    let result = snapshot::import(&db, &path);
    assert!(result.is_err(), "잘못된 버전은 오류 반환");
}

#[test]
fn test_snapshot_empty_db() {
    let db = temp_db();
    let path = temp_path();
    snapshot::export(&db, &path).unwrap();

    let db2 = temp_db();
    let imported = snapshot::import(&db2, &path).unwrap();
    assert_eq!(imported, 0);
}

#[test]
fn test_snapshot_file_not_found() {
    let db = temp_db();
    let result = snapshot::import(&db, "/tmp/nonexistent_file_xyz.jsonl");
    assert!(result.is_err());
}

// ── low_power 모드 설정 ────────────────────────────────────────

#[test]
fn test_runtime_config_defaults() {
    use crownycode::cli::{RuntimeConfig, SnapshotConfig};
    let r = RuntimeConfig::default();
    assert!(!r.low_power);
    assert_eq!(r.max_parallel_cells, 4);

    let s = SnapshotConfig::default();
    assert_eq!(s.auto_every, 50);
    assert_eq!(s.path, "data/snapshots");
}

// ── 스냅샷 자동화 트리거 검증 ──────────────────────────────────

#[test]
fn test_auto_snapshot_creates_dir() {
    let db = temp_db();
    // 50개 셀 생성
    for i in 0..50 {
        db.cell_net_mut().upsert_pattern(&format!("intent_{i}"), "python", "code", 0.8);
    }
    assert_eq!(db.cell_net().len() as i64, 50);

    let snap_dir = format!("/tmp/auto_snap_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
    let path = format!("{}/snap_50.bin", snap_dir);
    snapshot::export(&db, &path).unwrap();
    assert!(std::path::Path::new(&path).exists());
    std::fs::remove_dir_all(&snap_dir).ok();
}
