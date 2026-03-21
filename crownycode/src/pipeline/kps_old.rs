// crownycode/src/pipeline/kps.rs
// KPS(크라우니 파싱 구조) 파서
// 자연어 입력 → 의미 노드 배열
//
// Phase 0: 규칙 기반 한국어/영어 파싱
// Phase 2+: 다국어 어댑터로 확장 예정

use anyhow::Result;

/// KPS 노드 — 의미 단위
#[derive(Debug, Clone)]
pub struct KpsNode {
    /// 노드 유형
    pub kind: KpsKind,
    /// 원본 텍스트 조각
    pub text: String,
    /// 추출된 의미 토큰
    pub tokens: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum KpsKind {
    /// 행위 동사 (만들어줘, 생성해줘, create, build)
    Action,
    /// 대상 명사 (HTTP 서버, 정렬 함수, web server)
    Target,
    /// 제약 조건 (빠르게, 메모리 효율적으로, async)
    Constraint,
    /// 언어/플랫폼 힌트 (Python으로, in Rust)
    LangHint,
    /// 미분류
    Unknown,
}

/// 자연어 문자열 → KPS 노드 배열
pub fn parse(input: &str) -> Result<Vec<KpsNode>> {
    let input = input.trim();
    let mut nodes = Vec::new();

    // 언어 힌트 먼저 추출 (가장 명확)
    if let Some(lang) = extract_lang_hint(input) {
        nodes.push(KpsNode {
            kind: KpsKind::LangHint,
            text: lang.clone(),
            tokens: vec![lang],
        });
    }

    // 행위 동사 추출
    if let Some(action) = extract_action(input) {
        nodes.push(KpsNode {
            kind: KpsKind::Action,
            text: action.clone(),
            tokens: vec![action],
        });
    }

    // 제약 조건 추출
    let constraints = extract_constraints(input);
    for c in constraints {
        nodes.push(KpsNode {
            kind: KpsKind::Constraint,
            text: c.clone(),
            tokens: vec![c],
        });
    }

    // 대상 추출 (나머지 핵심 명사구)
    let target = extract_target(input);
    nodes.push(KpsNode {
        kind: KpsKind::Target,
        text: target.clone(),
        tokens: tokenize(&target),
    });

    Ok(nodes)
}

// ── 내부 추출 함수들 ──────────────────────────────────────────

fn extract_action(input: &str) -> Option<String> {
    let ko_actions = [
        "만들어줘", "만들어", "생성해줘", "생성해", "작성해줘", "작성해",
        "구현해줘", "구현해", "짜줘", "짜", "코딩해줘",
    ];
    let en_actions = [
        "create", "make", "build", "write", "implement", "generate",
    ];

    for a in &ko_actions {
        if input.contains(a) {
            return Some(a.to_string());
        }
    }
    let lower = input.to_lowercase();
    for a in &en_actions {
        if lower.contains(a) {
            return Some(a.to_string());
        }
    }
    None
}

fn extract_lang_hint(input: &str) -> Option<String> {
    let hints: &[(&str, &str)] = &[
        ("파이썬으로", "python"),
        ("파이썬", "python"),
        ("python으로", "python"),
        ("러스트로", "rust"),
        ("러스트", "rust"),
        ("rust로", "rust"),
        ("in python", "python"),
        ("in rust", "rust"),
        ("크라우니어로", "crowny"),
    ];
    let lower = input.to_lowercase();
    for (pattern, lang) in hints {
        if lower.contains(pattern) {
            return Some(lang.to_string());
        }
    }
    None
}

fn extract_constraints(input: &str) -> Vec<String> {
    let mut found = Vec::new();
    let constraint_patterns = [
        ("비동기", "async"),
        ("async", "async"),
        ("빠르게", "fast"),
        ("빠른", "fast"),
        ("메모리 효율", "memory-efficient"),
        ("안전한", "safe"),
        ("간단한", "simple"),
        ("simple", "simple"),
        ("RESTful", "rest"),
        ("REST", "rest"),
    ];
    let lower = input.to_lowercase();
    for (pattern, norm) in &constraint_patterns {
        if lower.contains(&pattern.to_lowercase()) {
            if !found.contains(&norm.to_string()) {
                found.push(norm.to_string());
            }
        }
    }
    found
}

fn extract_target(input: &str) -> String {
    // 행위 동사와 언어 힌트, 조사를 제거한 핵심 명사구 추출
    let noise = [
        "만들어줘", "만들어", "생성해줘", "생성해", "작성해줘", "작성해",
        "구현해줘", "구현해", "짜줘", "짜", "코딩해줘",
        "파이썬으로", "파이썬", "러스트로", "러스트",
        "python으로", "rust로", "크라우니어로",
        "비동기", "빠르게", "빠른", "메모리 효율적으로", "안전한", "간단한",
        "으로", "를", "을", "의", "로",
        "create", "make", "build", "write", "implement",
        "in python", "in rust",
    ];
    let mut result = input.to_string();
    for n in &noise {
        result = result.replace(n, " ");
    }
    result.split_whitespace()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn tokenize(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|s| s.to_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ko_http_server() {
        let nodes = parse("HTTP 서버 만들어줘").unwrap();
        assert!(nodes.iter().any(|n| n.kind == KpsKind::Action));
        assert!(nodes.iter().any(|n| n.kind == KpsKind::Target));
    }

    #[test]
    fn test_en_with_lang() {
        let nodes = parse("create a REST API in python").unwrap();
        assert!(nodes.iter().any(|n| n.kind == KpsKind::LangHint));
        assert!(nodes.iter().any(|n| n.kind == KpsKind::Constraint));
    }
}
