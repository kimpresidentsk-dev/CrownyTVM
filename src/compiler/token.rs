// ═══════════════════════════════════════════════════════════════
// 한선씨 토큰 — 한국어 키워드 + 4세대 온톨로직 확장
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // ═══ 리터럴 ═══
    IntLit(i64),
    FloatLit(f64),
    StrLit(String),
    TritTi,         // 티 / ▲
    TritOm,         // 옴 / ■
    TritTa,         // 타 / ▼

    // ═══ 식별자 ═══
    Ident(String),

    // ═══ 키워드: 변수/함수 ═══
    KwLet,          // 변수 / 놓다
    KwConst,        // 상수
    KwFn,           // 함수 / 씨
    KwReturn,       // 반환 / 돌려
    KwImport,       // 가져오기
    KwExport,       // 내보내기
    KwModule,       // 모듈

    // ═══ 키워드: 제어 ═══
    KwIf,           // 만약
    KwElseIf,       // 혹시
    KwElse,         // 아니면
    KwIf3,          // 만약3 (3분기: 긍정/보류/부정)
    KwMatch,        // 맞춰
    KwLoop,         // 반복
    KwWhile,        // 동안
    KwFor,          // 각각
    KwIn,           // 에서
    KwBreak,        // 멈춰
    KwContinue,     // 계속

    // ═══ 키워드: 타입 ═══
    KwInt,          // 정수
    KwFloat,        // 실수
    KwStr,          // 문자열
    KwBool,         // 참거짓
    KwTrit,         // 트릿
    KwArray,        // 배열
    KwMap,          // 객체

    // ═══ 키워드: 에러 ═══
    KwTry,          // 시도
    KwCatch,        // 잡아
    KwThrow,        // 던져

    // ═══ 키워드: 출력 ═══
    KwPrint,        // 출력
    KwInput,        // 입력

    // ═══ 4세대 온톨로직 키워드 ═══
    KwClaim,        // 주장
    KwEvidence,     // 근거
    KwState,        // 상태 (인식상태 조회)
    KwConfidence,   // 확신
    KwDecide,       // 결정
    KwTransition,   // 전이
    KwEpTi,         // 확정
    KwEpOm,         // 미확인
    KwEpTa,         // 오해
    KwEpEum,        // 미인지

    // ═══ 연산자 ═══
    Plus, Minus, Star, Slash, Percent,
    Eq, Neq, Gt, Lt, Gte, Lte,
    Assign,         // =
    Arrow,          // ->
    FatArrow,       // =>
    And, Or, Not,   // 그리고/또는/아닌
    Dot,            // .
    DotDot,         // ..
    Comma, Colon, Semicolon,
    LParen, RParen, LBrack, RBrack, LBrace, RBrace,

    // ═══ Stage 1: 내장/시스템 ═══
    KwBuiltin,      // __내장__
    KwSyscall,      // __sys__

    // ═══ 특수 ═══
    Newline,
    Eof,
}

impl Token {
    /// 한국어/영어 키워드 매핑
    pub fn from_keyword(word: &str) -> Option<Token> {
        match word {
            // 변수/함수
            "변수" | "놓다" | "let" => Some(Token::KwLet),
            "상수" | "const" => Some(Token::KwConst),
            "함수" | "씨" | "fn" => Some(Token::KwFn),
            "반환" | "돌려" | "return" => Some(Token::KwReturn),
            "가져오기" | "import" => Some(Token::KwImport),
            "내보내기" | "export" => Some(Token::KwExport),
            "모듈" | "module" => Some(Token::KwModule),

            // 제어
            "만약" | "if" => Some(Token::KwIf),
            "혹시" | "elif" => Some(Token::KwElseIf),
            "아니면" | "else" => Some(Token::KwElse),
            "만약3" | "if3" => Some(Token::KwIf3),
            "맞춰" | "match" => Some(Token::KwMatch),
            "반복" | "loop" => Some(Token::KwLoop),
            "동안" | "while" => Some(Token::KwWhile),
            "각각" | "for" => Some(Token::KwFor),
            "에서" | "in" => Some(Token::KwIn),
            "멈춰" | "break" => Some(Token::KwBreak),
            "계속" | "continue" => Some(Token::KwContinue),

            // 타입
            "정수" | "int" => Some(Token::KwInt),
            "실수" | "float" => Some(Token::KwFloat),
            "문자열" | "str" => Some(Token::KwStr),
            "참거짓" | "bool" => Some(Token::KwBool),
            "트릿" | "trit" => Some(Token::KwTrit),
            "배열" | "array" => Some(Token::KwArray),
            "객체" | "map" => Some(Token::KwMap),

            // 에러
            "시도" | "try" => Some(Token::KwTry),
            "잡아" | "catch" => Some(Token::KwCatch),
            "던져" | "throw" => Some(Token::KwThrow),

            // 출력
            "출력" | "print" => Some(Token::KwPrint),
            "입력" | "input" => Some(Token::KwInput),

            // 3진 값
            "티" | "긍정" => Some(Token::TritTi),
            "옴" | "보류" => Some(Token::TritOm),
            "타" | "부정" => Some(Token::TritTa),
            "참" | "true" => Some(Token::TritTi),
            "거짓" | "false" => Some(Token::TritTa),

            // 4세대 온톨로직
            "주장" | "claim" => Some(Token::KwClaim),
            "근거" | "evidence" => Some(Token::KwEvidence),
            "상태" | "state" => Some(Token::KwState),
            "확신" | "confidence" => Some(Token::KwConfidence),
            "결정" | "decide" => Some(Token::KwDecide),
            "전이" | "transition" => Some(Token::KwTransition),
            "확정" => Some(Token::KwEpTi),
            "미확인" => Some(Token::KwEpOm),
            "오해" => Some(Token::KwEpTa),
            "미인지" => Some(Token::KwEpEum),

            // Stage 1: 내장/시스템
            "__내장__" | "__builtin__" => Some(Token::KwBuiltin),
            "__sys__" | "__syscall__" => Some(Token::KwSyscall),

            // 논리
            "그리고" | "and" => Some(Token::And),
            "또는" | "or" => Some(Token::Or),
            "아닌" | "not" => Some(Token::Not),

            _ => None,
        }
    }
}
