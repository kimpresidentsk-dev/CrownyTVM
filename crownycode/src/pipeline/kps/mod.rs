#![allow(dead_code)]
// crownycode/src/pipeline/kps/mod.rs
// KPS 파서 모듈 루트
// Phase 1: 어댑터 패턴으로 재구성
// Phase 0 호환성 유지 — parse() 시그니처 동일

pub mod adapter;
pub mod ko;
pub mod en;
pub mod sw;
pub mod hi;
pub mod pt_br;

use crate::error::Result;
use adapter::LangAdapter;

/// KPS 노드 — 의미 단위 (Phase 0에서 이전, 구조 동일)
#[derive(Debug, Clone)]
pub struct KpsNode {
    pub kind: KpsKind,
    pub text: String,
    pub tokens: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum KpsKind {
    Action,
    Target,
    Constraint,
    LangHint,
    Unknown,
}

// ── 언어 레지스트리 ───────────────────────────────────────────

/// 등록된 모든 어댑터
fn adapters() -> Vec<Box<dyn LangAdapter>> {
    vec![
        Box::new(ko::KoAdapter),
        Box::new(en::EnAdapter),
        Box::new(sw::SwAdapter),
        Box::new(hi::HiAdapter),
        Box::new(pt_br::PtBrAdapter),
        // Phase 5+: Box::new(hi::HiAdapter), Box::new(pt_br::PtBrAdapter), ...
    ]
}

/// 자동 언어 감지 후 적절한 어댑터로 파싱
/// Phase 0과 동일한 시그니처 유지 — 파이프라인 코드 변경 없음
pub fn parse(input: &str) -> Result<Vec<KpsNode>> {
    let adapters = adapters();

    // 각 어댑터의 감지 점수 계산
    let best = adapters.iter()
        .map(|a| (a.as_ref(), a.detect_score(input)))
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    let nodes = match best {
        Some((adapter, score)) if score > 0.05 => {
            adapter.parse(input)
        }
        _ => {
            // 감지 실패 → 영어 어댑터 폴백
            en::EnAdapter.parse(input)
        }
    };

    Ok(nodes)
}

/// 특정 언어 코드로 강제 파싱
pub fn parse_with_lang(input: &str, lang: &str) -> Result<Vec<KpsNode>> {
    let adapters = adapters();
    let adapter = adapters.iter()
        .find(|a| a.lang_code() == lang)
        .ok_or_else(|| crate::error::err!("지원하지 않는 언어: {lang}"))?;
    Ok(adapter.parse(input))
}

/// 지원 언어 목록
pub fn supported_langs() -> Vec<&'static str> {
    adapters().iter().map(|a| a.lang_code()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_detect_korean() {
        let nodes = parse("HTTP 서버 만들어줘").unwrap();
        assert!(!nodes.is_empty());
    }

    #[test]
    fn test_auto_detect_english() {
        let nodes = parse("create a web server in rust").unwrap();
        assert!(!nodes.is_empty());
        let hint = nodes.iter().find(|n| n.kind == KpsKind::LangHint);
        assert_eq!(hint.map(|n| n.tokens[0].as_str()), Some("rust"));
    }

    #[test]
    fn test_force_lang() {
        let nodes = parse_with_lang("create a server", "en").unwrap();
        assert!(!nodes.is_empty());
    }

    #[test]
    fn test_supported_langs() {
        let langs = supported_langs();
        assert!(langs.contains(&"ko"));
        assert!(langs.contains(&"en"));
    }
}
