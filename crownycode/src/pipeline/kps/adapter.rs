// crownycode/src/pipeline/kps/adapter.rs
// 언어 어댑터 trait — KPS 다국어 플러그인 인터페이스
// Phase 1: 한국어(Ko) + 영어(En) 구현
// Phase 4+: 스와힐리어, 힌디어, 포르투갈어(BR), 방글라어 예정

use super::{KpsNode, KpsKind};

/// 언어 어댑터 trait — 새 언어 추가 시 이것만 구현하면 됨
pub trait LangAdapter: Send + Sync {
    /// ISO 639-1 언어 코드 (예: "ko", "en", "sw")
    fn lang_code(&self) -> &'static str;

    /// 입력 문자열이 이 언어일 가능성 (0.0~1.0)
    /// 언어 감지 점수로 사용됨
    fn detect_score(&self, input: &str) -> f32;

    /// 행위 동사 추출
    fn extract_action(&self, input: &str) -> Option<String>;

    /// 대상 명사구 추출
    fn extract_target(&self, input: &str) -> String;

    /// 제약 조건 추출 (정규화된 영어 키워드로 반환)
    fn extract_constraints(&self, input: &str) -> Vec<String>;

    /// 언어 힌트 추출 (대상 출력 언어 힌트)
    fn extract_lang_hint(&self, input: &str) -> Option<String>;

    /// 전처리 (노이즈 제거, 정규화)
    fn preprocess(&self, input: &str) -> String {
        input.trim().to_string()
    }

    /// 전체 파싱 — trait에서 기본 구현 제공
    /// 어댑터별로 오버라이드 가능
    fn parse(&self, input: &str) -> Vec<KpsNode> {
        let cleaned = self.preprocess(input);
        let mut nodes = Vec::new();

        if let Some(hint) = self.extract_lang_hint(&cleaned) {
            nodes.push(KpsNode {
                kind: KpsKind::LangHint,
                text: hint.clone(),
                tokens: vec![hint],
            });
        }

        if let Some(action) = self.extract_action(&cleaned) {
            nodes.push(KpsNode {
                kind: KpsKind::Action,
                text: action.clone(),
                tokens: vec![action],
            });
        }

        for c in self.extract_constraints(&cleaned) {
            nodes.push(KpsNode {
                kind: KpsKind::Constraint,
                text: c.clone(),
                tokens: vec![c],
            });
        }

        let target = self.extract_target(&cleaned);
        nodes.push(KpsNode {
            kind: KpsKind::Target,
            text: target.clone(),
            tokens: tokenize(&target),
        });

        nodes
    }
}

pub fn tokenize(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|s| s.to_lowercase())
        .collect()
}
