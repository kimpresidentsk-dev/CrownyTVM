// ═══════════════════════════════════════════════════════════════
// CrownyTVM v0.32.0 — 한선씨 컴파일러 + ISA729 VM
// 4세대 온톨로직 (Crowny 4-State Decision Ontology)
//
// 사용법:
//   crowny run <파일.han>    한선씨 파일 실행
//   crowny dis <파일.han>    디스어셈블
//   crowny repl              대화형 REPL
//   crowny test              내장 테스트 실행
// ═══════════════════════════════════════════════════════════════

use crowny_tvm::compiler;
use crowny_tvm::vm::TritVM;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    println!("▲■▼ CrownyTVM v0.32.0 — 4세대 온톨로직 균형3진 VM ▲■▼");
    println!("    한선씨(HanSeon-C) 729 ISA 컴파일러\n");

    if args.len() < 2 {
        run_tests();
        return;
    }

    match args[1].as_str() {
        "run" => {
            if args.len() < 3 { eprintln!("사용법: crowny run <파일.han>"); return; }
            run_file(&args[2]);
        }
        "dis" => {
            if args.len() < 3 { eprintln!("사용법: crowny dis <파일.han>"); return; }
            disassemble_file(&args[2]);
        }
        "repl" => run_repl(),
        "shell" => run_shell(),
        "test" => run_tests(),
        _ => {
            if args[1].ends_with(".han") { run_file(&args[1]); }
            else { eprintln!("알 수 없는 명령: {}", args[1]); }
        }
    }
}

fn run_file(path: &str) {
    let source = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => { eprintln!("파일 읽기 실패 '{}': {}", path, e); return; }
    };
    // 파일의 부모 디렉토리를 base_dir로 전달
    let base_dir = std::path::Path::new(path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or(".");
    run_source_with_base(&source, true, Some(base_dir));
}

fn disassemble_file(path: &str) {
    let source = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => { eprintln!("파일 읽기 실패 '{}': {}", path, e); return; }
    };
    let base_dir = std::path::Path::new(path).parent().and_then(|p| p.to_str());
    match compiler::compile_with_base(&source, base_dir) {
        Ok((code, consts)) => {
            let vm = TritVM::new(code, consts);
            println!("=== 디스어셈블 ===");
            print!("{}", vm.disassemble());
        }
        Err(e) => eprintln!("컴파일 에러: {}", e),
    }
}

fn run_repl() {
    println!("한선씨 REPL (종료: 'quit' 또는 Ctrl+C)\n");
    let stdin = std::io::stdin();
    let mut accumulated = String::new();

    loop {
        if accumulated.is_empty() { eprint!("한선» "); }
        else { eprint!("  ... "); }
        let _ = std::io::Write::flush(&mut std::io::stderr());

        let mut line = String::new();
        match stdin.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed == "quit" || trimmed == "종료" { break; }

        accumulated.push_str(&line);

        let opens = accumulated.chars().filter(|&c| c == '{').count();
        let closes = accumulated.chars().filter(|&c| c == '}').count();
        if opens > closes { continue; }

        let source = std::mem::take(&mut accumulated);
        run_source_with_base(&source, false, None);
    }
}

fn run_shell() {
    // std/터미널.han 로드 + 터미널_시작() 호출
    let shell_source = "가져오기 \"터미널\"\n터미널_시작()\n";
    let std_dir = find_std_dir();
    match compiler::compile_with_base(shell_source, std_dir.as_deref()) {
        Ok((code, consts)) => {
            let mut vm = TritVM::new(code, consts);
            vm.max_cycles = u64::MAX;
            vm.direct_output = true;
            match vm.run() {
                Ok(_) => {}
                Err(e) => eprintln!("셸 에러: {}", e),
            }
        }
        Err(e) => eprintln!("셸 컴파일 에러: {}", e),
    }
}

fn find_std_dir() -> Option<String> {
    // 실행 파일 기준으로 std/ 찾기
    let candidates = [
        "std",
        "examples/../std",
    ];
    for c in &candidates {
        if std::path::Path::new(c).join("터미널.han").exists() {
            return Some(c.to_string());
        }
    }
    // 실행 파일 위치 기준
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("../../std");
            if p.join("터미널.han").exists() {
                return p.to_str().map(|s| s.to_string());
            }
        }
    }
    Some("std".to_string())
}

fn run_source_with_base(source: &str, show_result: bool, base_dir: Option<&str>) {
    match compiler::compile_with_base(source, base_dir) {
        Ok((code, consts)) => {
            let mut vm = TritVM::new(code, consts);
            vm.max_cycles = 100_000_000;
            match vm.run() {
                Ok(result) => {
                    for line in &vm.output { println!("{}", line); }
                    if show_result && vm.output.is_empty() {
                        let s = result.to_string_val();
                        if s != "없음" { println!("→ {}", s); }
                    }
                }
                Err(e) => eprintln!("실행 에러: {}", e),
            }
        }
        Err(e) => eprintln!("컴파일 에러: {}", e),
    }
}

// ═══════════════════════════════════════════════════════════════
// 내장 테스트
// ═══════════════════════════════════════════════════════════════

fn run_tests() {
    println!("=== 한선씨 컴파일러 + VM 테스트 ===\n");
    let mut passed = 0;
    let mut failed = 0;

    macro_rules! test {
        ($name:expr, $source:expr, $expected:expr) => {
            match test_one($source) {
                Ok(output) => {
                    if output.trim() == $expected {
                        println!("  ✓ {}", $name);
                        passed += 1;
                    } else {
                        println!("  ✗ {} — 기대: '{}', 실제: '{}'", $name, $expected, output.trim());
                        failed += 1;
                    }
                }
                Err(e) => { println!("  ✗ {} — 에러: {}", $name, e); failed += 1; }
            }
        };
    }

    // ═══ 기본 산술 ═══
    test!("정수 덧셈", "출력(3 + 7)", "10");
    test!("정수 곱셈", "출력(6 * 7)", "42");
    test!("실수 연산", "출력(3.14 * 2.0)", "6.28");
    test!("문자열 결합", r#"출력("안녕" + "하세요")"#, "안녕하세요");
    test!("나머지", "출력(17 % 5)", "2");

    // ═══ 변수 ═══
    test!("변수 선언", "변수 x = 42\n출력(x)", "42");
    test!("변수 대입", "변수 x = 10\nx = x + 5\n출력(x)", "15");

    // ═══ 3진 논리 ═══
    test!("트릿 Ti", "출력(티)", "▲");
    test!("트릿 Om", "출력(옴)", "■");
    test!("트릿 Ta", "출력(타)", "▼");
    test!("3진 비교", "출력(5 > 3)", "▲");
    test!("3진 동등", "출력(5 == 5)", "▲");

    // ═══ 제어문 ═══
    test!("만약 참", r#"만약 (티) { 출력("예") }"#, "예");
    test!("만약 거짓",
        r#"만약 (타) { 출력("A") } 아니면 { 출력("B") }"#, "B");
    test!("동안 루프",
        "변수 합 = 0\n변수 i = 0\n동안 (i < 5) { 합 = 합 + i\ni = i + 1 }\n출력(합)", "10");

    // ═══ 함수 ═══
    test!("함수 호출",
        "함수 더하기(a, b) { 반환 a + b }\n출력(더하기(3, 4))", "7");
    test!("팩토리얼",
        "함수 팩(n) { 만약 (n < 2) { 반환 1 } 반환 n * 팩(n - 1) }\n출력(팩(5))", "120");

    // ═══ 배열 ═══
    test!("배열 리터럴", "변수 a = [10, 20, 30]\n출력(a[1])", "20");
    test!("배열 길이", "출력([1, 2, 3, 4, 5])", "[1, 2, 3, 4, 5]");

    // ═══ 3분기 (만약3) ═══
    test!("만약3 긍정",
        "변수 v = 티\n만약3 (v) { 긍정: { 출력(\"Ti\") } 보류: { 출력(\"Om\") } 부정: { 출력(\"Ta\") } }", "Ti");
    test!("만약3 보류",
        "변수 v = 옴\n만약3 (v) { 긍정: { 출력(\"Ti\") } 보류: { 출력(\"Om\") } 부정: { 출력(\"Ta\") } }", "Om");
    test!("만약3 부정",
        "변수 v = 타\n만약3 (v) { 긍정: { 출력(\"Ti\") } 보류: { 출력(\"Om\") } 부정: { 출력(\"Ta\") } }", "Ta");

    // ═══ 4세대 온톨로직 ═══
    test!("주장 생성",
        "주장 c1 = (\"프로젝트A\", \"상태\", \"안전\", 확정)\n출력(상태(c1))",
        "티(확정)");
    test!("주장 확신도",
        "주장 c1 = (\"고객A\", \"이탈위험\", \"높음\", 미확인)\n출력(확신(c1))",
        "0.35");
    test!("주장 근거추가 후 전이",
        "주장 c1 = (\"시장\", \"방향\", \"상승\", 미확인)\n근거(c1, \"EMA9 상향돌파\")\n전이(c1, 전진)\n출력(상태(c1))",
        "티(확정)");
    test!("의사결정 점수",
        "주장 c1 = (\"전략\", \"실행\", \"가능\", 확정)\n근거(c1, \"백테스트 통과\")\n근거(c1, \"자금 충분\")\n변수 점수 = 결정(c1, 0.9)\n출력(점수)",
        "0.36000000000000004");

    // ═══ 에러 처리 ═══
    test!("시도-잡아",
        "시도 { 던져 \"에러발생\" } 잡아(e) { 출력(e) }", "에러발생");

    // ═══ 각각(for) ═══
    test!("각각 루프",
        "변수 합 = 0\n각각 v 에서 [10, 20, 30] { 합 = 합 + v }\n출력(합)", "60");

    println!("\n=== 결과: {} 통과, {} 실패 (총 {}) ===", passed, failed, passed + failed);
    if failed == 0 { println!("모든 테스트 통과! ▲■▼"); }
}

fn test_one(source: &str) -> Result<String, String> {
    let (code, consts) = compiler::compile(source)?;
    let mut vm = TritVM::new(code, consts);
    vm.max_cycles = 1_000_000;
    match vm.run() {
        Ok(result) => {
            if vm.output.is_empty() {
                Ok(result.to_string_val())
            } else {
                Ok(vm.output.join("\n"))
            }
        }
        Err(e) => Err(format!("{}", e)),
    }
}
