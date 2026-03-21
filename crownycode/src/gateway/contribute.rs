// crownycode/src/gateway/contribute.rs
// 커뮤니티 기여 관리자
// 개발자가 새 코드 패턴을 제출하면 검증 후 셀DB에 등록
// 기여 횟수에 따라 Claude API 추가 쿼터 보상

use crate::error::Result;
use crate::time_util;
use crate::cell::store::CrownyDb;
use super::quota::QuotaManager;
use std::collections::HashMap;

/// 기여 보상 정책
pub const BONUS_PER_CONTRIBUTION: u32 = 5;    // 기여 1건 = 5회 추가 쿼터
pub const MAX_BONUS_PER_MONTH: u32    = 200;   // 월 최대 보너스 쿼터

pub struct ContributeManager {
    dir: String,
}

impl ContributeManager {
    pub fn new(db_path: &str) -> Self {
        let base = db_path.trim_end_matches(".db");
        let dir = format!("{}_contributions", base);
        Self { dir }
    }

    pub fn init_schema(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
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

        // 2. 파일에 저장
        let id = self.next_id()?;
        let record = format!(
            "id={}\ndev_id={}\nintent={}\ntarget_lang={}\ncode={}\nconfidence={}\nstatus=pending\nsubmitted_at={}\n",
            id, dev_id, intent, target_lang,
            code.replace('\n', "\\n"),
            validation.confidence,
            time_util::now_rfc3339()
        );
        std::fs::write(format!("{}/{}.contrib", self.dir, id), &record)?;

        // 3. 쿼터 보너스 지급
        let quota_dir = self.dir.replace("_contributions", "_quotas");
        let qm = QuotaManager::new(&quota_dir);
        qm.init_schema().unwrap_or(());
        let note = format!("기여 #{}: {} ({})", id, intent, target_lang);
        qm.grant_contribution_bonus(dev_id, BONUS_PER_CONTRIBUTION, &note)?;

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
        let mut applied = 0u32;
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(0); }

        let mut entries: Vec<_> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "contrib").unwrap_or(false))
            .collect();
        entries.sort_by_key(|e| e.path());

        for entry in entries.iter().take(20) {
            let data = std::fs::read_to_string(entry.path())?;
            let vals = parse_kv(&data);

            let status = vals.get("status").map(|s| s.as_str()).unwrap_or("");
            if status != "pending" { continue; }

            let intent = vals.get("intent").cloned().unwrap_or_default();
            let lang = vals.get("target_lang").cloned().unwrap_or_default();
            let code = vals.get("code").cloned().unwrap_or_default()
                .replace("\\n", "\n");
            let confidence: f32 = vals.get("confidence")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.5);

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
                // Update status
                let updated = data.replace("status=pending", "status=applied");
                std::fs::write(entry.path(), updated)?;
                applied += 1;
            } else {
                let updated = data.replace("status=pending", "status=skipped");
                std::fs::write(entry.path(), updated)?;
            }
        }
        Ok(applied)
    }

    /// 기여 내역 조회
    pub fn my_contributions(&self, dev_id: &str) -> Result<Vec<ContribRecord>> {
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(Vec::new()); }

        let mut records = Vec::new();
        for entry in std::fs::read_dir(dir)?.filter_map(|e| e.ok()) {
            if !entry.path().extension().map(|x| x == "contrib").unwrap_or(false) { continue; }
            let data = std::fs::read_to_string(entry.path())?;
            let vals = parse_kv(&data);
            if vals.get("dev_id").map(|s| s.as_str()) != Some(dev_id) { continue; }

            records.push(ContribRecord {
                id: vals.get("id").and_then(|v| v.parse().ok()).unwrap_or(0),
                intent: vals.get("intent").cloned().unwrap_or_default(),
                target_lang: vals.get("target_lang").cloned().unwrap_or_default(),
                status: vals.get("status").cloned().unwrap_or_default(),
                confidence: vals.get("confidence").and_then(|v| v.parse().ok()).unwrap_or(0.5),
                submitted_at: vals.get("submitted_at").cloned().unwrap_or_default(),
            });
        }
        records.sort_by(|a, b| b.id.cmp(&a.id));
        Ok(records.into_iter().take(20).collect())
    }

    /// 기여 통계
    pub fn stats(&self) -> Result<ContribStats> {
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(ContribStats { total: 0, applied: 0, pending: 0 }); }

        let mut total = 0i64;
        let mut applied = 0i64;
        let mut pending = 0i64;

        for entry in std::fs::read_dir(dir)?.filter_map(|e| e.ok()) {
            if !entry.path().extension().map(|x| x == "contrib").unwrap_or(false) { continue; }
            let data = std::fs::read_to_string(entry.path())?;
            let vals = parse_kv(&data);
            total += 1;
            match vals.get("status").map(|s| s.as_str()) {
                Some("applied") => applied += 1,
                Some("pending") => pending += 1,
                _ => {}
            }
        }
        Ok(ContribStats { total, applied, pending })
    }

    // ── 내부 검증 ──────────────────────────────────────────────

    fn validate(&self, intent: &str, target_lang: &str, code: &str) -> Validation {
        if intent.trim().is_empty() {
            return Validation::fail("의도(intent)가 비어있습니다");
        }
        if code.trim().len() < 20 {
            return Validation::fail("코드가 너무 짧습니다 (최소 20자)");
        }
        if code.len() > 50_000 {
            return Validation::fail("코드가 너무 깁니다 (최대 50KB)");
        }

        let supported = ["python", "rust", "javascript", "typescript", "go", "c", "crowny"];
        if !supported.contains(&target_lang) {
            return Validation::fail(&format!("지원하지 않는 언어: {target_lang}"));
        }

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
            "crowny" => 0.65,
            _ => 0.60,
        };

        Validation { passed: true, confidence, reason: String::new() }
    }

    fn next_id(&self) -> Result<u32> {
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(1); }
        let max = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                e.path().file_stem()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.parse::<u32>().ok())
            })
            .max()
            .unwrap_or(0);
        Ok(max + 1)
    }
}

fn parse_kv(data: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in data.lines() {
        if let Some((key, val)) = line.split_once('=') {
            map.insert(key.to_string(), val.to_string());
        }
    }
    map
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
    use crate::cell::store::CrownyDb;

    static CONTRIB_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn unique_dir() -> String {
        let n = CONTRIB_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        format!("/tmp/contrib_test_{}_{}", ts, n)
    }

    fn temp_managers() -> (ContributeManager, QuotaManager) {
        let dir = unique_dir();
        let contrib_dir = format!("{}_contributions", dir);
        let quota_dir = format!("{}_quotas", dir);
        let cm = ContributeManager { dir: contrib_dir };
        cm.init_schema().unwrap();
        let qm = QuotaManager::new(&quota_dir);
        qm.init_schema().unwrap();
        (cm, qm)
    }

    fn temp_db() -> CrownyDb {
        let dir = unique_dir();
        CrownyDb::open(&format!("{}/cells.db", dir)).unwrap()
    }

    #[test]
    fn test_submit_valid_python() {
        let (cm, _qm) = temp_managers();
        let result = cm.submit(
            "dev_ke", "http_server", "python",
            "from flask import Flask\napp = Flask(__name__)\n@app.route('/')\ndef index(): return 'ok'"
        ).unwrap();
        assert_eq!(result.status, ContribStatus::Accepted);
        assert_eq!(result.quota_bonus, BONUS_PER_CONTRIBUTION);
    }

    #[test]
    fn test_submit_too_short_rejected() {
        let (cm, _qm) = temp_managers();
        let result = cm.submit("dev1", "http_server", "python", "short").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_submit_empty_intent_rejected() {
        let (cm, _qm) = temp_managers();
        let result = cm.submit("dev1", "", "python", "def long_enough_code(): pass  # padding").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_submit_unsupported_lang_rejected() {
        let (cm, _qm) = temp_managers();
        let result = cm.submit("dev1", "server", "brainfuck", "+-><[].,+-><[].,+-><[].,+-><").unwrap();
        assert_eq!(result.status, ContribStatus::Rejected);
    }

    #[test]
    fn test_quota_bonus_on_submit() {
        let (cm, qm) = temp_managers();

        let before = qm.status("dev_tz").unwrap().bonus_quota;
        cm.submit("dev_tz", "sort_fn", "rust",
            "pub fn sort(mut v: Vec<i64>) -> Vec<i64> { v.sort(); v }").unwrap();
        let after = qm.status("dev_tz").unwrap().bonus_quota;
        assert_eq!(after - before, BONUS_PER_CONTRIBUTION);
    }

    #[test]
    fn test_apply_to_celldb() {
        let (cm, _qm) = temp_managers();
        let db = temp_db();

        cm.submit("dev_ng", "cli_tool", "rust",
            "use clap::Parser;\n#[derive(Parser)]\nstruct Args {}\nfn main() { Args::parse(); }").unwrap();

        let applied = cm.apply_to_celldb(&db).unwrap();
        assert_eq!(applied, 1);
        assert!(db.cell_net().find_by_intent("cli_tool").is_some());
    }

    #[test]
    fn test_apply_skips_lower_confidence() {
        let (cm, _qm) = temp_managers();
        let db = temp_db();

        db.cell_net_mut().upsert_pattern("http_server", "python", "high_quality", 0.99);

        cm.submit("dev1", "http_server", "python",
            "from flask import Flask  # basic version that is long enough to pass").unwrap();

        let applied = cm.apply_to_celldb(&db).unwrap();
        assert_eq!(applied, 0);
    }

    #[test]
    fn test_my_contributions() {
        let (cm, _qm) = temp_managers();

        cm.submit("dev_bd", "json_parser", "python",
            "import json\ndef parse(s): return json.loads(s)  # simple but valid").unwrap();
        cm.submit("dev_bd", "file_reader", "rust",
            "use std::fs;\nfn read(p: &str) -> String { fs::read_to_string(p).unwrap() }").unwrap();

        let records = cm.my_contributions("dev_bd").unwrap();
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn test_stats() {
        let (cm, _qm) = temp_managers();
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
        let (cm, qm) = temp_managers();

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
