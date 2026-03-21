#![allow(dead_code)]
// src/template.rs — 파라미터화 패턴 엔진
//
// 정적 패턴: "TcpListener::bind(\"0.0.0.0:8080\")"
// 파라미터화: "TcpListener::bind(\"{{host}}:{{port}}\")"
//
// 사용자가 "HTTP 서버 포트 3000" → port=3000 자동 추출

use std::collections::HashMap;

/// 템플릿에서 {{변수}} 추출
pub fn extract_params(template: &str) -> Vec<String> {
    let mut params = Vec::new();
    let mut i = 0;
    let chars: Vec<char> = template.chars().collect();
    while i < chars.len().saturating_sub(1) {
        if chars[i] == '{' && chars.get(i + 1) == Some(&'{') {
            let start = i + 2;
            if let Some(end) = template[start..].find("}}") {
                let name = template[start..start + end].trim().to_string();
                if !params.contains(&name) {
                    params.push(name);
                }
                i = start + end + 2;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    params
}

/// 템플릿에 변수 적용
pub fn apply_params(template: &str, params: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in params {
        result = result.replace(&format!("{{{{{}}}}}", key), value);
    }
    result
}

/// 자연어에서 파라미터 추출
/// "HTTP 서버 포트 3000" → {"port": "3000"}
/// "REST API /api/v2" → {"path": "/api/v2"}
/// "데이터베이스 mydb.sqlite" → {"db_path": "mydb.sqlite"}
pub fn extract_params_from_input(input: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    let words: Vec<&str> = input.split_whitespace().collect();

    // Port detection: "포트 3000", "port 8080", ":3000"
    for (i, word) in words.iter().enumerate() {
        let w = word.to_lowercase();
        if (w == "포트" || w == "port" || w == "bandari") && i + 1 < words.len() {
            if let Ok(p) = words[i + 1].parse::<u16>() {
                params.insert("port".to_string(), p.to_string());
            }
        }
        if let Some(stripped) = w.strip_prefix(':') {
            if let Ok(p) = stripped.parse::<u16>() {
                params.insert("port".to_string(), p.to_string());
            }
        }
    }

    // Path detection: "/api/v2", "/users"
    for word in &words {
        if word.starts_with('/') && word.len() > 1 {
            params.insert("path".to_string(), word.to_string());
        }
    }

    // Host detection
    for (i, word) in words.iter().enumerate() {
        let w = word.to_lowercase();
        if (w == "호스트" || w == "host") && i + 1 < words.len() {
            params.insert("host".to_string(), words[i + 1].to_string());
        }
    }

    // DB path detection
    for (i, word) in words.iter().enumerate() {
        let w = word.to_lowercase();
        if (w == "db" || w == "database" || w == "데이터베이스") && i + 1 < words.len() {
            let next = words[i + 1];
            if next.contains('.') || next.contains('/') {
                params.insert("db_path".to_string(), next.to_string());
            }
        }
    }

    // Name detection: "이름 MyApp", "name MyServer"
    for (i, word) in words.iter().enumerate() {
        let w = word.to_lowercase();
        if (w == "이름" || w == "name") && i + 1 < words.len() {
            params.insert("name".to_string(), words[i + 1].to_string());
        }
    }

    // Set defaults if not found
    if !params.contains_key("port") {
        params.insert("port".to_string(), "8080".to_string());
    }
    if !params.contains_key("host") {
        params.insert("host".to_string(), "0.0.0.0".to_string());
    }
    if !params.contains_key("path") {
        params.insert("path".to_string(), "/".to_string());
    }
    if !params.contains_key("name") {
        params.insert("name".to_string(), "app".to_string());
    }
    if !params.contains_key("db_path") {
        params.insert("db_path".to_string(), "data.db".to_string());
    }

    params
}

/// Apply parameter extraction + template substitution to code
pub fn parameterize_code(code: &str, input: &str) -> String {
    let params = extract_params_from_input(input);
    let mut result = code.to_string();

    // Replace common hardcoded values with extracted params
    // Port
    if let Some(port) = params.get("port") {
        // Replace common port patterns
        result = result.replace(":8080", &format!(":{}", port));
        result = result.replace(":3000", &format!(":{}", port));
        result = result.replace(":9000", &format!(":{}", port));
        result = result.replace("8080", port);
        result = result.replace("3000", port);
    }

    // Host
    if let Some(host) = params.get("host") {
        if host != "0.0.0.0" {
            result = result.replace("0.0.0.0", host);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_params() {
        let params = extract_params("bind(\"{{host}}:{{port}}\")");
        assert_eq!(params, vec!["host", "port"]);
    }

    #[test]
    fn test_apply_params() {
        let mut p = HashMap::new();
        p.insert("port".to_string(), "3000".to_string());
        p.insert("host".to_string(), "localhost".to_string());
        let result = apply_params("bind(\"{{host}}:{{port}}\")", &p);
        assert_eq!(result, "bind(\"localhost:3000\")");
    }

    #[test]
    fn test_extract_from_input_port() {
        let p = extract_params_from_input("HTTP 서버 포트 3000");
        assert_eq!(p.get("port").unwrap(), "3000");
    }

    #[test]
    fn test_extract_from_input_port_english() {
        let p = extract_params_from_input("HTTP server port 9090");
        assert_eq!(p.get("port").unwrap(), "9090");
    }

    #[test]
    fn test_extract_from_input_path() {
        let p = extract_params_from_input("REST API /api/v2");
        assert_eq!(p.get("path").unwrap(), "/api/v2");
    }

    #[test]
    fn test_parameterize_code() {
        let code = "TcpListener::bind(\"0.0.0.0:8080\")";
        let result = parameterize_code(code, "HTTP 서버 포트 3000");
        assert!(result.contains(":3000"), "got: {}", result);
    }

    #[test]
    fn test_default_params() {
        let p = extract_params_from_input("HTTP 서버 만들어줘");
        assert_eq!(p.get("port").unwrap(), "8080"); // default
    }
}
