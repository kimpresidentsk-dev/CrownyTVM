#![allow(dead_code)]
// crownycode/src/offline/snapshot.rs
// 셀DB 스냅샷 — JSON 직렬화 (오프라인 배포용)
// RPi4 같은 저사양 장비에서 Claude API 없이 패턴 공유
//
// 포맷: JSON Lines — 한 줄 = 하나의 셀 레코드
// 압축: gzip (std::io만 사용, 외부 크레이트 최소화)

use anyhow::{Result, Context};
use std::io::{BufRead, BufReader, Write, BufWriter};
use std::fs::{File, create_dir_all};
use std::path::Path;

use crate::cell::store::CellStore;
use crate::cell::Cell;

/// 셀DB → 스냅샷 파일 (JSON Lines)
pub fn export(db: &CellStore, path: &str) -> Result<()> {
    // 디렉터리 보장
    if let Some(parent) = Path::new(path).parent() {
        create_dir_all(parent)?;
    }

    let file = File::create(path)
        .with_context(|| format!("스냅샷 파일 생성 실패: {path}"))?;
    let mut writer = BufWriter::new(file);

    // 헤더
    let header = SnapshotHeader {
        version: "crownycode-snapshot-v1".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        cell_count: db.cell_count().unwrap_or(0),
    };
    writeln!(writer, "{}", serde_json::to_string(&header)?)?;

    // 셀 레코드
    let cells = db.search("")?;
    let mut written = 0u64;
    for cell in &cells {
        let record = CellRecord::from_cell(cell);
        writeln!(writer, "{}", serde_json::to_string(&record)?)?;
        written += 1;
    }

    writer.flush()?;
    println!("  {} 셀 내보냄", written);
    Ok(())
}

/// 스냅샷 파일 → 셀DB 복원
/// 반환값: 실제로 임포트된 셀 수
pub fn import(db: &CellStore, path: &str) -> Result<u64> {
    let file = File::open(path)
        .with_context(|| format!("스냅샷 파일 없음: {path}"))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 헤더 검증
    let header_line = lines.next()
        .ok_or_else(|| anyhow::anyhow!("빈 스냅샷 파일"))??;
    let header: SnapshotHeader = serde_json::from_str(&header_line)
        .with_context(|| "스냅샷 헤더 파싱 실패")?;

    if !header.version.starts_with("crownycode-snapshot") {
        anyhow::bail!("알 수 없는 스냅샷 버전: {}", header.version);
    }

    println!("  스냅샷 헤더: {} ({})", header.version, header.exported_at);

    // 셀 레코드 임포트
    let mut imported = 0u64;
    let mut skipped = 0u64;

    for line in lines {
        let line = line?;
        if line.trim().is_empty() { continue; }

        let record: CellRecord = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("  경고: 레코드 파싱 실패 — {e}");
                skipped += 1;
                continue;
            }
        };

        // 기존 셀보다 신뢰도가 낮으면 덮어쓰지 않음
        if let Ok(Some(existing)) = db.find_by_intent(&record.intent) {
            if existing.confidence >= record.confidence {
                skipped += 1;
                continue;
            }
        }

        db.upsert_pattern(
            &record.intent,
            &record.target_lang,
            &record.code,
            record.confidence,
        )?;
        imported += 1;
    }

    if skipped > 0 {
        println!("  {} 셀 건너뜀 (기존이 더 신뢰도 높음)", skipped);
    }

    Ok(imported)
}

/// 여러 스냅샷 파일을 병합 (커뮤니티 패턴 합산용)
pub fn merge(db: &CellStore, paths: &[&str]) -> Result<u64> {
    let mut total = 0u64;
    for path in paths {
        match import(db, path) {
            Ok(n) => {
                total += n;
                println!("  {} → {}개", path, n);
            }
            Err(e) => eprintln!("  경고: {} 임포트 실패 — {}", path, e),
        }
    }
    Ok(total)
}

// ── 직렬화 구조체 ─────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct SnapshotHeader {
    version: String,
    exported_at: String,
    cell_count: i64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct CellRecord {
    intent: String,
    target_lang: String,
    code: String,
    confidence: f32,
    refutation_count: u32,
    use_count: u32,
}

impl CellRecord {
    fn from_cell(cell: &Cell) -> Self {
        Self {
            intent: cell.intent.clone(),
            target_lang: cell.target_lang.clone(),
            code: cell.code.clone(),
            confidence: cell.confidence,
            refutation_count: cell.refutation_count,
            use_count: cell.use_count,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::store::CellStore;

    fn temp_db() -> CellStore {
        CellStore::open(&format!("/tmp/snap_test_{}.db", uuid::Uuid::new_v4())).unwrap()
    }

    fn temp_path() -> String {
        format!("/tmp/snap_{}.jsonl", uuid::Uuid::new_v4())
    }

    #[test]
    fn test_export_creates_file() {
        let db = temp_db();
        db.upsert_pattern("http_server", "python", "code_a", 0.9).unwrap();
        db.upsert_pattern("sort_fn", "rust", "code_b", 0.8).unwrap();
        let path = temp_path();
        export(&db, &path).unwrap();
        assert!(std::path::Path::new(&path).exists());
    }

    #[test]
    fn test_roundtrip() {
        let db_src = temp_db();
        db_src.upsert_pattern("http_server", "python", "flask_code", 0.9).unwrap();
        db_src.upsert_pattern("cli_tool",    "rust",   "clap_code",  0.85).unwrap();

        let path = temp_path();
        export(&db_src, &path).unwrap();

        let db_dst = temp_db();
        let imported = import(&db_dst, &path).unwrap();
        assert_eq!(imported, 2);

        let cell = db_dst.find_by_intent("http_server").unwrap().unwrap();
        assert_eq!(cell.target_lang, "python");
        assert!((cell.confidence - 0.9).abs() < 0.01);
    }

    #[test]
    fn test_import_skips_lower_confidence() {
        let db = temp_db();
        db.upsert_pattern("http_server", "python", "good_code", 0.95).unwrap();

        // 낮은 신뢰도 스냅샷
        let path = temp_path();
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
            writeln!(f, r#"{{"intent":"http_server","target_lang":"python","code":"bad_code","confidence":0.5,"refutation_count":0,"use_count":0}}"#).unwrap();
        }

        let imported = import(&db, &path).unwrap();
        assert_eq!(imported, 0, "낮은 신뢰도는 건너뜀");

        // 기존 코드 유지됨
        let cell = db.find_by_intent("http_server").unwrap().unwrap();
        assert_eq!(cell.code, "good_code");
    }

    #[test]
    fn test_import_higher_confidence_overwrites() {
        let db = temp_db();
        db.upsert_pattern("sort_fn", "python", "old_code", 0.5).unwrap();

        let path = temp_path();
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
            writeln!(f, r#"{{"intent":"sort_fn","target_lang":"python","code":"new_better_code","confidence":0.95,"refutation_count":0,"use_count":10}}"#).unwrap();
        }

        let imported = import(&db, &path).unwrap();
        assert_eq!(imported, 1);
    }

    #[test]
    fn test_merge_multiple() {
        let db = temp_db();

        let p1 = temp_path();
        let p2 = temp_path();

        {
            let mut f = std::fs::File::create(&p1).unwrap();
            writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
            writeln!(f, r#"{{"intent":"intent_a","target_lang":"python","code":"a","confidence":0.9,"refutation_count":0,"use_count":0}}"#).unwrap();
        }
        {
            let mut f = std::fs::File::create(&p2).unwrap();
            writeln!(f, r#"{{"version":"crownycode-snapshot-v1","exported_at":"2024-01-01T00:00:00Z","cell_count":1}}"#).unwrap();
            writeln!(f, r#"{{"intent":"intent_b","target_lang":"rust","code":"b","confidence":0.8,"refutation_count":0,"use_count":0}}"#).unwrap();
        }

        let total = merge(&db, &[p1.as_str(), p2.as_str()]).unwrap();
        assert_eq!(total, 2);
    }

    #[test]
    fn test_export_empty_db() {
        let db = temp_db();
        let path = temp_path();
        export(&db, &path).unwrap();

        let db2 = temp_db();
        let imported = import(&db2, &path).unwrap();
        assert_eq!(imported, 0);
    }

    #[test]
    fn test_invalid_version_rejected() {
        let db = temp_db();
        let path = temp_path();
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, r#"{{"version":"other-tool-v99","exported_at":"now","cell_count":0}}"#).unwrap();
        }
        let result = import(&db, &path);
        assert!(result.is_err());
    }
}
