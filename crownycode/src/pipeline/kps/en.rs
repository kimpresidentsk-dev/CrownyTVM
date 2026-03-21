// crownycode/src/pipeline/kps/en.rs
// 영어 KPS 어댑터 — Phase 1 확장 구현
// Phase 0보다 훨씬 넓은 동사/명사/제약 패턴 커버

use super::adapter::LangAdapter;

pub struct EnAdapter;

impl LangAdapter for EnAdapter {
    fn lang_code(&self) -> &'static str { "en" }

    fn detect_score(&self, input: &str) -> f32 {
        // ASCII 알파벳 비율 기반 (한글이 없고 영문자가 많으면 영어)
        let chars: Vec<char> = input.chars().collect();
        if chars.is_empty() { return 0.0; }
        let hangul = chars.iter().filter(|c| ('\u{AC00}'..='\u{D7A3}').contains(*c)).count();
        if hangul > 0 { return 0.0; } // 한글이 하나라도 있으면 영어 아님

        let ascii_alpha = chars.iter()
            .filter(|c| c.is_ascii_alphabetic())
            .count() as f32;
        let total = chars.len() as f32;
        (ascii_alpha / total).min(1.0)
    }

    fn extract_action(&self, input: &str) -> Option<String> {
        const ACTIONS: &[&str] = &[
            "create", "make", "build", "write", "implement",
            "generate", "develop", "design", "code", "program",
            "set up", "setup", "scaffold", "bootstrap",
            "add", "show me", "give me", "provide",
        ];
        let lower = input.to_lowercase();
        for a in ACTIONS {
            if lower.contains(a) {
                return Some(a.to_string());
            }
        }
        None
    }

    fn extract_lang_hint(&self, input: &str) -> Option<String> {
        const HINTS: &[(&str, &str)] = &[
            ("in python", "python"), ("using python", "python"),
            ("with python", "python"), ("python script", "python"),
            ("in rust", "rust"), ("using rust", "rust"),
            ("with rust", "rust"),
            ("in javascript", "javascript"), ("in js", "javascript"),
            ("using node", "javascript"), ("with express", "javascript"),
            ("in typescript", "typescript"), ("in ts", "typescript"),
            ("in go", "go"), ("using go", "go"), ("golang", "go"),
            ("in c", "c"), ("in c++", "cpp"), ("in cpp", "cpp"),
            ("in java", "java"), ("with spring", "java"),
            ("crowny", "crowny"),
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
        // (패턴, 정규화 키워드) — 정규화 키워드는 한국어 어댑터와 동일
        const CONSTRAINTS: &[(&str, &str)] = &[
            ("async", "async"), ("asynchronous", "async"),
            ("non-blocking", "async"), ("concurrent", "async"),
            ("fast", "fast"), ("high performance", "fast"),
            ("performant", "fast"), ("optimized", "fast"),
            ("memory efficient", "memory-efficient"),
            ("low memory", "memory-efficient"),
            ("safe", "safe"), ("type safe", "safe"),
            ("simple", "simple"), ("minimal", "simple"),
            ("clean", "simple"),
            ("rest", "rest"), ("restful", "rest"), ("rest api", "rest"),
            ("graphql", "graphql"),
            ("websocket", "websocket"), ("ws", "websocket"),
            ("realtime", "websocket"), ("real-time", "websocket"),
            ("database", "database"), ("db", "database"),
            ("sql", "database"), ("postgres", "database"),
            ("mysql", "database"), ("sqlite", "database"),
            ("cache", "cache"), ("redis", "cache"),
            ("auth", "auth"), ("authentication", "auth"),
            ("jwt", "auth"), ("oauth", "auth"),
            ("test", "tested"), ("with tests", "tested"),
            ("tdd", "tested"),
            ("logging", "logging"), ("log", "logging"),
            ("docker", "docker"), ("containerized", "docker"),
            ("cli", "cli"),
            ("crud", "crud"),
            ("pagination", "pagination"),
            ("streaming", "streaming"),
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
        // Multi-word noise (removed via substring replace, safe since they are multi-word)
        const NOISE_MULTI: &[&str] = &[
            "create", "make", "build", "write", "implement",
            "generate", "develop", "design", "code", "program",
            "set up", "setup", "scaffold", "bootstrap",
            "show me", "give me", "provide",
            "in python", "using python", "with python",
            "in rust", "using rust", "with rust",
            "in javascript", "in js", "using node",
            "in typescript", "in ts", "in go", "using go",
            "in c", "in java",
            "async", "asynchronous", "fast", "simple", "minimal",
            "with tests", "restful",
            "please", "can you", "could you", "i need", "i want",
        ];
        // Single-word noise (removed only as whole words to avoid mangling)
        const NOISE_WORDS: &[&str] = &["a", "an", "the", "me", "add"];
        let mut result = input.to_lowercase();
        for n in NOISE_MULTI {
            result = result.replace(n, " ");
        }
        result.split_whitespace()
            .filter(|s| !s.is_empty() && s.len() > 1 && !NOISE_WORDS.contains(s))
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }

    fn preprocess(&self, input: &str) -> String {
        // 소문자로 정규화하지 않음 — extract_target에서 처리
        input.trim()
            .replace('\t', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::kps::adapter::LangAdapter;
    use crate::pipeline::kps::KpsKind;

    #[test]
    fn test_en_detect_high() {
        let a = EnAdapter;
        assert!(a.detect_score("create a REST API server") > 0.5);
    }

    #[test]
    fn test_en_detect_zero_for_korean() {
        let a = EnAdapter;
        assert_eq!(a.detect_score("HTTP 서버 만들어줘"), 0.0);
    }

    #[test]
    fn test_en_action() {
        let a = EnAdapter;
        assert_eq!(a.extract_action("create a web server"), Some("create".to_string()));
        assert_eq!(a.extract_action("implement a sort function"), Some("implement".to_string()));
        assert_eq!(a.extract_action("build a cli tool in rust"), Some("build".to_string()));
    }

    #[test]
    fn test_en_lang_hint() {
        let a = EnAdapter;
        assert_eq!(a.extract_lang_hint("create a server in python"), Some("python".to_string()));
        assert_eq!(a.extract_lang_hint("build this in rust"), Some("rust".to_string()));
        assert_eq!(a.extract_lang_hint("using node express"), Some("javascript".to_string()));
    }

    #[test]
    fn test_en_constraints() {
        let a = EnAdapter;
        let cs = a.extract_constraints("create an async REST API with auth and tests");
        assert!(cs.contains(&"async".to_string()));
        assert!(cs.contains(&"rest".to_string()));
        assert!(cs.contains(&"auth".to_string()));
        assert!(cs.contains(&"tested".to_string()));
    }

    #[test]
    fn test_en_full_parse() {
        let a = EnAdapter;
        let nodes = a.parse("create an async REST API server in python with authentication");
        let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
        assert!(kinds.contains(&&KpsKind::LangHint));
        assert!(kinds.contains(&&KpsKind::Action));
        assert!(kinds.contains(&&KpsKind::Constraint));
    }
}
