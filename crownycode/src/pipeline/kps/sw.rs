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
            // expanded markers from seed intents
            "wavuti", "kipanga", "kichanganuzi", "hifadhidata",
            "mteja", "kashe", "uthibitishaji", "usimbaji",
            "mfanyakazi", "foleni", "ratiba", "rekodi",
            "kumbukumbu", "ukandamizaji", "kithibitishaji",
            "barua pepe", "picha", "majaribio", "tafadhali",
            "kuchuja", "kipunguza", "templeti", "tukio",
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
            ("uhalali",     "auth"),        // authentication
            ("uthibitishaji","auth"),       // authentication
            ("foleni",      "queue"),       // queue
            ("ratiba",      "scheduling"),  // scheduling
            ("barua pepe",  "email"),       // email
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
        let result = input.to_lowercase();

        // 스와힐리어 → 영어 핵심 명사 매핑 (long patterns first)
        let noun_map: &[(&str, &str)] = &[
            // ── Web/Network ──
            ("seva ya http", "http_server"), ("seva ya wavuti", "http_server"),
            ("seva ya websocket", "websocket_server"), ("websocket", "websocket_server"),
            ("seva ya tcp", "tcp_server"),
            ("api ya rest", "rest_api"),
            ("kuchuja wavuti", "web_scraper"), ("scraper", "web_scraper"),
            ("kipanga njia", "url_router"), ("router", "url_router"),
            ("seva", "http_server"),
            ("api", "rest_api"),
            // ── Algorithms ──
            ("kazi ya kupanga", "sort_function"), ("kupanga", "sort_function"),
            ("utafutaji wa binary", "binary_search"), ("tafuta", "binary_search"),
            // ── File I/O ──
            ("msomaji wa faili", "file_reader"), ("soma faili", "file_reader"),
            ("mwandishi wa faili", "file_writer"), ("andika faili", "file_writer"),
            // ── Parsers ──
            ("kichanganuzi cha json", "json_parser"), ("json parser", "json_parser"),
            ("kichanganuzi cha csv", "csv_parser"), ("csv parser", "csv_parser"),
            ("kichanganuzi cha html", "html_parser"), ("html parser", "html_parser"),
            ("kichanganuzi cha xml", "xml_parser"), ("xml parser", "xml_parser"),
            ("usemi wa kawaida", "regex_matcher"), ("regex", "regex_matcher"),
            // ── DB/Cache ──
            ("mteja wa hifadhidata", "database_client"), ("hifadhidata", "database_client"), ("database", "database_client"),
            ("hoja ya sql", "sql_query"), ("sql", "sql_query"),
            ("mteja wa kashe", "cache_client"), ("kashe", "cache_client"), ("cache", "cache_client"),
            ("mteja wa redis", "redis_client"), ("redis", "redis_client"),
            ("muundo wa orm", "orm_model"), ("orm", "orm_model"),
            // ── CLI/Config ──
            ("programu ya cli", "cli_tool"), ("zana ya cli", "cli_tool"), ("cli", "cli_tool"),
            ("kichanganuzi cha hoja", "argument_parser"),
            ("kipakiaji cha usanidi", "config_loader"), ("usanidi", "config_loader"),
            // ── Auth/Security ──
            ("uthibitishaji", "auth_handler"), ("uhalali", "auth_handler"),
            ("jwt", "jwt_handler"),
            ("usimbaji fiche", "encryption"), ("fiche", "encryption"),
            ("kufinyanga", "hashing"), ("hashing", "hashing"),
            // ── Async/Workers ──
            ("mfanyakazi wa foleni", "queue_worker"), ("foleni", "queue_worker"),
            ("kipanga ratiba", "task_scheduler"), ("ratiba", "task_scheduler"),
            ("kazi ya cron", "cron_job"), ("cron", "cron_job"),
            // ── Logging/Metrics ──
            ("mkusanyaji wa vipimo", "metrics_collector"), ("vipimo", "metrics_collector"),
            ("rekodi", "logger"), ("kumbukumbu", "logger"),
            // ── Data Processing ──
            ("kichanganuzi data", "data_processor"), ("data", "data_processor"),
            ("kubadilisha kuwa mfuatano", "serializer"),
            ("deserializer", "deserializer"), ("serializer", "serializer"),
            ("ukandamizaji", "compression"), ("finya", "compression"),
            // ── Middleware/Web ──
            ("kati", "middleware"), ("middleware", "middleware"),
            ("kipunguza kasi", "rate_limiter"), ("rate limiter", "rate_limiter"),
            ("kithibitishaji", "validator"), ("thibitisha", "validator"),
            // ── Output ──
            ("mtumaji barua pepe", "email_sender"), ("barua pepe", "email_sender"),
            ("kichanganuzi picha", "image_processor"), ("picha", "image_processor"),
            ("kizazi cha pdf", "pdf_generator"), ("pdf", "pdf_generator"),
            // ── Testing ──
            ("jaribio la ujumuishaji", "integration_test"),
            ("jaribio la kitengo", "unit_test"), ("majaribio", "unit_test"),
            // ── Design Patterns ──
            ("injini ya templeti", "template_engine"), ("templeti", "template_engine"),
            ("mashine ya hali", "state_machine"),
            ("kitumaji tukio", "event_emitter"), ("tukio", "event_emitter"),
            ("muundo wa mwangalizi", "observer_pattern"),
            ("muundo wa kiwanda", "factory_pattern"),
            ("muundo wa singleton", "singleton_pattern"),
            ("muundo wa mjenzi", "builder_pattern"),
        ];
        for (sw, en) in noun_map {
            if result.contains(sw) {
                return en.to_string();
            }
        }

        // Noise removal only in fallback path
        const NOISE: &[&str] = &[
            "unda", "tengeneza", "andika", "jenga", "fanya", "weka", "sanidi",
            "kwa python", "kwa rust",
            "haraka", "salama", "rahisi",
            "tafadhali", "niambie", "nipe",
        ];
        let mut cleaned = result;
        for n in NOISE {
            cleaned = cleaned.replace(n, " ");
        }
        cleaned.split_whitespace()
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

    // ── 51 seed intent tests ──

    #[test]
    fn test_sw_target_all_web() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("seva ya http"), "http_server");
        assert_eq!(a.extract_target("seva ya wavuti"), "http_server");
        assert_eq!(a.extract_target("api ya rest"), "rest_api");
        assert_eq!(a.extract_target("seva ya websocket"), "websocket_server");
        assert_eq!(a.extract_target("seva ya tcp"), "tcp_server");
        assert_eq!(a.extract_target("kuchuja wavuti"), "web_scraper");
        assert_eq!(a.extract_target("kipanga njia"), "url_router");
    }

    #[test]
    fn test_sw_target_algorithms() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("kazi ya kupanga"), "sort_function");
        assert_eq!(a.extract_target("utafutaji wa binary"), "binary_search");
    }

    #[test]
    fn test_sw_target_file_io() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("msomaji wa faili"), "file_reader");
        assert_eq!(a.extract_target("soma faili"), "file_reader");
        assert_eq!(a.extract_target("mwandishi wa faili"), "file_writer");
    }

    #[test]
    fn test_sw_target_parsers() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("kichanganuzi cha json"), "json_parser");
        assert_eq!(a.extract_target("kichanganuzi cha csv"), "csv_parser");
        assert_eq!(a.extract_target("kichanganuzi cha html"), "html_parser");
        assert_eq!(a.extract_target("kichanganuzi cha xml"), "xml_parser");
        assert_eq!(a.extract_target("usemi wa kawaida"), "regex_matcher");
    }

    #[test]
    fn test_sw_target_database() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("mteja wa hifadhidata"), "database_client");
        assert_eq!(a.extract_target("hoja ya sql"), "sql_query");
        assert_eq!(a.extract_target("mteja wa kashe"), "cache_client");
        assert_eq!(a.extract_target("mteja wa redis"), "redis_client");
        assert_eq!(a.extract_target("muundo wa orm"), "orm_model");
    }

    #[test]
    fn test_sw_target_cli() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("programu ya cli"), "cli_tool");
        assert_eq!(a.extract_target("zana ya cli"), "cli_tool");
        assert_eq!(a.extract_target("kichanganuzi cha hoja"), "argument_parser");
        assert_eq!(a.extract_target("kipakiaji cha usanidi"), "config_loader");
    }

    #[test]
    fn test_sw_target_auth() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("uthibitishaji"), "auth_handler");
        assert_eq!(a.extract_target("uhalali"), "auth_handler");
        assert_eq!(a.extract_target("jwt"), "jwt_handler");
        assert_eq!(a.extract_target("usimbaji fiche"), "encryption");
        assert_eq!(a.extract_target("kufinyanga"), "hashing");
    }

    #[test]
    fn test_sw_target_async() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("mfanyakazi wa foleni"), "queue_worker");
        assert_eq!(a.extract_target("kipanga ratiba"), "task_scheduler");
        assert_eq!(a.extract_target("kazi ya cron"), "cron_job");
    }

    #[test]
    fn test_sw_target_logging() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("rekodi"), "logger");
        assert_eq!(a.extract_target("mkusanyaji wa vipimo"), "metrics_collector");
    }

    #[test]
    fn test_sw_target_data() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("kichanganuzi data"), "data_processor");
        assert_eq!(a.extract_target("kubadilisha kuwa mfuatano"), "serializer");
        assert_eq!(a.extract_target("deserializer"), "deserializer");
        assert_eq!(a.extract_target("ukandamizaji"), "compression");
    }

    #[test]
    fn test_sw_target_web_middleware() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("kati"), "middleware");
        assert_eq!(a.extract_target("kipunguza kasi"), "rate_limiter");
        assert_eq!(a.extract_target("kithibitishaji"), "validator");
    }

    #[test]
    fn test_sw_target_output() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("mtumaji barua pepe"), "email_sender");
        assert_eq!(a.extract_target("kichanganuzi picha"), "image_processor");
        assert_eq!(a.extract_target("kizazi cha pdf"), "pdf_generator");
    }

    #[test]
    fn test_sw_target_testing() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("jaribio la kitengo"), "unit_test");
        assert_eq!(a.extract_target("jaribio la ujumuishaji"), "integration_test");
    }

    #[test]
    fn test_sw_target_patterns() {
        let a = SwAdapter;
        assert_eq!(a.extract_target("injini ya templeti"), "template_engine");
        assert_eq!(a.extract_target("mashine ya hali"), "state_machine");
        assert_eq!(a.extract_target("kitumaji tukio"), "event_emitter");
        assert_eq!(a.extract_target("muundo wa mwangalizi"), "observer_pattern");
        assert_eq!(a.extract_target("muundo wa kiwanda"), "factory_pattern");
        assert_eq!(a.extract_target("muundo wa singleton"), "singleton_pattern");
        assert_eq!(a.extract_target("muundo wa mjenzi"), "builder_pattern");
    }

    #[test]
    fn test_sw_compound_file_db() {
        let a = SwAdapter;
        // "soma faili na uhifadhi kwenye database" has both file and db concepts
        let target = a.extract_target("soma faili na uhifadhi kwenye database");
        // Should match file_reader (soma faili appears first)
        assert_eq!(target, "file_reader");
    }

    #[test]
    fn test_sw_compound_auth_api() {
        let a = SwAdapter;
        // "tengeneza api yenye uthibitishaji" → api + auth
        let target = a.extract_target("tengeneza api yenye uthibitishaji");
        // api matches first after noise removal
        assert_eq!(target, "rest_api");
    }

    #[test]
    fn test_sw_constraints_expanded() {
        let a = SwAdapter;
        let cs = a.extract_constraints("programu yenye uthibitishaji na foleni ya barua pepe");
        assert!(cs.contains(&"auth".to_string()));
        assert!(cs.contains(&"queue".to_string()));
        assert!(cs.contains(&"email".to_string()));
    }

    #[test]
    fn test_sw_detect_expanded_markers() {
        let a = SwAdapter;
        // Multiple Swahili markers should give a high score
        assert!(a.detect_score("unda kichanganuzi cha hifadhidata kwa wavuti") > 0.5);
    }
}
