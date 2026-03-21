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
            ("प्रमाणीकरण", "auth"),     // authentication
            ("ऑथ",         "auth"),
            ("कतार",       "queue"),     // queue
            ("शेड्यूलर",  "scheduling"), // scheduling
            ("ईमेल",       "email"),     // email
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
        // 힌디어 → 영어 핵심 명사 매핑 (long patterns first)
        const NOUN_MAP: &[(&str, &str)] = &[
            // ── Web/Network ──
            ("HTTP सर्वर", "http_server"), ("वेब सर्वर", "http_server"),
            ("वेबसॉकेट सर्वर", "websocket_server"), ("वेबसॉकेट", "websocket_server"),
            ("TCP सर्वर", "tcp_server"),
            ("REST API", "rest_api"),
            ("वेब स्क्रैपर", "web_scraper"), ("स्क्रैपर", "web_scraper"),
            ("URL राउटर", "url_router"), ("राउटर", "url_router"),
            ("सर्वर", "http_server"),
            ("API", "rest_api"),
            // ── Algorithms ──
            ("सॉर्ट फ़ंक्शन", "sort_function"), ("क्रमबद्ध", "sort_function"), ("सॉर्ट", "sort_function"),
            ("बाइनरी सर्च", "binary_search"), ("खोज", "binary_search"),
            // ── File I/O ──
            ("फ़ाइल रीडर", "file_reader"), ("फ़ाइल पढ़ो", "file_reader"), ("फाइल पढ़ो", "file_reader"),
            ("फ़ाइल राइटर", "file_writer"), ("फ़ाइल लिखो", "file_writer"), ("फाइल लिखो", "file_writer"),
            // ── Parsers ──
            ("JSON पार्सर", "json_parser"), ("जेसन पार्सर", "json_parser"),
            ("CSV पार्सर", "csv_parser"),
            ("HTML पार्सर", "html_parser"),
            ("XML पार्सर", "xml_parser"),
            ("रेगेक्स", "regex_matcher"),
            // ── DB/Cache ──
            ("डेटाबेस क्लाइंट", "database_client"), ("डेटाबेस", "database_client"),
            ("SQL क्वेरी", "sql_query"),
            ("कैश क्लाइंट", "cache_client"), ("कैश", "cache_client"),
            ("रेडिस क्लाइंट", "redis_client"), ("रेडिस", "redis_client"),
            ("ORM मॉडल", "orm_model"),
            // ── CLI/Config ──
            ("CLI टूल", "cli_tool"),
            ("आर्गुमेंट पार्सर", "argument_parser"),
            ("कॉन्फ़िग लोडर", "config_loader"), ("सेटिंग", "config_loader"),
            // ── Auth/Security ──
            ("प्रमाणीकरण", "auth_handler"), ("ऑथ", "auth_handler"), ("लॉगिन", "auth_handler"),
            ("JWT हैंडलर", "jwt_handler"), ("JWT", "jwt_handler"),
            ("एन्क्रिप्शन", "encryption"), ("गोपनीयता", "encryption"),
            ("हैशिंग", "hashing"),
            // ── Async/Workers ──
            ("क्यू वर्कर", "queue_worker"), ("कतार", "queue_worker"),
            ("टास्क शेड्यूलर", "task_scheduler"), ("शेड्यूलर", "task_scheduler"),
            ("क्रॉन जॉब", "cron_job"),
            // ── Logging/Metrics ──
            ("मेट्रिक्स कलेक्टर", "metrics_collector"),
            ("लॉगर", "logger"), ("लॉगिंग", "logger"),
            // ── Data Processing ──
            ("डेटा प्रोसेसर", "data_processor"), ("डेटा प्रोसेसिंग", "data_processor"),
            ("डीसीरियलाइज़र", "deserializer"),
            ("सीरियलाइज़र", "serializer"),
            ("कम्प्रेशन", "compression"), ("संपीड़न", "compression"),
            // ── Middleware/Web ──
            ("मिडलवेयर", "middleware"),
            ("रेट लिमिटर", "rate_limiter"),
            ("वैलिडेटर", "validator"), ("सत्यापन", "validator"),
            // ── Output ──
            ("ईमेल भेजो", "email_sender"), ("ईमेल", "email_sender"),
            ("इमेज प्रोसेसर", "image_processor"), ("चित्र", "image_processor"),
            ("PDF जनरेटर", "pdf_generator"), ("PDF", "pdf_generator"),
            // ── Testing ──
            ("इंटीग्रेशन टेस्ट", "integration_test"),
            ("यूनिट टेस्ट", "unit_test"), ("परीक्षण", "unit_test"),
            // ── Design Patterns ──
            ("टेम्पलेट इंजन", "template_engine"),
            ("स्टेट मशीन", "state_machine"),
            ("इवेंट एमिटर", "event_emitter"),
            ("ऑब्ज़र्वर पैटर्न", "observer_pattern"),
            ("फ़ैक्टरी पैटर्न", "factory_pattern"),
            ("सिंगलटन पैटर्न", "singleton_pattern"),
            ("बिल्डर पैटर्न", "builder_pattern"),
        ];
        for (hi, en) in NOUN_MAP {
            if input.contains(hi) {
                return en.to_string();
            }
        }

        // 노이즈 제거 후 남은 텍스트
        const NOISE: &[&str] = &[
            "बनाओ", "बनाएं", "लिखो", "लिखें", "बनाइए", "विकसित करो", "तैयार करो",
            "बनाना",
            "Python में", "Rust में", "JavaScript में",
            "तेज़", "तेज", "सुरक्षित", "सरल", "आसान",
            "कृपया", "मुझे", "चाहिए",
            "करो", "करें", "भेजो", "पढ़ो", "लिखो",
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

    // ── 51 seed intent tests ──

    #[test]
    fn test_hi_target_all_web() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("HTTP सर्वर"), "http_server");
        assert_eq!(a.extract_target("वेब सर्वर"), "http_server");
        assert_eq!(a.extract_target("REST API"), "rest_api");
        assert_eq!(a.extract_target("वेबसॉकेट सर्वर"), "websocket_server");
        assert_eq!(a.extract_target("TCP सर्वर"), "tcp_server");
        assert_eq!(a.extract_target("वेब स्क्रैपर"), "web_scraper");
        assert_eq!(a.extract_target("URL राउटर"), "url_router");
    }

    #[test]
    fn test_hi_target_algorithms() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("सॉर्ट फ़ंक्शन"), "sort_function");
        assert_eq!(a.extract_target("बाइनरी सर्च"), "binary_search");
    }

    #[test]
    fn test_hi_target_file_io() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("फ़ाइल रीडर"), "file_reader");
        assert_eq!(a.extract_target("फ़ाइल पढ़ो"), "file_reader");
        assert_eq!(a.extract_target("फ़ाइल राइटर"), "file_writer");
        assert_eq!(a.extract_target("फ़ाइल लिखो"), "file_writer");
    }

    #[test]
    fn test_hi_target_parsers() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("JSON पार्सर"), "json_parser");
        assert_eq!(a.extract_target("CSV पार्सर"), "csv_parser");
        assert_eq!(a.extract_target("HTML पार्सर"), "html_parser");
        assert_eq!(a.extract_target("XML पार्सर"), "xml_parser");
        assert_eq!(a.extract_target("रेगेक्स"), "regex_matcher");
    }

    #[test]
    fn test_hi_target_database() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("डेटाबेस क्लाइंट"), "database_client");
        assert_eq!(a.extract_target("SQL क्वेरी"), "sql_query");
        assert_eq!(a.extract_target("कैश क्लाइंट"), "cache_client");
        assert_eq!(a.extract_target("रेडिस क्लाइंट"), "redis_client");
        assert_eq!(a.extract_target("ORM मॉडल"), "orm_model");
    }

    #[test]
    fn test_hi_target_cli() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("CLI टूल"), "cli_tool");
        assert_eq!(a.extract_target("आर्गुमेंट पार्सर"), "argument_parser");
        assert_eq!(a.extract_target("कॉन्फ़िग लोडर"), "config_loader");
    }

    #[test]
    fn test_hi_target_auth() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("प्रमाणीकरण"), "auth_handler");
        assert_eq!(a.extract_target("JWT हैंडलर"), "jwt_handler");
        assert_eq!(a.extract_target("एन्क्रिप्शन"), "encryption");
        assert_eq!(a.extract_target("हैशिंग"), "hashing");
    }

    #[test]
    fn test_hi_target_async() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("क्यू वर्कर"), "queue_worker");
        assert_eq!(a.extract_target("टास्क शेड्यूलर"), "task_scheduler");
        assert_eq!(a.extract_target("क्रॉन जॉब"), "cron_job");
    }

    #[test]
    fn test_hi_target_logging() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("लॉगर"), "logger");
        assert_eq!(a.extract_target("मेट्रिक्स कलेक्टर"), "metrics_collector");
    }

    #[test]
    fn test_hi_target_data() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("डेटा प्रोसेसर"), "data_processor");
        assert_eq!(a.extract_target("सीरियलाइज़र"), "serializer");
        assert_eq!(a.extract_target("डीसीरियलाइज़र"), "deserializer");
        assert_eq!(a.extract_target("कम्प्रेशन"), "compression");
    }

    #[test]
    fn test_hi_target_web_middleware() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("मिडलवेयर"), "middleware");
        assert_eq!(a.extract_target("रेट लिमिटर"), "rate_limiter");
        assert_eq!(a.extract_target("वैलिडेटर"), "validator");
    }

    #[test]
    fn test_hi_target_output() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("ईमेल भेजो"), "email_sender");
        assert_eq!(a.extract_target("इमेज प्रोसेसर"), "image_processor");
        assert_eq!(a.extract_target("PDF जनरेटर"), "pdf_generator");
    }

    #[test]
    fn test_hi_target_testing() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("यूनिट टेस्ट"), "unit_test");
        assert_eq!(a.extract_target("इंटीग्रेशन टेस्ट"), "integration_test");
    }

    #[test]
    fn test_hi_target_patterns() {
        let a = HiAdapter;
        assert_eq!(a.extract_target("टेम्पलेट इंजन"), "template_engine");
        assert_eq!(a.extract_target("स्टेट मशीन"), "state_machine");
        assert_eq!(a.extract_target("इवेंट एमिटर"), "event_emitter");
        assert_eq!(a.extract_target("ऑब्ज़र्वर पैटर्न"), "observer_pattern");
        assert_eq!(a.extract_target("फ़ैक्टरी पैटर्न"), "factory_pattern");
        assert_eq!(a.extract_target("सिंगलटन पैटर्न"), "singleton_pattern");
        assert_eq!(a.extract_target("बिल्डर पैटर्न"), "builder_pattern");
    }

    #[test]
    fn test_hi_compound_file_db() {
        let a = HiAdapter;
        // "फ़ाइल पढ़ो और डेटाबेस में सेव करो" → file_reader matched first
        let target = a.extract_target("फ़ाइल पढ़ो और डेटाबेस में सेव करो");
        assert_eq!(target, "file_reader");
    }

    #[test]
    fn test_hi_compound_auth_api() {
        let a = HiAdapter;
        // "REST API बनाओ प्रमाणीकरण के साथ" → REST API matched first
        let target = a.extract_target("REST API बनाओ प्रमाणीकरण के साथ");
        assert_eq!(target, "rest_api");
    }

    #[test]
    fn test_hi_constraints_expanded() {
        let a = HiAdapter;
        let cs = a.extract_constraints("प्रमाणीकरण और कतार के साथ ईमेल भेजो");
        assert!(cs.contains(&"auth".to_string()));
        assert!(cs.contains(&"queue".to_string()));
        assert!(cs.contains(&"email".to_string()));
    }
}
