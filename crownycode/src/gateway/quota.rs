// crownycode/src/gateway/quota.rs
// 쿼터 관리자 — 월별 Claude API 무료 호출 카운터 (파일 기반)

use crate::error::Result;
use crate::time_util;
use std::collections::HashMap;

pub struct QuotaManager {
    dir: String,
}

impl QuotaManager {
    pub fn new(dir: &str) -> Self {
        Self { dir: dir.to_string() }
    }

    pub fn init_schema(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        Ok(())
    }

    /// 현재 월 쿼터 상태 조회
    pub fn status(&self, dev_id: &str) -> Result<QuotaStatus> {
        let ym = current_year_month();
        let path = self.quota_path(dev_id, &ym);
        if std::path::Path::new(&path).exists() {
            let data = std::fs::read_to_string(&path)?;
            let vals = parse_kv(&data);
            Ok(QuotaStatus {
                dev_id: dev_id.to_string(),
                year_month: ym,
                used_api_calls: vals.get("used_api_calls").and_then(|v| v.parse().ok()).unwrap_or(0),
                bonus_quota: vals.get("bonus_quota").and_then(|v| v.parse().ok()).unwrap_or(0),
                base_quota: BASE_FREE_QUOTA,
            })
        } else {
            Ok(QuotaStatus {
                dev_id: dev_id.to_string(),
                year_month: ym,
                used_api_calls: 0,
                bonus_quota: 0,
                base_quota: BASE_FREE_QUOTA,
            })
        }
    }

    /// API 호출 가능 여부 확인
    pub fn can_call_api(&self, dev_id: &str, is_free_country: bool) -> Result<bool> {
        if !is_free_country {
            return Ok(true);
        }
        let status = self.status(dev_id)?;
        Ok(status.remaining() > 0)
    }

    /// API 호출 사용 기록
    pub fn consume_api_call(&self, dev_id: &str, _note: Option<&str>) -> Result<()> {
        let ym = current_year_month();
        let mut status = self.status(dev_id)?;
        status.used_api_calls += 1;
        self.save_quota(&status)?;

        // Log
        let log_path = format!("{}/log_{}.txt", self.dir, dev_id);
        let log_line = format!("{} api_call -1\n", time_util::now_rfc3339());
        let mut existing = std::fs::read_to_string(&log_path).unwrap_or_default();
        existing.push_str(&log_line);
        std::fs::write(&log_path, existing)?;
        let _ = ym; // suppress unused warning
        Ok(())
    }

    /// 기여 보너스 쿼터 지급
    pub fn grant_contribution_bonus(&self, dev_id: &str, amount: u32, _note: &str) -> Result<()> {
        let mut status = self.status(dev_id)?;
        status.bonus_quota += amount;
        self.save_quota(&status)?;
        Ok(())
    }

    /// 월별 사용 내역 조회
    pub fn history(&self, dev_id: &str, months: u8) -> Result<Vec<QuotaStatus>> {
        let mut statuses = Vec::new();
        for i in 0..months {
            let ym = month_ago(i);
            let path = self.quota_path(dev_id, &ym);
            if std::path::Path::new(&path).exists() {
                let data = std::fs::read_to_string(&path)?;
                let vals = parse_kv(&data);
                statuses.push(QuotaStatus {
                    dev_id: dev_id.to_string(),
                    year_month: ym,
                    used_api_calls: vals.get("used_api_calls").and_then(|v| v.parse().ok()).unwrap_or(0),
                    bonus_quota: vals.get("bonus_quota").and_then(|v| v.parse().ok()).unwrap_or(0),
                    base_quota: BASE_FREE_QUOTA,
                });
            } else {
                statuses.push(QuotaStatus {
                    dev_id: dev_id.to_string(),
                    year_month: ym,
                    used_api_calls: 0,
                    bonus_quota: 0,
                    base_quota: BASE_FREE_QUOTA,
                });
            }
        }
        Ok(statuses)
    }

    fn quota_path(&self, dev_id: &str, ym: &str) -> String {
        format!("{}/{}_{}.quota", self.dir, dev_id, ym)
    }

    fn save_quota(&self, status: &QuotaStatus) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let path = self.quota_path(&status.dev_id, &status.year_month);
        let data = format!(
            "used_api_calls={}\nbonus_quota={}\n",
            status.used_api_calls, status.bonus_quota
        );
        std::fs::write(&path, data)?;
        Ok(())
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

/// 기본 무료 쿼터 (월 100회)
pub const BASE_FREE_QUOTA: u32 = 100;

/// 쿼터 상태
#[derive(Debug, Clone)]
pub struct QuotaStatus {
    pub dev_id: String,
    pub year_month: String,
    pub used_api_calls: u32,
    pub bonus_quota: u32,
    pub base_quota: u32,
}

impl QuotaStatus {
    pub fn total_quota(&self) -> u32 {
        self.base_quota + self.bonus_quota
    }

    pub fn remaining(&self) -> u32 {
        self.total_quota().saturating_sub(self.used_api_calls)
    }

    pub fn usage_rate(&self) -> f32 {
        if self.total_quota() == 0 { return 1.0; }
        self.used_api_calls as f32 / self.total_quota() as f32
    }
}

fn current_year_month() -> String {
    time_util::current_year_month()
}

fn month_ago(n: u8) -> String {
    time_util::month_ago(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    static QUOTA_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn temp_qm() -> QuotaManager {
        let n = QUOTA_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = format!("/tmp/quota_test_{}_{}/quotas", ts, n);
        let qm = QuotaManager::new(&dir);
        qm.init_schema().unwrap();
        qm
    }

    #[test]
    fn test_initial_status_zero() {
        let qm = temp_qm();
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.used_api_calls, 0);
        assert_eq!(s.remaining(), BASE_FREE_QUOTA);
    }

    #[test]
    fn test_consume_decrements_remaining() {
        let qm = temp_qm();
        qm.consume_api_call("dev1", None).unwrap();
        qm.consume_api_call("dev1", None).unwrap();
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.used_api_calls, 2);
        assert_eq!(s.remaining(), BASE_FREE_QUOTA - 2);
    }

    #[test]
    fn test_can_call_api_within_quota() {
        let qm = temp_qm();
        assert!(qm.can_call_api("dev1", true).unwrap());
    }

    #[test]
    fn test_quota_exhausted() {
        let qm = temp_qm();
        for _ in 0..100 {
            qm.consume_api_call("dev1", None).unwrap();
        }
        assert!(!qm.can_call_api("dev1", true).unwrap());
    }

    #[test]
    fn test_bonus_extends_quota() {
        let qm = temp_qm();
        for _ in 0..100 { qm.consume_api_call("dev1", None).unwrap(); }
        assert!(!qm.can_call_api("dev1", true).unwrap());

        qm.grant_contribution_bonus("dev1", 50, "패턴 기여").unwrap();
        assert!(qm.can_call_api("dev1", true).unwrap());
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.remaining(), 50);
    }

    #[test]
    fn test_non_free_country_unlimited() {
        let qm = temp_qm();
        for _ in 0..200 { qm.consume_api_call("paid_dev", None).unwrap(); }
        assert!(qm.can_call_api("paid_dev", false).unwrap());
    }

    #[test]
    fn test_usage_rate() {
        let qm = temp_qm();
        for _ in 0..50 { qm.consume_api_call("dev1", None).unwrap(); }
        let s = qm.status("dev1").unwrap();
        assert!((s.usage_rate() - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_history_returns_months() {
        let qm = temp_qm();
        qm.consume_api_call("dev1", None).unwrap();
        let history = qm.history("dev1", 3).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].used_api_calls, 1);
    }
}
