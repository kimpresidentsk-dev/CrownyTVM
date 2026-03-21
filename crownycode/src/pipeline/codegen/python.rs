// crownycode/src/pipeline/codegen/python.rs
// 한선씨 IR → Python 코드 생성기

use crate::error::Result;
use crate::pipeline::ir::{IrTree, IrNode, TypeHint, HttpMethod, Constraint};
use super::GenOptions;

pub fn generate(ir: &IrTree, opts: &GenOptions) -> Result<String> {
    let mut out = CodeWriter::new();

    // 헤더 주석
    if opts.verbose_comments {
        out.line("# 생성: crownycode v0.1 — 한선씨IR → Python");
        out.line(&format!("# 의도: {}", ir.intent));
        if !ir.constraints.is_empty() {
            let cs: Vec<_> = ir.constraints.iter().map(|c| format!("{c:?}")).collect();
            out.line(&format!("# 제약: {}", cs.join(", ")));
        }
        out.blank();
    }

    // 임포트 분석
    let imports = collect_imports(ir);
    for imp in &imports {
        out.line(imp);
    }
    if !imports.is_empty() {
        out.blank();
    }

    // IR 노드 변환
    for node in &ir.nodes {
        emit_node(&mut out, node, opts, 0);
        out.blank();
    }

    // 미확인 상태 자동 테스트
    if opts.include_tests {
        out.blank();
        out.line("# ── 자동 생성 테스트 (미확인 상태) ──");
        out.line("import pytest");
        out.blank();
        emit_auto_tests(&mut out, ir);
    }

    Ok(out.finish())
}

fn collect_imports(ir: &IrTree) -> Vec<String> {
    let mut imports = Vec::new();
    let is_async = ir.constraints.contains(&Constraint::Async);

    // HTTP 서버 관련
    let has_http = ir.nodes.iter().any(|n| matches!(n, IrNode::HttpRoute { .. }));
    if has_http {
        if is_async {
            imports.push("from fastapi import FastAPI".to_string());
            imports.push("import uvicorn".to_string());
            if ir.constraints.contains(&Constraint::Async) {
                imports.push("import asyncio".to_string());
            }
        } else {
            imports.push("from flask import Flask, jsonify".to_string());
        }
    }

    imports
}

fn emit_node(out: &mut CodeWriter, node: &IrNode, opts: &GenOptions, indent: usize) {
    match node {
        IrNode::HttpRoute { method, path, handler } => {
            let is_async = extract_async(handler);
            let has_fastapi = is_async;

            if has_fastapi {
                // FastAPI 스타일
                if out.is_empty_of("app =") {
                    out.line("app = FastAPI()");
                    out.blank();
                }
                let method_str = method_str(method).to_lowercase();
                out.line(&format!("@app.{method_str}(\"{path}\")"));
                emit_node(out, handler, opts, indent);
            } else {
                // Flask 스타일
                if out.is_empty_of("app =") {
                    out.line("app = Flask(__name__)");
                    out.blank();
                }
                let method_str = method_str(method);
                out.line(&format!("@app.route(\"{path}\", methods=[\"{method_str}\"])"));
                emit_node(out, handler, opts, indent);
            }
        }

        IrNode::FunctionDef { name, params, return_type, body, is_async } => {
            let async_kw = if *is_async { "async " } else { "" };
            let param_str = params.iter()
                .map(|p| {
                    if let Some(t) = &p.type_hint {
                        format!("{}: {}", p.name, type_to_py(t))
                    } else {
                        p.name.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");

            let ret_str = return_type.as_ref()
                .map(|t| format!(" -> {}", type_to_py(t)))
                .unwrap_or_default();

            out.iline(indent, &format!("{async_kw}def {name}({param_str}){ret_str}:"));

            if opts.verbose_comments {
                out.iline(indent + 1, &format!("\"\"\"crownycode 생성: {name}\"\"\""));
            }

            if body.is_empty() {
                out.iline(indent + 1, "pass");
            } else {
                for stmt in body {
                    emit_node(out, stmt, opts, indent + 1);
                }
            }
        }

        IrNode::Return(val) => {
            match val {
                Some(v) => out.iline(indent, &format!("return {v}")),
                None    => out.iline(indent, "return"),
            }
        }

        IrNode::VarDecl { name, value, type_hint } => {
            let type_ann = type_hint.as_ref()
                .map(|t| format!(": {}", type_to_py(t)))
                .unwrap_or_default();
            match value {
                Some(v) => out.iline(indent, &format!("{name}{type_ann} = {v}")),
                None    => out.iline(indent, &format!("{name}{type_ann}")),
            }
        }

        IrNode::RawLogic(text) => {
            out.iline(indent, text);
            out.iline(indent, "pass");
        }

        IrNode::StructDef { name, fields } => {
            out.iline(indent, "from dataclasses import dataclass");
            out.blank();
            out.iline(indent, "@dataclass");
            out.iline(indent, &format!("class {name}:"));
            for f in fields {
                let type_str = f.type_hint.as_ref()
                    .map(|t| format!(": {}", type_to_py(t)))
                    .unwrap_or_default();
                out.iline(indent + 1, &format!("{}{}", f.name, type_str));
            }
        }

        // HttpRoute는 위쪽 match arm에서 모두 처리됨
    }
}

fn emit_auto_tests(out: &mut CodeWriter, ir: &IrTree) {
    let fn_names: Vec<_> = ir.nodes.iter()
        .filter_map(|n| match n {
            IrNode::FunctionDef { name, .. } => Some(name.clone()),
            IrNode::HttpRoute { handler, .. } => {
                if let IrNode::FunctionDef { name, .. } = handler.as_ref() {
                    Some(name.clone())
                } else {
                    None
                }
            }
            _ => None,
        })
        .collect();

    for name in &fn_names {
        out.line(&format!("def test_{name}_basic():"));
        out.iline(1, &format!("# TODO: {name} 기본 동작 검증"));
        out.iline(1, "pass");
        out.blank();
    }
}

fn type_to_py(t: &TypeHint) -> String {
    match t {
        TypeHint::String => "str".to_string(),
        TypeHint::Int    => "int".to_string(),
        TypeHint::Float  => "float".to_string(),
        TypeHint::Bool   => "bool".to_string(),
        TypeHint::List(inner) => format!("list[{}]", type_to_py(inner)),
        TypeHint::Dict(k, v)  => format!("dict[{}, {}]", type_to_py(k), type_to_py(v)),
        TypeHint::Custom(s)   => s.clone(),
    }
}

fn method_str(m: &HttpMethod) -> &'static str {
    match m {
        HttpMethod::Get    => "GET",
        HttpMethod::Post   => "POST",
        HttpMethod::Put    => "PUT",
        HttpMethod::Delete => "DELETE",
        HttpMethod::Patch  => "PATCH",
    }
}

fn extract_async(node: &IrNode) -> bool {
    match node {
        IrNode::FunctionDef { is_async, .. } => *is_async,
        _ => false,
    }
}

// ── 코드 작성기 헬퍼 ─────────────────────────────────────────

struct CodeWriter {
    buf: Vec<String>,
}

impl CodeWriter {
    fn new() -> Self { Self { buf: Vec::new() } }
    fn line(&mut self, s: &str) { self.buf.push(s.to_string()); }
    fn blank(&mut self) { self.buf.push(String::new()); }
    fn iline(&mut self, indent: usize, s: &str) {
        self.buf.push(format!("{}{}", "    ".repeat(indent), s));
    }
    fn is_empty_of(&self, needle: &str) -> bool {
        !self.buf.iter().any(|l| l.contains(needle))
    }
    fn finish(self) -> String {
        self.buf.join("\n")
    }
}
