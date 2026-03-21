// crownycode/src/pipeline/codegen/crowny.rs
// 한선씨 IR → 크라우니어(ISA729) 코드 생성기 — Phase 5 완성

use anyhow::Result;
use crate::pipeline::ir::IrTree;
use crate::isa729::codegen::{generate as isa729_generate, CrownyGenOptions};
use super::GenOptions;

pub fn generate(ir: &IrTree, opts: &GenOptions) -> Result<String> {
    let crowny_opts = CrownyGenOptions {
        comments:           opts.verbose_comments,
        phase_annotations:  true,
    };
    isa729_generate(ir, &crowny_opts)
}
