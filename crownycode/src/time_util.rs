// src/time_util.rs
// 자체 시간 유틸리티 (chrono crate 대체)

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_timestamp() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

pub fn now_rfc3339() -> String {
    let secs = now_timestamp();
    let (s, m, h, day, month, year) = secs_to_utc(secs);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, h, m, s)
}

/// 현재 연-월 문자열 (YYYY-MM)
pub fn current_year_month() -> String {
    let secs = now_timestamp();
    let (_, _, _, _, month, year) = secs_to_utc(secs);
    format!("{}-{:02}", year, month)
}

/// n개월 전 연-월 문자열
pub fn month_ago(n: u8) -> String {
    let secs = now_timestamp();
    let (_, _, _, _, month, year) = secs_to_utc(secs);
    let total_months = year * 12 + month - n as i64 - 1;
    let y = total_months / 12;
    let m = total_months % 12 + 1;
    format!("{y}-{m:02}")
}

fn secs_to_utc(ts: i64) -> (i64, i64, i64, i64, i64, i64) {
    // Unix timestamp → (sec, min, hour, day, month, year)
    let secs_per_day = 86400i64;
    let days = ts / secs_per_day;
    let time_of_day = ts % secs_per_day;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    // Days since 1970-01-01
    let mut y = 1970i64;
    let mut remaining = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }

    let months = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1i64;
    for &days_in_month in &months {
        if remaining < days_in_month { break; }
        remaining -= days_in_month;
        month += 1;
    }
    let day = remaining + 1;
    (s, m, h, day, month, y)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Parse RFC3339 string back to timestamp (for DevStore compatibility)
#[allow(dead_code)]
pub fn parse_rfc3339(s: &str) -> Option<i64> {
    let s = s.trim().trim_end_matches('Z');
    let parts: Vec<&str> = s.split('T').collect();
    if parts.len() != 2 { return None; }
    let date: Vec<i64> = parts[0].split('-').filter_map(|p| p.parse().ok()).collect();
    let time: Vec<i64> = parts[1].split(':').filter_map(|p| p.parse().ok()).collect();
    if date.len() != 3 || time.len() < 2 { return None; }

    let (year, month, day) = (date[0], date[1], date[2]);
    let (hour, min) = (time[0], time[1]);
    let sec = if time.len() >= 3 { time[2] } else { 0 };

    // Calculate days from epoch
    let mut total_days = 0i64;
    for y in 1970..year {
        total_days += if is_leap(y) { 366 } else { 365 };
    }
    let months_arr = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    for &d in months_arr.iter().take((month as usize - 1).min(11)) {
        total_days += d;
    }
    total_days += day - 1;

    Some(total_days * 86400 + hour * 3600 + min * 60 + sec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_now_timestamp_positive() {
        assert!(now_timestamp() > 0);
    }

    #[test]
    fn test_now_rfc3339_format() {
        let s = now_rfc3339();
        assert!(s.ends_with('Z'));
        assert!(s.contains('T'));
        assert_eq!(s.len(), 20); // "2026-03-21T14:32:00Z"
    }

    #[test]
    fn test_parse_rfc3339_roundtrip() {
        let s = now_rfc3339();
        let ts = parse_rfc3339(&s).unwrap();
        // Should be within 1 second of now
        assert!((ts - now_timestamp()).abs() <= 1);
    }

    #[test]
    fn test_current_year_month() {
        let ym = current_year_month();
        assert!(ym.len() == 7); // "YYYY-MM"
        assert!(ym.contains('-'));
    }

    #[test]
    fn test_known_epoch() {
        // 2024-01-01T00:00:00Z = 1704067200
        let ts = parse_rfc3339("2024-01-01T00:00:00Z").unwrap();
        assert_eq!(ts, 1704067200);
    }
}
