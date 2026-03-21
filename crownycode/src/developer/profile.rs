#![allow(dead_code)]
// crownycode/src/developer/profile.rs
// 개발자 프로필 — 학습 셀 그래프 + 레벨 + 추천

use super::level::DevLevel;

/// 개발자 프로필
#[derive(Debug, Clone)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub struct DeveloperProfile {
    /// 개발자 식별자 (로컬 UUID 또는 사용자 지정 ID)
    pub dev_id: String,
    /// 표시 이름
    pub name: String,
    /// 현재 레벨
    pub level: DevLevel,
    /// 학습한 의도(intent) 목록 — 확정(+2) 상태만 포함
    pub known_intents: Vec<LearnedIntent>,
    /// 미확인(0) 상태로 마킹된 의도 — 추가 학습 필요
    pub uncertain_intents: Vec<String>,
    /// 오해(-1)가 발생한 의도 — 재학습 권고
    pub misunderstood_intents: Vec<String>,
    /// 전체 생성 요청 수
    pub total_requests: u32,
    /// 성공 생성 수
    pub successful_generations: u32,
    /// 커뮤니티 기여 수 (새 패턴 제안)
    pub contributions: u32,
    /// 첫 사용 일시 (RFC3339 문자열)
    pub first_seen: String,
    /// 마지막 활동 일시 (RFC3339 문자열)
    pub last_active: String,
    /// 선호 언어
    pub preferred_lang: Option<String>,
    /// 국가 코드 (무상 게이트웨이 판단용)
    pub country_code: Option<String>,
}

/// 학습된 의도 항목
#[derive(Debug, Clone)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub struct LearnedIntent {
    pub intent: String,
    pub confidence: f32,
    pub learned_at: String,
    pub use_count: u32,
}

impl DeveloperProfile {
    pub fn new(dev_id: &str, name: &str) -> Self {
        let now = crate::time_util::now_rfc3339();
        Self {
            dev_id: dev_id.to_string(),
            name: name.to_string(),
            level: DevLevel::Seed,
            known_intents: vec![],
            uncertain_intents: vec![],
            misunderstood_intents: vec![],
            total_requests: 0,
            successful_generations: 0,
            contributions: 0,
            first_seen: now.clone(),
            last_active: now,
            preferred_lang: None,
            country_code: None,
        }
    }

    /// 레벨 재계산 (known_intents 수 기준)
    pub fn recalculate_level(&mut self) {
        self.level = DevLevel::from_cell_count(self.known_intents.len() as u32);
    }

    /// 의도 학습 등록
    pub fn learn_intent(&mut self, intent: &str, confidence: f32) {
        // 이미 알고 있으면 confidence 갱신
        if let Some(existing) = self.known_intents.iter_mut().find(|i| i.intent == intent) {
            existing.confidence = confidence;
            existing.use_count += 1;
            return;
        }
        // 미확인·오해 목록에서 제거
        self.uncertain_intents.retain(|i| i != intent);
        self.misunderstood_intents.retain(|i| i != intent);

        self.known_intents.push(LearnedIntent {
            intent: intent.to_string(),
            confidence,
            learned_at: crate::time_util::now_rfc3339(),
            use_count: 1,
        });
        self.recalculate_level();
    }

    /// 미확인 마킹
    pub fn mark_uncertain(&mut self, intent: &str) {
        if !self.uncertain_intents.contains(&intent.to_string())
            && !self.known_intents.iter().any(|i| i.intent == intent)
        {
            self.uncertain_intents.push(intent.to_string());
        }
    }

    /// 오해 마킹
    pub fn mark_misunderstood(&mut self, intent: &str) {
        // known에서 제거하고 오해 목록으로 이동
        self.known_intents.retain(|i| i.intent != intent);
        if !self.misunderstood_intents.contains(&intent.to_string()) {
            self.misunderstood_intents.push(intent.to_string());
        }
        self.recalculate_level();
    }

    /// 다음 학습 추천 목록
    pub fn next_steps(&self) -> Vec<NextStep> {
        let mut steps = Vec::new();

        // 오해 → 최우선 재학습
        for intent in &self.misunderstood_intents {
            steps.push(NextStep {
                intent: intent.clone(),
                priority: StepPriority::Critical,
                reason: "오해(-1) 상태: 재학습 필요".to_string(),
            });
        }

        // 미확인 → 보통 우선
        for intent in &self.uncertain_intents {
            steps.push(NextStep {
                intent: intent.clone(),
                priority: StepPriority::Recommended,
                reason: "미확인(0) 상태: 추가 학습 권장".to_string(),
            });
        }

        // 레벨별 다음 학습 제안
        let level_suggestions = self.level_suggestions();
        for s in level_suggestions {
            steps.push(NextStep {
                intent: s,
                priority: StepPriority::Optional,
                reason: format!("{} 레벨 다음 단계", self.level.label_ko()),
            });
        }

        steps
    }

    /// 레벨별 다음 학습 제안 의도 목록
    fn level_suggestions(&self) -> Vec<String> {
        use DevLevel::*;
        let known: Vec<&str> = self.known_intents.iter().map(|i| i.intent.as_str()).collect();

        let candidates: &[&str] = match self.level {
            Seed => &["http_server", "sort_function", "file_reader", "cli_tool"],
            Sprout => &["rest_api", "json_parser", "database_client", "unit_test"],
            Explorer => &["auth_handler", "websocket_server", "cache_client", "data_processor"],
            Craftsman => &["queue_worker", "task_scheduler", "metrics_collector", "orm_model"],
            Architect | Creator => &["distributed_system", "event_sourcing", "cqrs_pattern"],
        };

        candidates.iter()
            .filter(|c| !known.contains(c))
            .take(3)
            .map(|s| s.to_string())
            .collect()
    }

    /// 성공률 계산
    pub fn success_rate(&self) -> f32 {
        if self.total_requests == 0 { return 0.0; }
        self.successful_generations as f32 / self.total_requests as f32
    }

    /// 무상 게이트웨이 대상 여부
    pub fn is_free_gateway(&self) -> bool {
        const FREE_COUNTRIES: &[&str] = &[
            "KE", "TZ", "NG", "IN", "BD", "ET", "UG", "MZ",
            "GH", "RW", "SN", "CI", "CM", "ZM", "MW",
        ];
        self.country_code.as_deref()
            .map(|cc| FREE_COUNTRIES.contains(&cc))
            .unwrap_or(false)
    }
}

/// 다음 학습 추천 항목
#[derive(Debug, Clone)]
pub struct NextStep {
    pub intent: String,
    pub priority: StepPriority,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StepPriority {
    Critical,     // 오해(-1) — 반드시 재학습
    Recommended,  // 미확인(0) — 권장
    Optional,     // 레벨 진급 제안
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_profile_seed() {
        let p = DeveloperProfile::new("dev1", "김크라우니");
        assert_eq!(p.level, DevLevel::Seed);
        assert_eq!(p.known_intents.len(), 0);
    }

    #[test]
    fn test_learn_intent_level_up() {
        let mut p = DeveloperProfile::new("dev1", "test");
        for i in 0..10 {
            p.learn_intent(&format!("intent_{i}"), 0.9);
        }
        assert_eq!(p.level, DevLevel::Sprout);
    }

    #[test]
    fn test_learn_removes_uncertain() {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.mark_uncertain("http_server");
        assert_eq!(p.uncertain_intents.len(), 1);
        p.learn_intent("http_server", 0.9);
        assert_eq!(p.uncertain_intents.len(), 0);
    }

    #[test]
    fn test_misunderstood_removes_from_known() {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.learn_intent("sort_function", 0.9);
        assert_eq!(p.known_intents.len(), 1);
        p.mark_misunderstood("sort_function");
        assert_eq!(p.known_intents.len(), 0);
        assert_eq!(p.misunderstood_intents.len(), 1);
    }

    #[test]
    fn test_next_steps_critical_first() {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.mark_misunderstood("rest_api");
        p.mark_uncertain("json_parser");
        let steps = p.next_steps();
        assert_eq!(steps[0].priority, StepPriority::Critical);
        assert_eq!(steps[0].intent, "rest_api");
    }

    #[test]
    fn test_success_rate() {
        let mut p = DeveloperProfile::new("dev1", "test");
        p.total_requests = 10;
        p.successful_generations = 8;
        assert!((p.success_rate() - 0.8).abs() < 0.01);
    }

    #[test]
    fn test_free_gateway_ke() {
        let mut p = DeveloperProfile::new("dev1", "Amina");
        p.country_code = Some("KE".to_string());
        assert!(p.is_free_gateway());
    }

    #[test]
    fn test_not_free_gateway_kr() {
        let mut p = DeveloperProfile::new("dev1", "김철수");
        p.country_code = Some("KR".to_string());
        assert!(!p.is_free_gateway());
    }
}
