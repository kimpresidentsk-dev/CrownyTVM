// crownycode/src/gateway/contribute.rs
// 커뮤니티 기여 관리자
// 개발자가 새 코드 패턴을 제출하면 검증 후 셀DB에 등록
// 기여 횟수에 따라 Claude API 추가 쿼터 보상

use anyhow::Result;
use chrono::Utc;
use rusqlite::{Connection, params};
use crate::cell::store::CrownyDb;
use super::quota::QuotaManager;

/// 기여 보상 정책
pub const BONUS_PER_CONTRIBUTION: u32 = 5;    // 기여 1건 = 5회 추가 쿼터
pub const MAX_BONUS_PER_MONTH: u32    = 200;   // 월 최대 보너스 쿼터

pub struct ContributeManager<'a> {
    conn: &'a Connection,
}

impl<'a> ContributeManager<'a> {
    pub fn new(conn: &'a Connection) -> Self { Self { conn } }

    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS contributions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dev_id      TEXT NOT NULL,
                intent      TEXT NOT NULL,
                target_lang TEXT NOT NULL,
                code        TEXT NOT NULL,
                confidence  REAL NOT NULL DEFAULT 0.5,
                status      TEXT NOT NULL DEFAULT 'pending',
                submitted_at TEXT NOT NULL,
                reviewed_at  TEXT,
                review_note  TEXT
            );
        ")?;
        Ok(())
    }

    /// 새 패턴 제출 — 검증 파이프라인 진입
    pub fn submit(
        &self,
        dev_id: &str,
        intent: &str,
        target_lang: &str,
        code: &str,
    ) -> Result<ContributionResult> {
        // 1. 기초 검증
        let validation = self.validate(intent, target_lang, code);
        if !validation.passed {
            return Ok(ContributionResult {
                id: 0,
                status: ContribStatus::Rejected,
                message: validation.reason,
                quota_bonus: 0,
            });
        }

        // 2. DB에 저장
        self.conn.execute(
            "INSERT INTO contributions (dev_id, intent, target_lang, code, confidence, submitted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                dev_id, intent, target_lang, code,
                validation.confidence, Utc::now().to_rfc3339()
            ],
        )?;
        let id = self.conn.last_insert_rowid() as u32;

        // 3. 쿼터 보너스 지급
        let qm = QuotaManager::new(self.conn);
        let note = format!("기여 #{id}: {intent} ({target_lang})");
        qm.grant_contribution_bonus(dev_id, BONUS_PER_CONTRIBUTION, &note)?;

        // 4. 개발자 기여 횟수 업데이트
        self.conn.execute(
            "UPDATE developers SET contributions = contributions + 1 WHERE dev_id = ?1",
            params![dev_id],
        ).ok(); // 개발자 테이블이 없어도 무시

        Ok(ContributionResult {
            id,
            status: ContribStatus::Accepted,
            message: format!(
                "기여 승인! +{BONUS_PER_CONTRIBUTION}회 쿼터 지급 (의도: {intent}, 언어: {target_lang})"
            ),
            quota_bonus: BONUS_PER_CONTRIBUTION,
        })
    }

    /// 승인된 기여를 셀DB에 반영
    pub fn apply_to_celldb(&self, db: &CrownyDb) -> Result<u32> {
        let mut stmt = self.conn.prepare(
            "SELECT id, intent, target_lang, code, confidence FROM contributions
             WHERE status = 'pending' ORDER BY id ASC LIMIT 20"
        )?;
        let rows: Vec<(i64, String, String, String, f32)> = stmt.query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?.filter_map(|r| r.ok()).collect();

        let mut applied = 0u32;
        for (cid, intent, lang, code, confidence) in rows {
            // 기존 셀보다 신뢰도가 높거나 없을 때만 적용
            let should_apply = {
                let net = db.cell_net();
                match net.find_by_intent(&intent) {
                    Some(existing) => confidence > existing.energy,
                    None => true,
                }
            };

            if should_apply {
                db.cell_net_mut().upsert_pattern(&intent, &lang, &code, confidence);
                let _ = db.save_net();
                self.conn.execute(
                    "UPDATE contributions SET status='applied', reviewed_at=?1 WHERE id=?2",
                    params![Utc::now().to_rfc3339(), cid],
                )?;
                applied += 1;
            } else {
                self.conn.execute(
                    "UPDATE contributions SET status='skipped', review_note='lower confidence' WHERE id=?1",
                    params![cid],
                )?;
            }
        }
        Ok(applied)
    }

    /// 기여 내역 조회
    pub fn my_contributions(&self, dev_id: &str) -> Result<Vec<ContribRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, intent, target_lang, status, confidence, submitted_at
             FROM contributions WHERE dev_id=?1 ORDER BY id DESC LIMIT 20"
        )?;
        let records = stmt.query_map(params![dev_id], |r| {
            Ok(ContribRecord {
                id: r.get(0)?,
                intent: r.get(1)?,
                target_lang: r.get(2)?,
                status: r.get(3)?,
                confidence: r.get(4)?,
                submitted_at: r.get(5)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(records)
    }

    /// 기여 통계
    pub fn stats(&self) -> Result<ContribStats> {
        let total: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contributions", [], |r| r.get(0)
        ).unwrap_or(0);
        let applied: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contributions WHERE status='applied'", [], |r| r.get(0)
        ).unwrap_or(0);
        let pending: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM contributions WHERE status='pending'", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok(ContribStats { total, applied, pending })
    }

    // ── 내부 검증 ──────────────────────────────────────────────

    fn validate(&self, intent: &str, target_lang: &str, code: &str) -> Validation {
        // 1. 필수 필드 검증
        if intent.trim().is_empty() {
            return Validation::fail("의도(intent)가 비어있습니다");
        }
        if code.trim().len() < 20 {
            return Validation::fail("코드가 너무 짧습니다 (최소 20자)");
        }
        if code.len() > 50_000 {
            return Validation::fail("코드가 너무 깁니다 (최대 50KB)");
        }

        // 2. 지원 언어 확인
        let supported = ["python", "rust", "javascript", "typescript", "go", "c", "crowny"];
        if !supported.contains(&target_lang) {
            return Validation::fail(&format!("지원하지 않는 언어: {target_lang}"));
        }

        // 3. 기본 코드 패턴 검증 (언어별)
        let confidence = match target_lang {
            "python" => {
                let has_def = code.contains("def ") || code.contains("class ");
                let has_import = code.contains("import ") || code.contains("from ");
                if has_def { 0.75 } else if has_import { 0.60 } else { 0.50 }
            }
            "rust" => {
                let has_fn = code.contains("fn ") || code.contains("impl ");
                if has_fn { 0.75 } else { 0.55 }
            }
            "crowny" => 0.65, // 크라우니어는 자동 승인
            _ => 0.60,
        };

        Validation { passed: true, confidence, reason: String::new() }
    }
}

struct Validation {
    passed: bool,
    confidence: f32,
    reason: String,
}

impl Validation {
    fn fail(reason: &str) -> Self {
        Self { passed: false, confidence: 0.0, reason: reason.to_string() }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ContribStatus { Accepted, Rejected }

#[derive(Debug)]
pub struct ContributionResult {
    pub id: u32,
    pub status: ContribStatus,
    pub message: String,
    pub quota_bonus: u32,
}

#[derive(Debug)]
pub struct ContribRecord {
    pub id: i64,
    pub intent: String,
    pub target_lang: String,
    pub status: String,
    pub confidence: f32,
    pub submitted_at: String,
}

#[derive(Debug)]
pub struct ContribStats {
    pub total: i64,
    pub applied: i64,
    pub pending: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::cell::store::CrownyDb;

    fn temp_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        QuotaManager::new(&conn).init_schema().unwrap();
        ContributeManager::new(&conn).init_schema().unwrap();
        conn
    }

    fn temp_db() -> CrownyDb {
        CrownyDb::open(&format!("/tmp/contrib_{}.db", uuid::Uuid::new_v4())).unwrap()
    }

    #[test]
    fn test_submit_valid_python() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let result = cm.submit(
            "dev_ke", "http_server", "python",
            "from flask import Flask\napp = Flask(__name__)\n@app.route('/')\ndef index(): return 'ok'"
        ).unwrap();
        assert_eq!(result.status, ContribStatus::Accepted);
        assert_eq!(result.quota_bonus, BONUS_PER_CONTRIBUTION);
    }

    #[test]
    fn test_submit_too_short_rejected() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let result = cm.submit("dev1", "http_server", "python", "short").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_submit_empty_intent_rejected() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let result = cm.submit("dev1", "", "python", "def long_enough_code(): pass  # padding").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_submit_unsupported_lang_rejected() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let result = cm.submit("dev1", "server", "brainfuck", "+-><[].,+-><[].,+-><[].,+-><").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_quota_bonus_on_submit() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let qm = QuotaManager::new(&conn);

        let before = qm.status("dev_tz").unwrap().bonus_quota;
        cm.submit("dev_tz", "sort_fn", "rust",
            "pub fn sort(mut v: Vec<i64>) -> Vec<i64> { v.sort(); v }").unwrap();
        let after = qm.status("dev_tz").unwrap().bonus_quota;
        assert_eq!(after - before, BONUS_PER_CONTRIBUTION);
    }

    #[test]
    fn test_apply_to_celldb() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let db = temp_db();

        cm.submit("dev_ng", "cli_tool", "rust",
            "use clap::Parser;\n#[derive(Parser)]\nstruct Args {}\nfn main() { Args::parse(); }").unwrap();

        let applied = cm.apply_to_celldb(&db).unwrap();
        assert_eq!(applied, 1);
        assert!(db.cell_net().find_by_intent("cli_tool").is_some());
    }

    #[test]
    fn test_apply_skips_lower_confidence() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let db = temp_db();

        // 이미 높은 신뢰도 셀 존재
        db.cell_net_mut().upsert_pattern("http_server", "python", "high_quality", 0.99);

        // 낮은 신뢰도 기여 제출
        cm.submit("dev1", "http_server", "python",
            "from flask import Flask  # basic version that is long enough to pass").unwrap();

        let applied = cm.apply_to_celldb(&db).unwrap();
        assert_eq!(applied, 0);
    }

    #[test]
    fn test_my_contributions() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);

        cm.submit("dev_bd", "json_parser", "python",
            "import json\ndef parse(s): return json.loads(s)  # simple but valid").unwrap();
        cm.submit("dev_bd", "file_reader", "rust",
            "use std::fs;\nfn read(p: &str) -> String { fs::read_to_string(p).unwrap() }").unwrap();

        let records = cm.my_contributions("dev_bd").unwrap();
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn test_stats() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let db = temp_db();

        cm.submit("dev1", "sort_fn", "python",
            "def sort(lst): return sorted(lst)  # simple and clean sort function").unwrap();
        cm.apply_to_celldb(&db).unwrap();

        let stats = cm.stats().unwrap();
        assert_eq!(stats.total, 1);
        assert_eq!(stats.applied, 1);
        assert_eq!(stats.pending, 0);
    }

    #[test]
    fn test_multiple_contributors_independent_quota() {
        let conn = temp_conn();
        let cm = ContributeManager::new(&conn);
        let qm = QuotaManager::new(&conn);

        cm.submit("dev_ke", "http_server", "python",
            "from flask import Flask\napp=Flask(__name__)\n@app.route('/')\ndef i(): return 'hi'").unwrap();
        cm.submit("dev_tz", "cli_tool", "rust",
            "use clap::Parser;\n#[derive(Parser)]\nstruct A{}\nfn main(){A::parse();}").unwrap();

        let ke = qm.status("dev_ke").unwrap().bonus_quota;
        let tz = qm.status("dev_tz").unwrap().bonus_quota;
        assert_eq!(ke, BONUS_PER_CONTRIBUTION);
        assert_eq!(tz, BONUS_PER_CONTRIBUTION);
    }
}
