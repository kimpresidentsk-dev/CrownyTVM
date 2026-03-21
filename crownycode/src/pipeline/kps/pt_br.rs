// crownycode/src/pipeline/kps/pt_br.rs
// Português (Brasil) KPS 어댑터
// 브라질 타겟 (BR) — 라틴아메리카 최대 개발자 커뮤니티
//
// 브라질 포르투갈어 코딩 요청 패턴:
//   "Crie um servidor HTTP"   → Create an HTTP server
//   "Faça uma API REST"       → Make a REST API
//   "Escreva uma função sort" → Write a sort function
//   "em Python"               → in Python

use super::adapter::LangAdapter;

pub struct PtBrAdapter;

impl LangAdapter for PtBrAdapter {
    fn lang_code(&self) -> &'static str { "pt-br" }

    fn detect_score(&self, input: &str) -> f32 {
        // 포르투갈어 고유 패턴 감지 (악센트 문자 + 포르투갈어 고빈도어)
        let pt_markers = [
            "crie", "faça", "faca", "escreva", "construa", "implemente",
            "criar", "fazer", "servidor", "função", "funcao",
            "em python", "em rust", "com python",
            "ção", "cao", "ões", "oes",
        ];
        let lower = input.to_lowercase();
        let hits = pt_markers.iter().filter(|m| lower.contains(*m)).count();
        (hits as f32 / 2.5).min(1.0)
    }

    fn extract_action(&self, input: &str) -> Option<String> {
        const ACTIONS: &[&str] = &[
            "crie",        // create (formal imperative)
            "cria",        // create (informal)
            "faça",        // make/do (formal)
            "faca",        // make/do (without accent)
            "escreva",     // write
            "construa",    // build
            "implemente",  // implement
            "desenvolva",  // develop
            "gere",        // generate
            "monte",       // assemble/set up
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
            ("em python",  "python"),
            ("com python", "python"),
            ("python",     "python"),
            ("em rust",    "rust"),
            ("com rust",   "rust"),
            ("rust",       "rust"),
            ("em javascript", "javascript"),
            ("em js",         "javascript"),
            ("em typescript", "typescript"),
            ("em go",         "go"),
            ("em java",       "java"),
            ("crowny",        "crowny"),
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
            ("assíncrono",  "async"),
            ("assíncrona",  "async"),
            ("assincrono",  "async"),
            ("assincrona",  "async"),
            ("async",       "async"),
            ("rápido",      "fast"),
            ("rapido",      "fast"),
            ("performático","fast"),
            ("seguro",      "safe"),
            ("simples",     "simple"),
            ("rest",        "rest"),
            ("restful",     "rest"),
            ("graphql",     "graphql"),
            ("websocket",   "websocket"),
            ("banco de dados", "database"),
            ("banco",       "database"),
            ("cache",       "cache"),
            ("autenticação","auth"),
            ("autenticacao","auth"),
            ("autenticac","auth"),
            ("jwt",         "auth"),
            ("testes",      "tested"),
            ("teste",       "tested"),
            ("log",         "logging"),
            ("docker",      "docker"),
            ("crud",        "crud"),
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
        // 포르투갈어 → 영어 핵심 명사 매핑
        const NOUN_MAP: &[(&str, &str)] = &[
            ("servidor http",    "http_server"),
            ("servidor web",     "http_server"),
            ("servidor",         "http_server"),
            ("api rest",         "rest_api"),
            ("api",              "rest_api"),
            ("função de ordenação", "sort_function"),
            ("função sort",      "sort_function"),
            ("ordenação",        "sort_function"),
            ("ferramenta cli",   "cli_tool"),
            ("banco de dados",   "database_client"),
            ("leitor de arquivo","file_reader"),
            ("testes unitários", "unit_test"),
            ("websocket",        "websocket_server"),
        ];
        let lower = input.to_lowercase();
        for (pt, en) in NOUN_MAP {
            if lower.contains(pt) {
                return en.to_string();
            }
        }

        const NOISE: &[&str] = &[
            "crie", "cria", "faça", "faca", "escreva", "construa",
            "implemente", "desenvolva", "gere", "monte",
            "em python", "em rust", "em javascript", "em go",
            "assíncrono", "assincrono", "rápido", "rapido",
            "seguro", "simples", "por favor", "me dê",
        ];
        let mut result = lower;
        for n in NOISE {
            result = result.replace(n, " ");
        }
        result.split_whitespace()
            .filter(|s| !s.is_empty() && s.len() > 2)
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
    fn test_pt_br_detect() {
        let a = PtBrAdapter;
        assert!(a.detect_score("Crie um servidor HTTP em Python") > 0.0);
    }

    #[test]
    fn test_pt_br_action() {
        let a = PtBrAdapter;
        assert_eq!(a.extract_action("Crie um servidor HTTP"), Some("crie".to_string()));
        assert_eq!(a.extract_action("Faça uma API REST"),     Some("faça".to_string()));
    }

    #[test]
    fn test_pt_br_target_mapping() {
        let a = PtBrAdapter;
        assert_eq!(a.extract_target("Crie um servidor HTTP"),     "http_server");
        assert_eq!(a.extract_target("faça uma api rest"),         "rest_api");
        assert_eq!(a.extract_target("função de ordenação"),       "sort_function");
    }

    #[test]
    fn test_pt_br_lang_hint() {
        let a = PtBrAdapter;
        assert_eq!(a.extract_lang_hint("Crie um servidor em Python"), Some("python".to_string()));
        assert_eq!(a.extract_lang_hint("faça em rust"),               Some("rust".to_string()));
    }

    #[test]
    fn test_pt_br_constraints() {
        let a = PtBrAdapter;
        let cs = a.extract_constraints("Crie uma API REST assíncrona com autenticação e testes");
        assert!(cs.contains(&"async".to_string()));
        assert!(cs.contains(&"rest".to_string()));
        assert!(cs.contains(&"auth".to_string()));
        assert!(cs.contains(&"tested".to_string()));
    }

    #[test]
    fn test_pt_br_full_parse() {
        let a = PtBrAdapter;
        let nodes = a.parse("Crie um servidor HTTP rápido em Python com testes");
        let kinds: Vec<_> = nodes.iter().map(|n| &n.kind).collect();
        assert!(kinds.contains(&&KpsKind::Action));
        assert!(kinds.contains(&&KpsKind::LangHint));
        assert!(kinds.contains(&&KpsKind::Constraint));
    }
}
