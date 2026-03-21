// src/i18n.rs — 다국어 메시지 (5개국어)

/// Detect user language from LC_LANG, LANG, LANGUAGE env vars
pub fn detect_lang() -> &'static str {
    for var in &["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        if let Ok(val) = std::env::var(var) {
            let v = val.to_lowercase();
            if v.starts_with("sw") { return "sw"; }
            if v.starts_with("hi") { return "hi"; }
            if v.starts_with("pt") { return "pt"; }
            if v.starts_with("ko") { return "ko"; }
            if v.starts_with("en") { return "en"; }
        }
    }
    "en" // default to English for developing countries
}

/// Get a localized message. key must be a known key; unknown keys return "???".
pub fn msg(key: &str) -> &'static str {
    let lang = detect_lang();
    match (lang, key) {
        // ── Banner ──
        (_, "banner_name") => "CrownyCode v0.1",
        ("ko", "banner_desc") => "CrownyOS 네이티브 AI 코드 엔진",
        ("sw", "banner_desc") => "Injini ya msimbo ya AI ya CrownyOS",
        ("hi", "banner_desc") => "CrownyOS नेटिव AI कोड इंजन",
        ("pt", "banner_desc") => "Motor de código AI nativo CrownyOS",
        (_, "banner_desc") => "CrownyOS native AI code engine",

        // ── Auto-seed ──
        ("ko", "auto_seed_start") => "첫 실행: 기본 패턴 51개 자동 설치 중...",
        ("sw", "auto_seed_start") => "Uanzishaji wa kwanza: Kusanidi mifumo 51...",
        ("hi", "auto_seed_start") => "पहली बार: 51 बुनियादी पैटर्न स्थापित हो रहे हैं...",
        ("pt", "auto_seed_start") => "Primeira execução: instalando 51 padrões básicos...",
        (_, "auto_seed_start") => "First run: installing 51 basic patterns...",

        ("ko", "auto_seed_done") => "설치 완료! 이제 코드를 생성할 수 있습니다.",
        ("sw", "auto_seed_done") => "Imekamilika! Sasa unaweza kutengeneza msimbo.",
        ("hi", "auto_seed_done") => "स्थापना पूर्ण! अब आप कोड जनरेट कर सकते हैं।",
        ("pt", "auto_seed_done") => "Instalação concluída! Agora você pode gerar código.",
        (_, "auto_seed_done") => "Done! You can now generate code.",

        // ── Help ──
        ("ko", "help_usage") => "사용법: crownycode [옵션] <명령> [인수]",
        ("sw", "help_usage") => "Matumizi: crownycode [chaguo] <amri> [hoja]",
        ("hi", "help_usage") => "उपयोग: crownycode [विकल्प] <कमांड> [आर्ग्स]",
        ("pt", "help_usage") => "Uso: crownycode [opções] <comando> [args]",
        (_, "help_usage") => "Usage: crownycode [options] <command> [args]",

        ("ko", "help_commands") => "명령:",
        ("sw", "help_commands") => "Amri:",
        ("hi", "help_commands") => "कमांड:",
        ("pt", "help_commands") => "Comandos:",
        (_, "help_commands") => "Commands:",

        ("ko", "help_options") => "옵션:",
        ("sw", "help_options") => "Chaguo:",
        ("hi", "help_options") => "विकल्प:",
        ("pt", "help_options") => "Opções:",
        (_, "help_options") => "Options:",

        ("ko", "help_gen") => "gen <입력> [-t 언어] [-o 파일] [-v] [-e]  코드 생성",
        ("sw", "help_gen") => "gen <ingizo> [-t lugha] [-o faili] [-v] [-e]  tengeneza msimbo",
        ("hi", "help_gen") => "gen <इनपुट> [-t भाषा] [-o फ़ाइल] [-v] [-e]  कोड जनरेट",
        ("pt", "help_gen") => "gen <entrada> [-t lingua] [-o arquivo] [-v] [-e]  gerar código",
        (_, "help_gen") => "gen <input> [-t lang] [-o file] [-v] [-e]  generate code",

        ("ko", "help_intents") => "intents [언어]                사용 가능한 의도 목록",
        ("sw", "help_intents") => "intents [lugha]               orodha ya nia zinazopatikana",
        ("hi", "help_intents") => "intents [भाषा]                उपलब्ध इंटेंट सूची",
        ("pt", "help_intents") => "intents [lingua]              lista de intenções disponíveis",
        (_, "help_intents") => "intents [lang]                list available intents",

        ("ko", "help_tutorial") => "tutorial                      대화형 학습 가이드",
        ("sw", "help_tutorial") => "tutorial                      mwongozo wa kujifunza",
        ("hi", "help_tutorial") => "tutorial                      इंटरैक्टिव लर्निंग गाइड",
        ("pt", "help_tutorial") => "tutorial                      guia de aprendizado interativo",
        (_, "help_tutorial") => "tutorial                      interactive learning guide",

        ("ko", "help_status") => "status                        엔진 상태",
        ("sw", "help_status") => "status                        hali ya injini",
        ("hi", "help_status") => "status                        इंजन स्थिति",
        ("pt", "help_status") => "status                        estado do motor",
        (_, "help_status") => "status                        engine status",

        ("ko", "help_share") => "share <경로>                  패턴 공유용 내보내기",
        ("sw", "help_share") => "share <njia>                  hamisha mifumo kwa kushiriki",
        ("hi", "help_share") => "share <पथ>                    पैटर्न शेयरिंग के लिए निर्यात",
        ("pt", "help_share") => "share <caminho>               exportar padrões para compartilhar",
        (_, "help_share") => "share <path>                  export patterns for sharing",

        ("ko", "help_config") => "--config <경로>    설정 파일 (기본: crownycode.toml)",
        ("sw", "help_config") => "--config <njia>    faili ya usanidi (chaguo-msingi: crownycode.toml)",
        ("hi", "help_config") => "--config <पथ>      कॉन्फ़िग फ़ाइल (डिफ़ॉल्ट: crownycode.toml)",
        ("pt", "help_config") => "--config <caminho>  arquivo de config (padrão: crownycode.toml)",
        (_, "help_config") => "--config <path>    config file (default: crownycode.toml)",

        ("ko", "help_quiet") => "--quiet, -q        배너 숨김",
        ("sw", "help_quiet") => "--quiet, -q        ficha bango",
        ("hi", "help_quiet") => "--quiet, -q        बैनर छुपाएं",
        ("pt", "help_quiet") => "--quiet, -q        ocultar banner",
        (_, "help_quiet") => "--quiet, -q        hide banner",

        ("ko", "help_help") => "--help, -h         도움말",
        ("sw", "help_help") => "--help, -h         msaada",
        ("hi", "help_help") => "--help, -h         सहायता",
        ("pt", "help_help") => "--help, -h         ajuda",
        (_, "help_help") => "--help, -h         help",

        // ── Errors ──
        ("ko", "err_no_command") => "오류: 명령을 입력하세요",
        ("sw", "err_no_command") => "Kosa: tafadhali ingiza amri",
        ("hi", "err_no_command") => "त्रुटि: कृपया कमांड दर्ज करें",
        ("pt", "err_no_command") => "Erro: por favor insira um comando",
        (_, "err_no_command") => "Error: please enter a command",

        ("ko", "err_gen_input") => "오류: gen 명령에는 입력 문자열이 필요합니다",
        ("sw", "err_gen_input") => "Kosa: amri ya gen inahitaji maandishi ya ingizo",
        ("hi", "err_gen_input") => "त्रुटि: gen कमांड को इनपुट टेक्स्ट चाहिए",
        ("pt", "err_gen_input") => "Erro: comando gen precisa de texto de entrada",
        (_, "err_gen_input") => "Error: gen command requires input text",

        ("ko", "err_unknown_cmd") => "알 수 없는 명령",
        ("sw", "err_unknown_cmd") => "Amri isiyojulikana",
        ("hi", "err_unknown_cmd") => "अज्ञात कमांड",
        ("pt", "err_unknown_cmd") => "Comando desconhecido",
        (_, "err_unknown_cmd") => "Unknown command",

        // ── Generation ──
        ("ko", "instant_hit") => "즉시인출:",
        ("sw", "instant_hit") => "Imepatikana moja kwa moja:",
        ("hi", "instant_hit") => "तुरंत प्राप्त:",
        ("pt", "instant_hit") => "Busca direta:",
        (_, "instant_hit") => "Direct hit:",

        ("ko", "stats") => "통계:",
        ("sw", "stats") => "Takwimu:",
        ("hi", "stats") => "आंकड़े:",
        ("pt", "stats") => "Estatísticas:",
        (_, "stats") => "Stats:",

        ("ko", "saved_to") => "저장:",
        ("sw", "saved_to") => "Imehifadhiwa:",
        ("hi", "saved_to") => "सहेजा गया:",
        ("pt", "saved_to") => "Salvo em:",
        (_, "saved_to") => "Saved:",

        ("ko", "no_cells") => "저장된 셀 없음",
        ("sw", "no_cells") => "Hakuna seli zilizohifadhiwa",
        ("hi", "no_cells") => "कोई सेल नहीं मिला",
        ("pt", "no_cells") => "Nenhuma célula encontrada",
        (_, "no_cells") => "No cells found",

        // ── Syntax warnings ──
        ("ko", "warning") => "경고:",
        ("sw", "warning") => "Onyo:",
        ("hi", "warning") => "चेतावनी:",
        ("pt", "warning") => "Aviso:",
        (_, "warning") => "Warning:",

        ("ko", "share_hint") => "다른 사용자에게 공유하려면:",
        ("sw", "share_hint") => "Kushiriki na watumiaji wengine:",
        ("hi", "share_hint") => "अन्य उपयोगकर्ताओं के साथ साझा करने के लिए:",
        ("pt", "share_hint") => "Para compartilhar com outros usuários:",
        (_, "share_hint") => "To share with other users:",

        // Default
        (_, _) => "???",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_msg_returns_fallback_for_unknown() {
        assert_eq!(msg("nonexistent_key_xyz"), "???");
    }

    #[test]
    fn test_msg_banner_name() {
        assert_eq!(msg("banner_name"), "CrownyCode v0.1");
    }

    #[test]
    fn test_detect_lang_returns_string() {
        let lang = detect_lang();
        assert!(!lang.is_empty());
    }

    #[test]
    fn test_all_keys_have_english_fallback() {
        // All known keys should return something other than "???"
        let keys = [
            "banner_name", "banner_desc",
            "auto_seed_start", "auto_seed_done",
            "help_usage", "help_commands", "help_options",
            "help_gen", "help_intents", "help_tutorial", "help_status", "help_share",
            "err_no_command", "err_gen_input", "err_unknown_cmd",
            "instant_hit", "stats", "saved_to", "no_cells",
            "warning", "share_hint",
        ];
        for key in &keys {
            let result = msg(key);
            assert_ne!(result, "???", "key '{}' should have a translation", key);
        }
    }
}
