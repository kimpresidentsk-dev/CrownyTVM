// crownycode/src/phase/signals.rs
// 4상 판별기 v2 — 다중 신호 추출기
// Phase 0: 단순 임계값
// Phase 1: 4개 신호의 가중 합산 → confidence 계산

use crate::cell::CrownyCell;

/// 신호 추출 결과 — 4개 신호 각각의 값
#[derive(Debug)]
pub struct SignalSet {
    /// 나이 신호: 최근에 생성된 셀일수록 신뢰 높음 (0.0~1.0)
    pub age_signal: f32,
    /// 사용 빈도 신호: 자주 사용될수록 신뢰 높음 (0.0~1.0)
    pub usage_signal: f32,
    /// 반박 페널티: 반박 많을수록 신뢰 낮음 (0.0~1.0, 낮을수록 반박 많음)
    pub refutation_signal: f32,
    /// 퍼지 유사도: 의도 토큰이 셀과 얼마나 겹치는가 (0.0~1.0)
    pub similarity_signal: f32,
}

impl SignalSet {
    /// 4개 신호의 가중 합산 → 최종 confidence
    /// 가중치: 나이 10%, 사용 20%, 반박 30%, 유사도 40%
    pub fn weighted_confidence(&self) -> f32 {
        let score =
            self.age_signal        * 0.10
            + self.usage_signal    * 0.20
            + self.refutation_signal * 0.30
            + self.similarity_signal * 0.40;
        score.clamp(0.0, 1.0)
    }

    /// 가중합을 4상으로 변환
    pub fn to_phase(&self) -> crate::phase::judge::Phase {
        let c = self.weighted_confidence();
        use crate::phase::judge::Phase;
        match c {
            c if c >= 0.75 => Phase::Confirmed,
            c if c >= 0.40 => Phase::Uncertain,
            c if c >= 0.15 => Phase::Misunderstood,
            _              => Phase::Unknown,
        }
    }
}

// ── 개별 신호 계산 함수들 ──────────────────────────────────────

/// 나이 신호: 생성 후 30일 이내 = 1.0, 이후 지수 감쇠
pub fn age_signal(cell: &CrownyCell) -> f32 {
    let now = crate::time_util::now_timestamp();
    let days_old = ((now - cell.birth) as f32 / 86400.0).max(0.0);
    // 30일이면 0.5, 90일이면 0.22, 180일이면 0.08
    (-days_old / 43.3).exp().clamp(0.0, 1.0)
}

/// 사용 빈도 신호: 로그 스케일 (10회 = 0.5, 100회 = 0.83)
pub fn usage_signal(use_count: u32) -> f32 {
    if use_count == 0 { return 0.2; } // 한번도 안 쓰인 셀도 기본 0.2
    let log = (use_count as f32 + 1.0).ln();
    (log / (log + 1.0)).clamp(0.0, 1.0)
}

/// 반박 페널티: 반박 0 = 1.0, 1개 = 0.7, 3개 = 0.4, 5개+ = 0.1
pub fn refutation_signal(refutation_count: u32) -> f32 {
    match refutation_count {
        0 => 1.0,
        1 => 0.70,
        2 => 0.55,
        3 => 0.40,
        4 => 0.25,
        _ => 0.10,
    }
}

/// 퍼지 유사도: 요청 의도 토큰과 셀 의도 토큰의 교집합 비율
/// 예: "http_server_auth" vs "http_server" → 2/3 = 0.67
pub fn similarity_signal(query_intent: &str, cell_intent: &str) -> f32 {
    let q_tokens: std::collections::HashSet<&str> =
        query_intent.split('_').collect();
    let c_tokens: std::collections::HashSet<&str> =
        cell_intent.split('_').collect();

    if q_tokens.is_empty() || c_tokens.is_empty() {
        return 0.0;
    }

    // Jaccard 유사도
    let intersection = q_tokens.intersection(&c_tokens).count() as f32;
    let union = q_tokens.union(&c_tokens).count() as f32;
    intersection / union
}

/// 셀이 있을 때 전체 신호 세트 계산
pub fn compute_signals(query_intent: &str, cell: &CrownyCell) -> SignalSet {
    SignalSet {
        age_signal:         age_signal(cell),
        usage_signal:       usage_signal(cell.activation_count),
        refutation_signal:  refutation_signal(cell.refutation_count),
        similarity_signal:  similarity_signal(query_intent, &cell.intent),
    }
}

/// 셀이 없을 때 의도 자체만으로 신호 계산 (KNOWN_INTENTS 폴백용)
pub fn compute_seed_signals(query_intent: &str, seed_intent: &str) -> SignalSet {
    SignalSet {
        age_signal:         0.5,  // 시드 데이터는 나이 중립
        usage_signal:       0.3,  // 아직 실사용 없음
        refutation_signal:  1.0,  // 반박 없음
        similarity_signal:  similarity_signal(query_intent, seed_intent),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::{CrownyCell, Pattern, PatternSource};

    fn make_fresh_cell() -> CrownyCell {
        let mut cell = CrownyCell::new("test");
        cell.add_pattern(Pattern::new("python", "", 0.9, PatternSource::Generated));
        cell
    }

    #[test]
    fn test_age_signal_fresh() {
        // 방금 만든 셀 → 높은 점수
        let cell = make_fresh_cell();
        assert!(age_signal(&cell) > 0.9);
    }

    #[test]
    fn test_refutation_signal_none() {
        assert_eq!(refutation_signal(0), 1.0);
    }

    #[test]
    fn test_refutation_signal_many() {
        assert!(refutation_signal(5) <= 0.1);
    }

    #[test]
    fn test_similarity_exact() {
        assert_eq!(similarity_signal("http_server", "http_server"), 1.0);
    }

    #[test]
    fn test_similarity_partial() {
        let s = similarity_signal("http_server_auth", "http_server");
        assert!(s > 0.5 && s < 1.0);
    }

    #[test]
    fn test_similarity_none() {
        let s = similarity_signal("sort_function", "http_server");
        assert!(s < 0.1);
    }

    #[test]
    fn test_weighted_confirmed() {
        let signals = SignalSet {
            age_signal: 0.95,
            usage_signal: 0.8,
            refutation_signal: 1.0,
            similarity_signal: 0.9,
        };
        let c = signals.weighted_confidence();
        assert!(c >= 0.75, "expected confirmed, got {c}");
    }

    #[test]
    fn test_weighted_uncertain() {
        let signals = SignalSet {
            age_signal: 0.5,
            usage_signal: 0.3,
            refutation_signal: 0.7,
            similarity_signal: 0.5,
        };
        let c = signals.weighted_confidence();
        assert!(c >= 0.40 && c < 0.75, "expected uncertain, got {c}");
    }

    #[test]
    fn test_weighted_unknown() {
        let signals = SignalSet {
            age_signal: 0.1,
            usage_signal: 0.1,
            refutation_signal: 0.1,
            similarity_signal: 0.0,
        };
        let c = signals.weighted_confidence();
        assert!(c < 0.15, "expected unknown, got {c}");
    }
}
