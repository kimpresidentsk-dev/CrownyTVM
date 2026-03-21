#![allow(dead_code)]
// crownycode/src/offline/snapshot.rs
// 셀DB 스냅샷 — 텍스트 직렬화 (오프라인 배포용)
// RPi4 같은 저사양 장비에서 Claude API 없이 패턴 공유
//
// 포맷: 자체 텍스트 형식 (serde 불필요)
// 헤더 줄 + 셀 레코드 (key=value 줄)

use crate::error::{Result, err};
use std::io::{BufRead, BufReader, Write, BufWriter};
use std::fs::{File, create_dir_all};
use std::path::Path;

use crate::cell::store::CrownyDb;

/// 셀DB → 스냅샷 파일
pub fn export(db: &CrownyDb, path: &str) -> Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        create_dir_all(parent)?;
    }

    let file = File::create(path)
        .map_err(|e| err!("스냅샷 파일 생성 실패: {}: {}", path, e))?;
    let mut writer = BufWriter::new(file);

    let net = db.cell_net();

    // 헤더
    writeln!(writer, "VERSION=crownycode-snapshot-v1")?;
    writeln!(writer, "EXPORTED_AT={}", crate::time_util::now_rfc3339())?;
    writeln!(writer, "CELL_COUNT={}", net.len())?;
    writeln!(writer, "---")?;

    // 셀 레코드
    let cells = net.search("");
    let mut written = 0u64;
    for cell in &cells {
        let (target_lang, code) = cell.best_pattern()
            .map(|p| (p.target_lang.clone(), p.code.clone()))
            .unwrap_or_default();
        // Encode code as base64-ish to handle newlines: escape newlines
        let code_escaped = code.replace('\\', "\\\\").replace('\n', "\\n");
        writeln!(writer, "CELL")?;
        writeln!(writer, "intent={}", cell.intent)?;
        writeln!(writer, "target_lang={}", target_lang)?;
        writeln!(writer, "code={}", code_escaped)?;
        writeln!(writer, "confidence={}", cell.energy)?;
        writeln!(writer, "refutation_count={}", cell.refutation_count)?;
        writeln!(writer, "use_count={}", cell.activation_count)?;
        writeln!(writer, "END")?;
        written += 1;
    }

    writer.flush()?;
    println!("  {} 셀 내보냄", written);
    Ok(())
}

/// 스냅샷 파일 → 셀DB 복원
pub fn import(db: &CrownyDb, path: &str) -> Result<u64> {
    let file = File::open(path)
        .map_err(|e| err!("스냅샷 파일 없음: {}: {}", path, e))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // 헤더 검증
    let mut version = String::new();
    let mut exported_at = String::new();

    // Parse header lines until ---
    for line in lines.by_ref() {
        let line = line?;
        let line = line.trim().to_string();
        if line == "---" { break; }
        if let Some(val) = line.strip_prefix("VERSION=") {
            version = val.to_string();
        } else if let Some(val) = line.strip_prefix("EXPORTED_AT=") {
            exported_at = val.to_string();
        }
    }

    if version.is_empty() {
        // Try JSON format (backward compat)
        return import_json_compat(db, path);
    }

    if !version.starts_with("crownycode-snapshot") {
        return Err(err!("알 수 없는 스냅샷 버전: {}", version));
    }

    println!("  스냅샷 헤더: {} ({})", version, exported_at);

    // 셀 레코드 임포트
    let mut imported = 0u64;
    let mut skipped = 0u64;

    let mut current_record: Option<CellRecord> = None;

    for line in lines {
        let line = line?;
        let line = line.trim().to_string();
        if line.is_empty() { continue; }

        if line == "CELL" {
            current_record = Some(CellRecord::default());
            continue;
        }
        if line == "END" {
            if let Some(record) = current_record.take() {
                // 기존 셀보다 신뢰도가 낮으면 덮어쓰지 않음
                let should_import = {
                    let net = db.cell_net();
                    match net.find_by_intent(&record.intent) {
                        Some(existing) => existing.energy < record.confidence,
                        None => true,
                    }
                };

                if should_import && !record.intent.is_empty() {
                    let code = record.code.replace("\\n", "\n").replace("\\\\", "\\");
                    db.cell_net_mut().upsert_pattern(
                        &record.intent,
                        &record.target_lang,
                        &code,
                        record.confidence,
                    );
                    db.save_net()?;
                    imported += 1;
                } else {
                    skipped += 1;
                }
            }
            continue;
        }

        if let Some(ref mut record) = current_record {
            if let Some(val) = line.strip_prefix("intent=") {
                record.intent = val.to_string();
            } else if let Some(val) = line.strip_prefix("target_lang=") {
                record.target_lang = val.to_string();
            } else if let Some(val) = line.strip_prefix("code=") {
                record.code = val.to_string();
            } else if let Some(val) = line.strip_prefix("confidence=") {
                record.confidence = val.parse().unwrap_or(0.5);
            }
        }
    }

    if skipped > 0 {
        println!("  {} 셀 건너뜀 (기존이 더 신뢰도 높음)", skipped);
    }

    Ok(imported)
}

/// JSON Lines 형식 호환 임포트 (기존 스냅샷 파일 지원)
fn import_json_compat(db: &CrownyDb, path: &str) -> Result<u64> {
    #[cfg(feature = "claude")]
    {
        let file = File::open(path)
            .map_err(|e| err!("스냅샷 파일 없음: {}: {}", path, e))?;
        let reader = BufReader::new(file);
        let mut lines = reader.lines();

        // 첫 줄: 헤더
        let header_line = lines.next()
            .ok_or_else(|| err!("빈 스냅샷 파일"))??;
        let header: serde_json::Value = serde_json::from_str(&header_line)
            .map_err(|e| err!("스냅샷 헤더 파싱 실패: {}", e))?;

        let version = header["version"].as_str().unwrap_or("");
        if !version.starts_with("crownycode-snapshot") {
            return Err(err!("알 수 없는 스냅샷 버전: {}", version));
        }

        let mut imported = 0u64;

        for line in lines {
            let line = line?;
            if line.trim().is_empty() { continue; }

            let record: serde_json::Value = match serde_json::from_str(&line) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("  경고: 레코드 파싱 실패 — {e}");
                    continue;
                }
            };

            let intent = record["intent"].as_str().unwrap_or("").to_string();
            let target_lang = record["target_lang"].as_str().unwrap_or("").to_string();
            let code = record["code"].as_str().unwrap_or("").to_string();
            let confidence = record["confidence"].as_f64().unwrap_or(0.5) as f32;

            let should_import = {
                let net = db.cell_net();
                match net.find_by_intent(&intent) {
                    Some(existing) => existing.energy < confidence,
                    None => true,
                }
            };

            if should_import && !intent.is_empty() {
                db.cell_net_mut().upsert_pattern(&intent, &target_lang, &code, confidence);
                db.save_net()?;
                imported += 1;
            }
        }
        Ok(imported)
    }

    #[cfg(not(feature = "claude"))]
    {
        let _ = db;
        let _ = path;
        Err(err!("JSON 스냅샷 임포트는 --features claude 필요"))
    }
}

/// 여러 스냅샷 파일을 병합
pub fn merge(db: &CrownyDb, paths: &[&str]) -> Result<u64> {
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

#[derive(Debug, Default)]
struct CellRecord {
    intent: String,
    target_lang: String,
    code: String,
    confidence: f32,
    refutation_count: u32,
    use_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::store::CrownyDb;
    use std::io::Write;

    static TEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    fn unique_id() -> String {
        let n = TEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        format!("{}_{}", ts, n)
    }

    fn temp_db() -> CrownyDb {
        CrownyDb::open(&format!("/tmp/snap_test_{}.db", unique_id())).unwrap()
    }

    fn temp_path() -> String {
        format!("/tmp/snap_{}.snap", unique_id())
    }

    #[test]
    fn test_export_creates_file() {
        let db = temp_db();
        db.cell_net_mut().upsert_pattern("http_server", "python", "code_a", 0.9);
        db.cell_net_mut().upsert_pattern("sort_fn", "rust", "code_b", 0.8);
        let path = temp_path();
        export(&db, &path).unwrap();
        assert!(std::path::Path::new(&path).exists());
    }

    #[test]
    fn test_roundtrip() {
        let db_src = temp_db();
        db_src.cell_net_mut().upsert_pattern("http_server", "python", "flask_code", 0.9);
        db_src.cell_net_mut().upsert_pattern("cli_tool",    "rust",   "clap_code",  0.85);

        let path = temp_path();
        export(&db_src, &path).unwrap();

        let db_dst = temp_db();
        let imported = import(&db_dst, &path).unwrap();
        assert_eq!(imported, 2);

        let net = db_dst.cell_net();
        let cell = net.find_by_intent("http_server").unwrap();
        assert_eq!(cell.best_pattern().unwrap().target_lang, "python");
        assert!((cell.energy - 0.9).abs() < 0.01);
    }

    #[test]
    fn test_import_skips_lower_confidence() {
        let db = temp_db();
        db.cell_net_mut().upsert_pattern("http_server", "python", "good_code", 0.95);

        let path = temp_path();
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
            writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
            writeln!(f, "CELL_COUNT=1").unwrap();
            writeln!(f, "---").unwrap();
            writeln!(f, "CELL").unwrap();
            writeln!(f, "intent=http_server").unwrap();
            writeln!(f, "target_lang=python").unwrap();
            writeln!(f, "code=bad_code").unwrap();
            writeln!(f, "confidence=0.5").unwrap();
            writeln!(f, "END").unwrap();
        }

        let imported = import(&db, &path).unwrap();
        assert_eq!(imported, 0, "낮은 신뢰도는 건너뜀");

        let net = db.cell_net();
        let cell = net.find_by_intent("http_server").unwrap();
        assert_eq!(cell.best_pattern().unwrap().code, "good_code");
    }

    #[test]
    fn test_import_higher_confidence_overwrites() {
        let db = temp_db();
        db.cell_net_mut().upsert_pattern("sort_fn", "python", "old_code", 0.5);

        let path = temp_path();
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
            writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
            writeln!(f, "CELL_COUNT=1").unwrap();
            writeln!(f, "---").unwrap();
            writeln!(f, "CELL").unwrap();
            writeln!(f, "intent=sort_fn").unwrap();
            writeln!(f, "target_lang=python").unwrap();
            writeln!(f, "code=new_better_code").unwrap();
            writeln!(f, "confidence=0.95").unwrap();
            writeln!(f, "END").unwrap();
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
            writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
            writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
            writeln!(f, "CELL_COUNT=1").unwrap();
            writeln!(f, "---").unwrap();
            writeln!(f, "CELL").unwrap();
            writeln!(f, "intent=intent_a").unwrap();
            writeln!(f, "target_lang=python").unwrap();
            writeln!(f, "code=a").unwrap();
            writeln!(f, "confidence=0.9").unwrap();
            writeln!(f, "END").unwrap();
        }
        {
            let mut f = std::fs::File::create(&p2).unwrap();
            writeln!(f, "VERSION=crownycode-snapshot-v1").unwrap();
            writeln!(f, "EXPORTED_AT=2024-01-01T00:00:00Z").unwrap();
            writeln!(f, "CELL_COUNT=1").unwrap();
            writeln!(f, "---").unwrap();
            writeln!(f, "CELL").unwrap();
            writeln!(f, "intent=intent_b").unwrap();
            writeln!(f, "target_lang=rust").unwrap();
            writeln!(f, "code=b").unwrap();
            writeln!(f, "confidence=0.8").unwrap();
            writeln!(f, "END").unwrap();
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
            writeln!(f, "VERSION=other-tool-v99").unwrap();
            writeln!(f, "---").unwrap();
        }
        let result = import(&db, &path);
        assert!(result.is_err());
    }
}
