// crownycode/src/pipeline/kps/ko.rs
// 한국어 KPS 어댑터 (1st-class 언어)
// Phase 0의 kps.rs 로직을 어댑터 구조로 이전 + 확장

use super::adapter::LangAdapter;

pub struct KoAdapter;

impl LangAdapter for KoAdapter {
    fn lang_code(&self) -> &'static str { "ko" }

    fn detect_score(&self, input: &str) -> f32 {
        // 한글 문자 비율로 감지
        let total = input.chars().count() as f32;
        if total == 0.0 { return 0.0; }
        let hangul = input.chars()
            .filter(|c| ('\u{AC00}'..='\u{D7A3}').contains(c)
                     || ('\u{1100}'..='\u{11FF}').contains(c))
            .count() as f32;
        hangul / total
    }

    fn extract_action(&self, input: &str) -> Option<String> {
        const ACTIONS: &[&str] = &[
            "만들어줘", "만들어", "생성해줘", "생성해",
            "작성해줘", "작성해", "구현해줘", "구현해",
            "짜줘", "짜", "코딩해줘", "개발해줘", "개발해",
            "설계해줘", "빌드해줘",
        ];
        for a in ACTIONS {
            if input.contains(a) {
                return Some(a.to_string());
            }
        }
        None
    }

    fn extract_lang_hint(&self, input: &str) -> Option<String> {
        const HINTS: &[(&str, &str)] = &[
            ("파이썬으로", "python"), ("파이썬", "python"),
            ("python으로", "python"), ("py로", "python"),
            ("러스트로", "rust"), ("러스트", "rust"),
            ("rust로", "rust"), ("rs로", "rust"),
            ("크라우니어로", "crowny"), ("크라우니어", "crowny"),
            ("자바스크립트로", "javascript"), ("js로", "javascript"),
            ("타입스크립트로", "typescript"), ("ts로", "typescript"),
            ("고랭으로", "go"), ("golang으로", "go"),
            ("씨언어로", "c"), ("c언어로", "c"),
        ];
        let lower = input.to_lowercase();
        for (pat, lang) in HINTS {
            if lower.contains(pat) {
                return Some(lang.to_string());
            }
        }
        None
    }

    fn extract_constraints(&self, input: &str) -> Vec<String> {
        const CONSTRAINTS: &[(&str, &str)] = &[
            ("비동기", "async"), ("async", "async"),
            ("빠르게", "fast"), ("빠른", "fast"), ("고성능", "fast"),
            ("메모리 효율", "memory-efficient"),
            ("안전한", "safe"), ("타입 안전", "safe"),
            ("간단한", "simple"), ("단순한", "simple"),
            ("rest", "rest"), ("restful", "rest"),
            ("그래프ql", "graphql"), ("graphql", "graphql"),
            ("웹소켓", "websocket"), ("websocket", "websocket"),
            ("데이터베이스", "database"), ("db", "database"),
            ("캐시", "cache"), ("redis", "cache"),
            ("인증", "auth"), ("jwt", "auth"),
            ("테스트", "tested"), ("테스트 코드", "tested"),
            ("로깅", "logging"), ("모니터링", "monitoring"),
            ("도커", "docker"), ("컨테이너", "docker"),
        ];
        let lower = input.to_lowercase();
        let mut found = Vec::new();
        for (pat, norm) in CONSTRAINTS {
            if lower.contains(pat) && !found.contains(&norm.to_string()) {
                found.push(norm.to_string());
            }
        }
        found
    }

    fn extract_target(&self, input: &str) -> String {
        // 동사, 언어 힌트, 조사 제거 후 핵심 명사구 추출
        const NOISE: &[&str] = &[
            "만들어줘", "만들어", "생성해줘", "생성해",
            "작성해줘", "작성해", "구현해줘", "구현해",
            "짜줘", "짜", "코딩해줘", "개발해줘", "개발해",
            "설계해줘", "빌드해줘",
            "파이썬으로", "파이썬", "python으로",
            "러스트로", "러스트", "rust로",
            "크라우니어로", "크라우니어",
            "자바스크립트로", "js로", "ts로",
            "비동기", "빠르게", "빠른", "고성능",
            "메모리 효율적으로", "안전한", "간단한", "단순한",
            "으로", "를", "을", "의", "로", "이", "가",
            "해주세요", "주세요",
        ];
        let mut result = input.to_string();
        for n in NOISE {
            result = result.replace(n, " ");
        }
        result.split_whitespace()
            .filter(|s| !s.is_empty() && s.len() > 1)
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }

    fn preprocess(&self, input: &str) -> String {
        // 전각 문자 → 반각, 앞뒤 공백 제거
        input.trim()
            .replace('\u{3000}', " ")  // 전각 스페이스
            .replace('？', "?")
            .replace('！', "!")
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::kps::adapter::LangAdapter;

    #[test]
    fn test_ko_detect_high() {
        let adapter = KoAdapter;
        assert!(adapter.detect_score("HTTP 서버 만들어줘") > 0.3);
    }

    #[test]
    fn test_ko_action_extraction() {
        let adapter = KoAdapter;
        assert_eq!(adapter.extract_action("HTTP 서버 만들어줘"), Some("만들어줘".to_string()));
        assert_eq!(adapter.extract_action("정렬 함수 구현해줘"), Some("구현해줘".to_string()));
    }

    #[test]
    fn test_ko_lang_hint() {
        let adapter = KoAdapter;
        assert_eq!(adapter.extract_lang_hint("파이썬으로 서버 만들어줘"), Some("python".to_string()));
        assert_eq!(adapter.extract_lang_hint("러스트로 구현해줘"), Some("rust".to_string()));
        assert_eq!(adapter.extract_lang_hint("크라우니어로 짜줘"), Some("crowny".to_string()));
    }

    #[test]
    fn test_ko_constraints() {
        let adapter = KoAdapter;
        let cs = adapter.extract_constraints("비동기 HTTP 서버 만들어줘");
        assert!(cs.contains(&"async".to_string()));
    }

    #[test]
    fn test_ko_parse_full() {
        let adapter = KoAdapter;
        let nodes = adapter.parse("파이썬으로 비동기 REST API 서버 만들어줘");
        let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
        use crate::pipeline::kps::KpsKind;
        assert!(kinds.contains(&&KpsKind::LangHint));
        assert!(kinds.contains(&&KpsKind::Action));
        assert!(kinds.contains(&&KpsKind::Constraint));
        assert!(kinds.contains(&&KpsKind::Target));
    }
}
