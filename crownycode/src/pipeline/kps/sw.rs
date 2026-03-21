// crownycode/src/pipeline/kps/sw.rs
// 스와힐리어(Kiswahili) KPS 어댑터
// 동아프리카 개발도상국(KE·TZ·UG·RW) 타겟 — Phase 4 확장 기반
//
// 스와힐리어 코딩 요청 패턴:
//   "Unda seva ya HTTP"  → create HTTP server
//   "Tengeneza API"      → make API
//   "Andika kazi ya kupanga" → write sort function
//   "Jenga programu ya CLI" → build CLI program

use super::adapter::LangAdapter;

pub struct SwAdapter;

impl LangAdapter for SwAdapter {
    fn lang_code(&self) -> &'static str { "sw" }

    fn detect_score(&self, input: &str) -> f32 {
        // 스와힐리어 고빈도 동사 및 키워드 존재 여부로 감지
        let sw_markers = [
            "unda", "tengeneza", "andika", "jenga", "fanya",
            "seva", "programu", "kazi", "kupanga", "haraka",
            "salama", "rahisi", "kuunganisha",
        ];
        let lower = input.to_lowercase();
        let hits = sw_markers.iter().filter(|m| lower.contains(*m)).count();
        // 2개 이상 일치하면 스와힐리어로 판단
        (hits as f32 / 3.0).min(1.0)
    }

    fn extract_action(&self, input: &str) -> Option<String> {
        // 스와힐리어 동사 (Kiswahili verbs for creation/development)
        const ACTIONS: &[&str] = &[
            "unda",        // create
            "tengeneza",   // make/build
            "andika",      // write
            "jenga",       // build
            "fanya",       // do/make
            "weka",        // set up
            "sanidi",      // configure
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
            ("python",  "python"),
            ("rust",    "rust"),
            ("kwa python", "python"),
            ("kwa rust",   "rust"),
            ("javascript", "javascript"),
            ("crowny",     "crowny"),
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
            ("haraka",      "fast"),        // fast
            ("salama",      "safe"),        // safe/secure
            ("rahisi",      "simple"),      // simple
            ("async",       "async"),
            ("wakati halisi","async"),      // real-time
            ("hifadhidata", "database"),    // database
            ("mtandao",     "rest"),        // web/network → REST
            ("majaribio",   "tested"),      // tests
            ("kumbukumbu",  "memory-efficient"), // memory
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
        const NOISE: &[&str] = &[
            "unda", "tengeneza", "andika", "jenga", "fanya", "weka", "sanidi",
            "kwa python", "kwa rust",
            "haraka", "salama", "rahisi",
            "tafadhali", "niambie", "nipe",  // please, tell me, give me
        ];
        let mut result = input.to_lowercase();
        for n in NOISE {
            result = result.replace(n, " ");
        }

        // 스와힐리어 → 영어 핵심 명사 매핑
        let noun_map: &[(&str, &str)] = &[
            ("seva ya http",  "http_server"),
            ("seva ya wavuti","http_server"),
            ("seva",          "http_server"),
            ("api",           "rest_api"),
            ("kazi ya kupanga","sort_function"),
            ("programu ya cli","cli_tool"),
            ("hifadhidata",   "database_client"),
            ("majaribio",     "unit_test"),
        ];
        for (sw, en) in noun_map {
            if result.contains(sw) {
                return en.to_string();
            }
        }

        result.split_whitespace()
            .filter(|s| !s.is_empty() && s.len() > 1)
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::kps::adapter::LangAdapter;
    use crate::pipeline::kps::KpsKind;

    #[test]
    fn test_sw_detect() {
        let a = SwAdapter;
        assert!(a.detect_score("Unda seva ya HTTP kwa python") > 0.0);
    }

    #[test]
    fn test_sw_action() {
        let a = SwAdapter;
        assert_eq!(a.extract_action("unda seva ya http"), Some("unda".to_string()));
        assert_eq!(a.extract_action("jenga programu ya CLI"), Some("jenga".to_string()));
    }

    #[test]
    fn test_sw_target_mapping() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("unda seva ya http"), "http_server");
        assert_eq!(a.extract_target("andika kazi ya kupanga"), "sort_function");
    }

    #[test]
    fn test_sw_constraints() {
        let a = SwAdapter;
        let cs = a.extract_constraints("jenga programu haraka na salama");
        assert!(cs.contains(&"fast".to_string()));
        assert!(cs.contains(&"safe".to_string()));
    }

    #[test]
    fn test_sw_lang_hint() {
        let a = SwAdapter;
        assert_eq!(a.extract_lang_hint("unda seva kwa python"), Some("python".to_string()));
    }

    #[test]
    fn test_sw_full_parse() {
        let a = SwAdapter;
        let nodes = a.parse("Unda seva ya HTTP haraka kwa python");
        let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
        assert!(kinds.contains(&&KpsKind::Action));
        assert!(kinds.contains(&&KpsKind::Target));
    }
}
