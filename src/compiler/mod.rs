pub mod token;
pub mod lexer;
pub mod ast;
pub mod parser;
pub mod codegen;

use std::collections::HashSet;
use crate::vm::trit::{Instruction, ConstValue};
use ast::{Program, Stmt};
use lexer::Lexer;
use parser::Parser;
use codegen::CodeGen;

/// 한선씨 소스 → ISA729 바이트코드 컴파일 (모듈 로딩 포함)
pub fn compile(source: &str) -> Result<(Vec<Instruction>, Vec<ConstValue>), String> {
    compile_with_base(source, None)
}

/// base_dir을 지정할 수 있는 컴파일 함수
pub fn compile_with_base(source: &str, base_dir: Option<&str>) -> Result<(Vec<Instruction>, Vec<ConstValue>), String> {
    let mut lexer = Lexer::new(source);
    let tokens = lexer.tokenize()?;
    let mut parser = Parser::new(tokens);
    let mut program = parser.parse()?;

    // 모듈 로딩: 가져오기 문을 찾아서 해당 .han 파일의 AST를 병합
    let mut loaded = HashSet::new();
    resolve_imports(&mut program, &mut loaded, base_dir)?;

    let codegen = CodeGen::new();
    codegen.generate(&program)
}

/// 재귀적 모듈 해석: Import문을 찾아 해당 파일을 파싱하고 프로그램 앞에 병합
fn resolve_imports(program: &mut Program, loaded: &mut HashSet<String>, base_dir: Option<&str>) -> Result<(), String> {
    let mut imports_to_process = Vec::new();

    // 1. Import문 수집
    for stmt in program.iter() {
        if let Stmt::Import(name) = stmt {
            if !loaded.contains(name) {
                imports_to_process.push(name.clone());
            }
        }
    }

    // 2. 각 모듈 로드 및 파싱
    let mut prepend = Vec::new();
    for name in imports_to_process {
        loaded.insert(name.clone());
        let source = load_module(&name, base_dir)?;
        let mut lexer = Lexer::new(&source);
        let tokens = lexer.tokenize()?;
        let mut parser = Parser::new(tokens);
        let mut mod_program = parser.parse()?;

        // 재귀: 모듈이 가져오기하는 다른 모듈도 해석
        resolve_imports(&mut mod_program, loaded, base_dir)?;

        prepend.extend(mod_program);
    }

    // 3. 모듈 코드를 프로그램 앞에 삽입
    if !prepend.is_empty() {
        prepend.append(program);
        *program = prepend;
    }

    Ok(())
}

/// 모듈 이름 → 파일 경로 → 소스 코드
fn load_module(name: &str, base_dir: Option<&str>) -> Result<String, String> {
    // 검색 경로: 1) base_dir/std/ 2) ./std/ 3) exe 옆 std/
    let candidates = build_search_paths(name, base_dir);

    for path in &candidates {
        if let Ok(source) = std::fs::read_to_string(path) {
            return Ok(source);
        }
    }

    Err(format!("모듈 '{}' 찾을 수 없음. 검색: {:?}", name, candidates))
}

fn build_search_paths(name: &str, base_dir: Option<&str>) -> Vec<String> {
    let filename = format!("{}.han", name);
    let mut paths = Vec::new();

    // base_dir이 있으면 그 하위 std/ 검색
    if let Some(bd) = base_dir {
        paths.push(format!("{}/std/{}", bd, filename));
        paths.push(format!("{}/{}", bd, filename));
    }

    // 현재 작업 디렉토리의 std/
    paths.push(format!("std/{}", filename));
    paths.push(filename.clone());

    // 실행 파일 옆의 std/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(format!("{}/std/{}", dir.display(), filename));
        }
    }

    paths
}
