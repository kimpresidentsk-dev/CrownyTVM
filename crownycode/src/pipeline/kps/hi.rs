// crownycode/src/pipeline/kps/hi.rs
// हिंदी (Hindi) KPS 어댑터
// 남아시아 타겟 — 인도(IN), 네팔(NP), 파키스탄(PK) 등
//
// 힌디어 코딩 요청 패턴:
//   "HTTP सर्वर बनाओ"     → HTTP server banao (make)
//   "API बनाएं"           → API banaen (create formal)
//   "क्रमबद्ध फ़ंक्शन लिखो" → sort function likho (write)
//   "Python में बनाओ"     → make in Python

use super::adapter::LangAdapter;

pub struct HiAdapter;

impl LangAdapter for HiAdapter {
    fn lang_code(&self) -> &'static str { "hi" }

    fn detect_score(&self, input: &str) -> f32 {
        // 데바나가리 문자(U+0900–U+097F) 비율로 감지
        let total = input.chars().count() as f32;
        if total == 0.0 { return 0.0; }
        let devanagari = input.chars()
            .filter(|c| ('\u{0900}'..='\u{097F}').contains(c))
            .count() as f32;
        devanagari / total
    }

    fn extract_action(&self, input: &str) -> Option<String> {
        // 힌디어 생성/개발 동사
        const ACTIONS: &[&str] = &[
            "बनाओ",      // banao — make (informal)
            "बनाएं",     // banaen — make (formal/plural)
            "लिखो",      // likho — write
            "लिखें",     // likhen — write (formal)
            "बनाइए",     // banaiye — make (very formal)
            "विकसित करो", // viksit karo — develop
            "बनाना",     // banana — to make (infinitive)
            "तैयार करो",  // taiyar karo — prepare/build
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
            ("Python में", "python"),
            ("python में", "python"),
            ("Python",     "python"),
            ("Rust में",   "rust"),
            ("rust में",   "rust"),
            ("Rust",       "rust"),
            ("JavaScript", "javascript"),
            ("JavaScript में", "javascript"),
            ("crowny",     "crowny"),
            ("क्राउनी",   "crowny"),
        ];
        for (pat, lang) in HINTS {
            if input.contains(pat) {
                return Some(lang.to_string());
            }
        }
        None
    }

    fn extract_constraints(&self, input: &str) -> Vec<String> {
        const CONSTRAINTS: &[(&str, &str)] = &[
            ("तेज़",        "fast"),      // tez — fast
            ("तेज",         "fast"),
            ("असिंक्रोनस", "async"),     // async
            ("async",       "async"),
            ("सुरक्षित",   "safe"),      // surakshit — safe/secure
            ("सरल",        "simple"),    // saral — simple
            ("आसान",       "simple"),    // aasan — easy
            ("REST",        "rest"),
            ("डेटाबेस",   "database"),  // database
            ("कैश",        "cache"),     // cache
            ("परीक्षण",   "tested"),    // parikshan — test
            ("लॉगिंग",    "logging"),   // logging
            ("websocket",   "websocket"),
        ];
        let mut found = Vec::new();
        for (pat, norm) in CONSTRAINTS {
            if input.contains(pat) && !found.contains(&norm.to_string()) {
                found.push(norm.to_string());
            }
        }
        found
    }

    fn extract_target(&self, input: &str) -> String {
        // 힌디어 → 영어 핵심 명사 매핑
        const NOUN_MAP: &[(&str, &str)] = &[
            ("HTTP सर्वर",    "http_server"),
            ("वेब सर्वर",    "http_server"),
            ("सर्वर",         "http_server"),
            ("API",            "rest_api"),
            ("क्रमबद्ध",     "sort_function"),
            ("सॉर्ट",         "sort_function"),
            ("CLI टूल",       "cli_tool"),
            ("डेटाबेस",      "database_client"),
            ("फ़ाइल रीडर",  "file_reader"),
            ("यूनिट टेस्ट", "unit_test"),
        ];
        for (hi, en) in NOUN_MAP {
            if input.contains(hi) {
                return en.to_string();
            }
        }

        // 노이즈 제거 후 남은 텍스트
        const NOISE: &[&str] = &[
            "बनाओ", "बनाएं", "लिखो", "लिखें", "बनाइए", "विकसित करो", "तैयार करो",
            "Python में", "Rust में", "JavaScript में",
            "तेज़", "तेज", "सुरक्षित", "सरल", "आसान",
            "कृपया", "मुझे", "चाहिए",
        ];
        let mut result = input.to_string();
        for n in NOISE {
            result = result.replace(n, " ");
        }
        result.split_whitespace()
            .filter(|s| !s.is_empty() && s.chars().count() > 1)
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
    fn test_hi_detect() {
        let a = HiAdapter;
        assert!(a.detect_score("HTTP सर्वर बनाओ") > 0.3);
    }

    #[test]
    fn test_hi_detect_zero_for_latin() {
        let a = HiAdapter;
        assert!(a.detect_score("create a server") < 0.1);
    }

    #[test]
    fn test_hi_action() {
        let a = HiAdapter;
        assert_eq!(a.extract_action("HTTP सर्वर बनाओ"), Some("बनाओ".to_string()));
        assert_eq!(a.extract_action("API बनाएं"), Some("बनाएं".to_string()));
    }

    #[test]
    fn test_hi_target_mapping() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("HTTP सर्वर बनाओ"), "http_server");
        assert_eq!(a.extract_target("क्रमबद्ध फ़ंक्शन"), "sort_function");
    }

    #[test]
    fn test_hi_lang_hint() {
        let a = HiAdapter;
        assert_eq!(a.extract_lang_hint("Python में HTTP सर्वर बनाओ"), Some("python".to_string()));
        assert_eq!(a.extract_lang_hint("Rust में बनाओ"), Some("rust".to_string()));
    }

    #[test]
    fn test_hi_constraints() {
        let a = HiAdapter;
        let cs = a.extract_constraints("तेज़ और सुरक्षित API बनाओ");
        assert!(cs.contains(&"fast".to_string()));
        assert!(cs.contains(&"safe".to_string()));
    }

    #[test]
    fn test_hi_full_parse() {
        let a = HiAdapter;
        let nodes = a.parse("Python में HTTP सर्वर बनाओ");
        let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
        assert!(kinds.contains(&&KpsKind::Action));
        assert!(kinds.contains(&&KpsKind::LangHint));
    }
}
