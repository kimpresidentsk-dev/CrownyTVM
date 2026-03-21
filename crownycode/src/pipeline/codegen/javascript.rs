// crownycode/src/pipeline/codegen/javascript.rs
// 한선씨 IR → JavaScript/TypeScript 코드 생성기

use crate::error::Result;
use crate::pipeline::ir::{IrTree, IrNode, TypeHint, HttpMethod, Constraint};
use super::GenOptions;

pub fn generate(ir: &IrTree, opts: &GenOptions) -> Result<String> {
    let mut out = CodeWriter::new();

    // 헤더 주석
    if opts.verbose_comments {
        out.line("// 생성: crownycode v0.1 — 한선씨IR → JavaScript");
        out.line(&format!("// 의도: {}", ir.intent));
        if !ir.constraints.is_empty() {
            let cs: Vec<_> = ir.constraints.iter().map(|c| format!("{c:?}")).collect();
            out.line(&format!("// 제약: {}", cs.join(", ")));
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

    // HTTP 서버 셋업
    let has_http = ir.nodes.iter().any(|n| matches!(n, IrNode::HttpRoute { .. }));
    if has_http {
        out.line("const app = express();");
        out.line("app.use(express.json());");
        out.blank();
    }

    // IR 노드 변환
    for node in &ir.nodes {
        emit_node(&mut out, node, opts, 0);
        out.blank();
    }

    // HTTP 서버 리슨
    if has_http {
        out.line("const PORT = process.env.PORT || 3000;");
        out.line("app.listen(PORT, () => {");
        out.iline(1, "console.log(`크라우니코드 서버: http://localhost:${PORT}`);");
        out.line("});");
        out.blank();
    }

    // 미확인 상태 자동 테스트
    if opts.include_tests {
        out.blank();
        out.line("// ── 자동 생성 테스트 (미확인 상태) ──");
        emit_auto_tests(&mut out, ir);
    }

    Ok(out.finish())
}

fn collect_imports(ir: &IrTree) -> Vec<String> {
    let mut imports = Vec::new();

    let has_http = ir.nodes.iter().any(|n| matches!(n, IrNode::HttpRoute { .. }));
    if has_http {
        imports.push("const express = require('express');".to_string());
    }

    let is_async = ir.constraints.contains(&Constraint::Async);
    if is_async {
        // Node.js async utilities if needed
        let has_non_http_async = ir.nodes.iter().any(|n|
            matches!(n, IrNode::FunctionDef { is_async: true, .. })
        );
        if has_non_http_async && !has_http {
            imports.push("const { promisify } = require('util');".to_string());
        }
    }

    imports
}

fn emit_node(out: &mut CodeWriter, node: &IrNode, opts: &GenOptions, indent: usize) {
    match node {
        IrNode::HttpRoute { method, path, handler } => {
            let method_str = method_str(method);
            out.iline(indent, &format!("app.{method_str}('{path}', "));
            match handler.as_ref() {
                IrNode::FunctionDef { name, params, body, is_async, .. } => {
                    let async_kw = if *is_async { "async " } else { "" };
                    let param_str = if params.is_empty() {
                        "req, res".to_string()
                    } else {
                        params.iter()
                            .map(|p| p.name.clone())
                            .collect::<Vec<_>>()
                            .join(", ")
                    };
                    out.append(&format!("{async_kw}({param_str}) => {{"));
                    if opts.verbose_comments {
                        out.iline(indent + 1, &format!("// crownycode 생성: {name}"));
                    }
                    if body.is_empty() {
                        out.iline(indent + 1, "res.json({ status: 'ok' });");
                    } else {
                        for stmt in body {
                            emit_node(out, stmt, opts, indent + 1);
                        }
                    }
                    out.iline(indent, "});");
                }
                _ => {
                    out.append("(req, res) => {");
                    out.iline(indent + 1, "res.json({ status: 'ok' });");
                    out.iline(indent, "});");
                }
            }
        }

        IrNode::FunctionDef { name, params, return_type: _, body, is_async } => {
            let async_kw = if *is_async { "async " } else { "" };
            let param_str = params.iter()
                .map(|p| p.name.clone())
                .collect::<Vec<_>>()
                .join(", ");

            out.iline(indent, &format!("{async_kw}function {name}({param_str}) {{"));

            if opts.verbose_comments {
                out.iline(indent + 1, &format!("// crownycode 생성: {name}"));
            }

            if body.is_empty() {
                out.iline(indent + 1, "// TODO: 구현");
            } else {
                for stmt in body {
                    emit_node(out, stmt, opts, indent + 1);
                }
            }
            out.iline(indent, "}");
        }

        IrNode::Return(val) => {
            match val {
                Some(v) => out.iline(indent, &format!("return {v};")),
                None    => out.iline(indent, "return;"),
            }
        }

        IrNode::VarDecl { name, value, type_hint: _ } => {
            match value {
                Some(v) => out.iline(indent, &format!("let {name} = {v};")),
                None    => out.iline(indent, &format!("let {name};")),
            }
        }

        IrNode::RawLogic(text) => {
            out.iline(indent, &format!("// {text}"));
            out.iline(indent, "// TODO: 구현");
        }

        IrNode::StructDef { name, fields } => {
            out.iline(indent, &format!("class {name} {{"));
            // constructor
            let param_str = fields.iter()
                .map(|f| f.name.clone())
                .collect::<Vec<_>>()
                .join(", ");
            out.iline(indent + 1, &format!("constructor({param_str}) {{"));
            for f in fields {
                out.iline(indent + 2, &format!("this.{0} = {0};", f.name));
            }
            out.iline(indent + 1, "}");
            out.iline(indent, "}");
        }
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

    if fn_names.is_empty() {
        return;
    }

    out.line(&format!("describe('{}', () => {{", ir.intent));
    for name in &fn_names {
        out.iline(1, &format!("it('{name} 기본 동작', () => {{"));
        out.iline(2, &format!("// TODO: {name} 기본 동작 검증"));
        out.iline(2, "expect(true).toBe(true);");
        out.iline(1, "});");
        out.blank();
    }
    out.line("});");
}

fn method_str(m: &HttpMethod) -> &'static str {
    match m {
        HttpMethod::Get    => "get",
        HttpMethod::Post   => "post",
        HttpMethod::Put    => "put",
        HttpMethod::Delete => "delete",
        HttpMethod::Patch  => "patch",
    }
}

#[allow(dead_code)]
fn type_to_jsdoc(t: &TypeHint) -> String {
    match t {
        TypeHint::String => "string".to_string(),
        TypeHint::Int    => "number".to_string(),
        TypeHint::Float  => "number".to_string(),
        TypeHint::Bool   => "boolean".to_string(),
        TypeHint::List(inner) => format!("Array<{}>", type_to_jsdoc(inner)),
        TypeHint::Dict(k, v)  => format!("Object.<{}, {}>", type_to_jsdoc(k), type_to_jsdoc(v)),
        TypeHint::Custom(s)   => s.clone(),
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
    fn append(&mut self, s: &str) {
        if let Some(last) = self.buf.last_mut() {
            last.push_str(s);
        } else {
            self.buf.push(s.to_string());
        }
    }
    fn finish(self) -> String {
        self.buf.join("\n")
    }
}
