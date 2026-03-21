#![allow(dead_code)]
// crownycode/src/pipeline/codegen/mod.rs
// 코드 생성기 — IR 트리 → 대상 언어 코드

pub mod python;
pub mod rust;
pub mod crowny;
pub mod javascript;

use crate::error::{Result, bail};
use crate::pipeline::ir::IrTree;
use crate::phase::judge::Phase;

pub struct GenOptions {
    pub verbose_comments: bool,
    pub include_tests: bool,
    pub phase_meta: Phase,
}

/// IR 트리 + 대상 언어 → 코드 문자열
pub fn generate(ir: &IrTree, target: &str, opts: &GenOptions) -> Result<String> {
    // 언어 힌트가 있으면 우선 사용
    let effective_target = ir.lang_hint.as_deref().unwrap_or(target);

    match effective_target {
        "python" | "py" => python::generate(ir, opts),
        "rust" | "rs"  => rust::generate(ir, opts),
        "javascript" | "js" | "typescript" | "ts" => javascript::generate(ir, opts),
        "crowny"       => crowny::generate(ir, opts),
        other => bail!("지원하지 않는 대상 언어: {other}. (python | rust | javascript | crowny)"),
    }
}
