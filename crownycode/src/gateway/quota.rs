// crownycode/src/gateway/quota.rs
// 쿼터 관리자 — 월별 Claude API 무료 호출 카운터
// 무상 게이트웨이 정책:
//   - 기본 코드 생성: 무제한 무료
//   - Claude API 호출: 월 100회 무료 (기여 보너스 포함)
//   - 초과 시: 소액 과금 또는 대기열 진입

use anyhow::Result;
use chrono::{Utc, Datelike};
use rusqlite::{Connection, params};

pub struct QuotaManager<'a> {
    conn: &'a Connection,
}

impl<'a> QuotaManager<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS quotas (
                dev_id          TEXT NOT NULL,
                year_month      TEXT NOT NULL,     -- 'YYYY-MM'
                used_api_calls  INTEGER NOT NULL DEFAULT 0,
                bonus_quota     INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (dev_id, year_month)
            );
            CREATE TABLE IF NOT EXISTS quota_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dev_id      TEXT NOT NULL,
                timestamp   TEXT NOT NULL,
                call_type   TEXT NOT NULL,  -- 'api_call' | 'contribution_bonus'
                delta       INTEGER NOT NULL,
                note        TEXT
            );
        ")?;
        Ok(())
    }

    /// 현재 월 쿼터 상태 조회
    pub fn status(&self, dev_id: &str) -> Result<QuotaStatus> {
        let ym = current_year_month();
        let row = self.conn.query_row(
            "SELECT used_api_calls, bonus_quota FROM quotas WHERE dev_id=?1 AND year_month=?2",
            params![dev_id, ym],
            |r| Ok((r.get::<_,u32>(0)?, r.get::<_,u32>(1)?)),
        ).unwrap_or((0, 0));

        Ok(QuotaStatus {
            dev_id: dev_id.to_string(),
            year_month: ym,
            used_api_calls: row.0,
            bonus_quota: row.1,
            base_quota: BASE_FREE_QUOTA,
        })
    }

    /// API 호출 가능 여부 확인
    pub fn can_call_api(&self, dev_id: &str, is_free_country: bool) -> Result<bool> {
        if !is_free_country {
            // 유료 사용자는 제한 없음
            return Ok(true);
        }
        let status = self.status(dev_id)?;
        Ok(status.remaining() > 0)
    }

    /// API 호출 사용 기록
    pub fn consume_api_call(&self, dev_id: &str, note: Option<&str>) -> Result<()> {
        let ym = current_year_month();
        self.conn.execute(
            "INSERT INTO quotas (dev_id, year_month, used_api_calls, bonus_quota)
             VALUES (?1, ?2, 1, 0)
             ON CONFLICT(dev_id, year_month) DO UPDATE SET
             used_api_calls = used_api_calls + 1",
            params![dev_id, ym],
        )?;
        self.conn.execute(
            "INSERT INTO quota_log (dev_id, timestamp, call_type, delta, note)
             VALUES (?1, ?2, 'api_call', -1, ?3)",
            params![dev_id, Utc::now().to_rfc3339(), note.unwrap_or("")],
        )?;
        Ok(())
    }

    /// 기여 보너스 쿼터 지급
    pub fn grant_contribution_bonus(&self, dev_id: &str, amount: u32, note: &str) -> Result<()> {
        let ym = current_year_month();
        self.conn.execute(
            "INSERT INTO quotas (dev_id, year_month, used_api_calls, bonus_quota)
             VALUES (?1, ?2, 0, ?3)
             ON CONFLICT(dev_id, year_month) DO UPDATE SET
             bonus_quota = bonus_quota + ?3",
            params![dev_id, ym, amount],
        )?;
        self.conn.execute(
            "INSERT INTO quota_log (dev_id, timestamp, call_type, delta, note)
             VALUES (?1, ?2, 'contribution_bonus', ?3, ?4)",
            params![dev_id, Utc::now().to_rfc3339(), amount as i32, note],
        )?;
        Ok(())
    }

    /// 월별 사용 내역 조회
    pub fn history(&self, dev_id: &str, months: u8) -> Result<Vec<QuotaStatus>> {
        let mut statuses = Vec::new();
        for i in 0..months {
            let ym = month_ago(i);
            let row = self.conn.query_row(
                "SELECT used_api_calls, bonus_quota FROM quotas WHERE dev_id=?1 AND year_month=?2",
                params![dev_id, ym],
                |r| Ok((r.get::<_,u32>(0)?, r.get::<_,u32>(1)?)),
            ).unwrap_or((0, 0));
            statuses.push(QuotaStatus {
                dev_id: dev_id.to_string(),
                year_month: ym,
                used_api_calls: row.0,
                bonus_quota: row.1,
                base_quota: BASE_FREE_QUOTA,
            });
        }
        Ok(statuses)
    }
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
    /// 총 허용 쿼터 (기본 + 보너스)
    pub fn total_quota(&self) -> u32 {
        self.base_quota + self.bonus_quota
    }

    /// 남은 쿼터
    pub fn remaining(&self) -> u32 {
        self.total_quota().saturating_sub(self.used_api_calls)
    }

    /// 사용률 (0.0~1.0)
    pub fn usage_rate(&self) -> f32 {
        if self.total_quota() == 0 { return 1.0; }
        self.used_api_calls as f32 / self.total_quota() as f32
    }
}

fn current_year_month() -> String {
    let now = Utc::now();
    format!("{}-{:02}", now.year(), now.month())
}

fn month_ago(n: u8) -> String {
    let now = Utc::now();
    let total_months = now.year() * 12 + now.month() as i32 - n as i32 - 1;
    let y = total_months / 12;
    let m = total_months % 12 + 1;
    format!("{y}-{m:02}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn temp_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        let qm = QuotaManager::new(&conn);
        qm.init_schema().unwrap();
        conn
    }

    #[test]
    fn test_initial_status_zero() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.used_api_calls, 0);
        assert_eq!(s.remaining(), BASE_FREE_QUOTA);
    }

    #[test]
    fn test_consume_decrements_remaining() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        qm.consume_api_call("dev1", None).unwrap();
        qm.consume_api_call("dev1", None).unwrap();
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.used_api_calls, 2);
        assert_eq!(s.remaining(), BASE_FREE_QUOTA - 2);
    }

    #[test]
    fn test_can_call_api_within_quota() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        assert!(qm.can_call_api("dev1", true).unwrap());
    }

    #[test]
    fn test_quota_exhausted() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        // 100번 소비
        for _ in 0..100 {
            qm.consume_api_call("dev1", None).unwrap();
        }
        assert!(!qm.can_call_api("dev1", true).unwrap());
    }

    #[test]
    fn test_bonus_extends_quota() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        // 100번 소비
        for _ in 0..100 { qm.consume_api_call("dev1", None).unwrap(); }
        assert!(!qm.can_call_api("dev1", true).unwrap());

        // 보너스 50 지급
        qm.grant_contribution_bonus("dev1", 50, "패턴 기여").unwrap();
        assert!(qm.can_call_api("dev1", true).unwrap());
        let s = qm.status("dev1").unwrap();
        assert_eq!(s.remaining(), 50);
    }

    #[test]
    fn test_non_free_country_unlimited() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        // 200번 소비해도 유료 사용자는 항상 true
        for _ in 0..200 { qm.consume_api_call("paid_dev", None).unwrap(); }
        assert!(qm.can_call_api("paid_dev", false).unwrap());
    }

    #[test]
    fn test_usage_rate() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        for _ in 0..50 { qm.consume_api_call("dev1", None).unwrap(); }
        let s = qm.status("dev1").unwrap();
        assert!((s.usage_rate() - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_history_returns_months() {
        let conn = temp_conn();
        let qm = QuotaManager::new(&conn);
        qm.consume_api_call("dev1", None).unwrap();
        let history = qm.history("dev1", 3).unwrap();
        assert_eq!(history.len(), 3);
        // 현재 월은 1회 사용됨
        assert_eq!(history[0].used_api_calls, 1);
    }
}
