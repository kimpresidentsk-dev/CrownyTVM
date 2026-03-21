// crownycode/src/pipeline/codegen/rust.rs
// 한선씨 IR → Rust 코드 생성기

use anyhow::Result;
use crate::pipeline::ir::{IrTree, IrNode, TypeHint, HttpMethod, Constraint};
use super::GenOptions;

pub fn generate(ir: &IrTree, opts: &GenOptions) -> Result<String> {
    let mut lines: Vec<String> = Vec::new();

    if opts.verbose_comments {
        lines.push("// 생성: crownycode v0.1 — 한선씨IR → Rust".to_string());
        lines.push(format!("// 의도: {}", ir.intent));
        lines.push(String::new());
    }

    let is_async = ir.constraints.contains(&Constraint::Async);
    let has_http = ir.nodes.iter().any(|n| matches!(n, IrNode::HttpRoute { .. }));

    if has_http {
        if is_async {
            lines.push("use axum::{routing::get, Router, Json};".to_string());
            lines.push("use serde_json::{json, Value};".to_string());
            lines.push("use tokio::net::TcpListener;".to_string());
        } else {
            lines.push("// HTTP 서버 (동기 버전 — async 제약 추가 시 Axum으로 전환)".to_string());
        }
        lines.push(String::new());
    }

    for node in &ir.nodes {
        emit_rust_node(&mut lines, node, opts, is_async);
        lines.push(String::new());
    }

    if has_http && is_async {
        lines.push("#[tokio::main]".to_string());
        lines.push("async fn main() {".to_string());
        lines.push("    let app = Router::new()".to_string());

        for node in &ir.nodes {
            if let IrNode::HttpRoute { method, path, handler } = node {
                if let IrNode::FunctionDef { name, .. } = handler.as_ref() {
                    let m = match method {
                        HttpMethod::Get    => "get",
                        HttpMethod::Post   => "post",
                        HttpMethod::Put    => "put",
                        HttpMethod::Delete => "delete",
                        HttpMethod::Patch  => "patch",
                    };
                    lines.push(format!("        .route(\"{path}\", {m}({name}))"));
                }
            }
        }

        lines.push("    ;".to_string());
        lines.push("    let listener = TcpListener::bind(\"0.0.0.0:3000\").await.unwrap();".to_string());
        lines.push("    println!(\"크라우니코드 서버: http://localhost:3000\");".to_string());
        lines.push("    axum::serve(listener, app).await.unwrap();".to_string());
        lines.push("}".to_string());
    }

    if opts.include_tests {
        lines.push(String::new());
        lines.push("#[cfg(test)]".to_string());
        lines.push("mod tests {".to_string());
        lines.push("    use super::*;".to_string());
        lines.push(String::new());
        lines.push("    // TODO: 자동 생성 테스트 (미확인 상태)".to_string());
        lines.push("}".to_string());
    }

    Ok(lines.join("\n"))
}

fn emit_rust_node(lines: &mut Vec<String>, node: &IrNode, opts: &GenOptions, is_async: bool) {
    match node {
        IrNode::HttpRoute { handler, .. } => {
            emit_rust_node(lines, handler, opts, is_async);
        }
        IrNode::FunctionDef { name, params, return_type, body, is_async: fn_async } => {
            let async_kw = if *fn_async || is_async { "async " } else { "" };
            let param_str = params.iter()
                .map(|p| format!("{}: {}", p.name,
                    p.type_hint.as_ref().map(type_to_rs).unwrap_or("_".to_string())))
                .collect::<Vec<_>>()
                .join(", ");
            let ret_str = return_type.as_ref()
                .map(|t| format!(" -> {}", type_to_rs(t)))
                .unwrap_or_default();

            lines.push(format!("pub {async_kw}fn {name}({param_str}){ret_str} {{"));
            if opts.verbose_comments {
                lines.push(format!("    // crownycode 생성: {name}"));
            }
            for stmt in body {
                match stmt {
                    IrNode::Return(Some(v)) => lines.push(format!("    {v}")),
                    IrNode::Return(None)    => lines.push("    ()".to_string()),
                    IrNode::RawLogic(t)     => {
                        lines.push(format!("    {t}"));
                        lines.push("    todo!()".to_string());
                    }
                    other => emit_rust_node(lines, other, opts, is_async),
                }
            }
            lines.push("}".to_string());
        }
        IrNode::RawLogic(text) => {
            for l in text.lines() {
                lines.push(l.to_string());
            }
        }
        IrNode::StructDef { name, fields } => {
            lines.push(format!("pub struct {name} {{"));
            for f in fields {
                let ty = f.type_hint.as_ref()
                    .map(type_to_rs)
                    .unwrap_or_else(|| "String".to_string());
                lines.push(format!("    pub {}: {},", f.name, ty));
            }
            lines.push("}".to_string());
        }
        IrNode::VarDecl { name, value, type_hint } => {
            let ty = type_hint.as_ref().map(type_to_rs);
            match (value, ty) {
                (Some(v), Some(t)) => lines.push(format!("let {name}: {t} = {v};")),
                (Some(v), None)    => lines.push(format!("let {name} = {v};")),
                (None, Some(t))    => lines.push(format!("let {name}: {t};")),
                (None, None)       => lines.push(format!("let {name};")),
            }
        }
        IrNode::Return(val) => {
            match val {
                Some(v) => lines.push(v.to_string()),
                None    => lines.push("()".to_string()),
            }
        }
    }
}

fn type_to_rs(t: &TypeHint) -> String {
    match t {
        TypeHint::String  => "String".to_string(),
        TypeHint::Int     => "i64".to_string(),
        TypeHint::Float   => "f64".to_string(),
        TypeHint::Bool    => "bool".to_string(),
        TypeHint::List(i) => format!("Vec<{}>", type_to_rs(i)),
        TypeHint::Dict(k,v) => format!("std::collections::HashMap<{},{}>", type_to_rs(k), type_to_rs(v)),
        TypeHint::Custom(s) => s.clone(),
    }
}
