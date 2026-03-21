#![allow(dead_code)]
// crownycode/src/pipeline/ir.rs
// 한선씨(HanSeon-C) IR — 중간 표현 노드 트리
// KPS 노드 배열 → IR 트리 → 코드 생성기 입력
//
// IR은 언어 독립적: 한 번 빌드하면 Python/Rust/크라우니어 모두 출력 가능

use anyhow::Result;
use crate::pipeline::kps::{KpsNode, KpsKind};

/// IR 트리 — 최상위 컨텍스트
#[derive(Debug, Clone)]
pub struct IrTree {
    /// 핵심 의도 (예: "http_server", "sort_function")
    pub intent: String,
    /// 복합 의도 목록 (복합 요청 시 여러 의도)
    pub sub_intents: Vec<String>,
    /// 최상위 IR 노드들
    pub nodes: Vec<IrNode>,
    /// 추출된 제약 조건
    pub constraints: Vec<Constraint>,
    /// 언어 힌트 (있으면 codegen에서 우선 사용)
    pub lang_hint: Option<String>,
}

/// IR 노드 유형
#[derive(Debug, Clone)]
pub enum IrNode {
    /// 함수 정의
    FunctionDef {
        name: String,
        params: Vec<Param>,
        return_type: Option<TypeHint>,
        body: Vec<IrNode>,
        is_async: bool,
    },
    /// 클래스/구조체 정의
    StructDef {
        name: String,
        fields: Vec<Param>,
    },
    /// HTTP 라우트 정의
    HttpRoute {
        method: HttpMethod,
        path: String,
        handler: Box<IrNode>,
    },
    /// 변수 선언
    VarDecl {
        name: String,
        value: Option<String>,
        type_hint: Option<TypeHint>,
    },
    /// 반환 문
    Return(Option<String>),
    /// 자유 텍스트 노드 (Phase 0 에서 복잡한 로직에 사용)
    RawLogic(String),
}

#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    pub type_hint: Option<TypeHint>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeHint {
    String,
    Int,
    Float,
    Bool,
    List(Box<TypeHint>),
    Dict(Box<TypeHint>, Box<TypeHint>),
    Custom(String),
}

#[derive(Debug, Clone)]
pub enum HttpMethod { Get, Post, Put, Delete, Patch }

#[derive(Debug, Clone, PartialEq)]
pub enum Constraint {
    Async,
    Fast,
    MemoryEfficient,
    Safe,
    Simple,
    Rest,
}

// ── KPS → IR 빌더 ─────────────────────────────────────────────

/// KPS 노드 배열을 IR 트리로 변환
pub fn build(kps_nodes: &[KpsNode]) -> Result<IrTree> {
    let raw_target = kps_nodes.iter()
        .find(|n| n.kind == KpsKind::Target)
        .map(|n| n.text.clone())
        .unwrap_or_default();
    let sub_intents = split_compound_intents(&raw_target);
    let intent = extract_intent(kps_nodes);
    let constraints = extract_constraints(kps_nodes);
    let lang_hint = kps_nodes.iter()
        .find(|n| n.kind == KpsKind::LangHint)
        .and_then(|n| n.tokens.first().cloned());

    let is_async = constraints.contains(&Constraint::Async);

    // 의도에 따른 IR 노드 구성
    let nodes = match intent_category(&intent) {
        IntentCategory::HttpServer => build_http_server_ir(is_async),
        IntentCategory::SortFunction => build_sort_ir(&intent),
        IntentCategory::DataProcessor => build_data_processor_ir(is_async),
        IntentCategory::Generic => build_generic_ir(&intent, &constraints),
    };

    Ok(IrTree { intent, nodes, sub_intents, constraints, lang_hint })
}

fn extract_intent(nodes: &[KpsNode]) -> String {
    nodes.iter()
        .find(|n| n.kind == KpsKind::Target)
        .map(|n| {
            // 영어로 정규화 (셀DB 저장 키 일관성)
            normalize_intent(&n.text)
        })
        .unwrap_or_else(|| "generic".to_string())
}

fn normalize_intent(text: &str) -> String {
    // 시드 51개 + 한국어 동의어 전부 매핑
    // 순서 중요: 긴 패턴을 먼저 매칭 (예: "rest api" > "api")
    const MAP: &[(&str, &str)] = &[
        // ── 웹/네트워크 ──
        ("rest api", "rest_api"),   ("restful api", "rest_api"),
        ("rest 서버", "rest_api"),  ("api 서버", "rest_api"),
        ("http 서버", "http_server"), ("http서버", "http_server"),
        ("웹 서버", "http_server"), ("웹서버", "http_server"),
        ("http server", "http_server"), ("web server", "http_server"),
        ("rest api", "rest_api"),
        ("websocket 서버", "websocket_server"), ("웹소켓 서버", "websocket_server"),
        ("websocket server", "websocket_server"),
        ("tcp 서버", "tcp_server"), ("tcp server", "tcp_server"),
        ("웹 스크래퍼", "web_scraper"), ("웹 크롤러", "web_scraper"),
        ("web scraper", "web_scraper"), ("web crawler", "web_scraper"),
        ("url 라우터", "url_router"), ("url router", "url_router"),
        ("라우터", "url_router"),
        // ── 알고리즘 ──
        ("정렬 함수", "sort_function"), ("정렬", "sort_function"),
        ("sort function", "sort_function"), ("sort", "sort_function"),
        ("이진 탐색", "binary_search"), ("이진탐색", "binary_search"),
        ("binary search", "binary_search"),
        // ── 파일 I/O ──
        ("파일 읽기", "file_reader"), ("파일 리더", "file_reader"),
        ("file reader", "file_reader"),
        ("파일 쓰기", "file_writer"), ("파일 라이터", "file_writer"),
        ("file writer", "file_writer"),
        // ── 파서 ──
        ("json 파서", "json_parser"), ("json파서", "json_parser"),
        ("json parser", "json_parser"),
        ("csv 파서", "csv_parser"), ("csv parser", "csv_parser"),
        ("html 파서", "html_parser"), ("html parser", "html_parser"),
        ("xml 파서", "xml_parser"), ("xml parser", "xml_parser"),
        ("정규식", "regex_matcher"), ("정규표현식", "regex_matcher"),
        ("regex", "regex_matcher"), ("regex matcher", "regex_matcher"),
        // ── DB/캐시 ──
        ("데이터베이스 클라이언트", "database_client"),
        ("db 클라이언트", "database_client"),
        ("database client", "database_client"),
        ("sql 쿼리", "sql_query"), ("sql query", "sql_query"),
        ("캐시 클라이언트", "cache_client"), ("캐시", "cache_client"),
        ("cache client", "cache_client"),
        ("redis 클라이언트", "redis_client"), ("레디스", "redis_client"),
        ("redis client", "redis_client"),
        ("orm 모델", "orm_model"), ("orm", "orm_model"),
        ("orm model", "orm_model"),
        // ── CLI / 설정 ──
        ("cli 도구", "cli_tool"), ("cli tool", "cli_tool"),
        ("cli 프로그램", "cli_tool"),
        ("인자 파서", "argument_parser"), ("argument parser", "argument_parser"),
        ("설정 로더", "config_loader"), ("config loader", "config_loader"),
        ("설정 파일", "config_loader"),
        // ── 인증/보안 ──
        ("인증 핸들러", "auth_handler"), ("인증", "auth_handler"),
        ("auth handler", "auth_handler"), ("authentication", "auth_handler"),
        ("jwt 핸들러", "jwt_handler"), ("jwt handler", "jwt_handler"),
        ("jwt", "jwt_handler"),
        ("암호화", "encryption"), ("encryption", "encryption"),
        ("해싱", "hashing"), ("해시", "hashing"), ("hashing", "hashing"),
        // ── 비동기/작업 ──
        ("큐 워커", "queue_worker"), ("queue worker", "queue_worker"),
        ("메시지 큐", "queue_worker"),
        ("작업 스케줄러", "task_scheduler"), ("task scheduler", "task_scheduler"),
        ("스케줄러", "task_scheduler"),
        ("크론 잡", "cron_job"), ("cron job", "cron_job"),
        ("크론", "cron_job"),
        // ── 로깅/모니터링 ──
        ("로거", "logger"), ("logger", "logger"), ("로깅", "logger"),
        ("메트릭 수집", "metrics_collector"), ("메트릭", "metrics_collector"),
        ("metrics collector", "metrics_collector"),
        // ── 데이터 처리 ──
        ("데이터 처리", "data_processor"), ("data processor", "data_processor"),
        ("역직렬화", "deserializer"), ("deserializer", "deserializer"),
        ("직렬화", "serializer"), ("serializer", "serializer"),
        ("압축", "compression"), ("compression", "compression"),
        // ── 미들웨어/웹 ──
        ("미들웨어", "middleware"), ("middleware", "middleware"),
        ("레이트 리미터", "rate_limiter"), ("속도 제한", "rate_limiter"),
        ("rate limiter", "rate_limiter"),
        ("유효성 검사", "validator"), ("검증기", "validator"),
        ("validator", "validator"),
        // ── 이메일/PDF/이미지 ──
        ("이메일 전송", "email_sender"), ("이메일", "email_sender"),
        ("email sender", "email_sender"),
        ("이미지 처리", "image_processor"), ("image processor", "image_processor"),
        ("pdf 생성", "pdf_generator"), ("pdf generator", "pdf_generator"),
        // ── 테스트 ──
        ("단위 테스트", "unit_test"), ("unit test", "unit_test"),
        ("통합 테스트", "integration_test"), ("integration test", "integration_test"),
        // ── 디자인 패턴 ──
        ("템플릿 엔진", "template_engine"), ("template engine", "template_engine"),
        ("상태 머신", "state_machine"), ("state machine", "state_machine"),
        ("이벤트 이미터", "event_emitter"), ("event emitter", "event_emitter"),
        ("옵저버 패턴", "observer_pattern"), ("observer pattern", "observer_pattern"),
        ("팩토리 패턴", "factory_pattern"), ("factory pattern", "factory_pattern"),
        ("싱글턴 패턴", "singleton_pattern"), ("singleton pattern", "singleton_pattern"),
        ("빌더 패턴", "builder_pattern"), ("builder pattern", "builder_pattern"),
    ];

    let lower = text.to_lowercase();
    for (pat, intent) in MAP {
        if lower.contains(pat) {
            return intent.to_string();
        }
    }
    // 영어 snake_case로 변환
    lower.split_whitespace()
        .collect::<Vec<_>>()
        .join("_")
}

/// 복합 의도 분할
///
/// "사용자 입력을 받아서 DB에 저장하는 API" 같은 복합 요청을
/// 여러 의도로 분리한다: [rest_api, database_client, validator]
pub fn split_compound_intents(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();

    // 복합 패턴 감지 — 연결 키워드로 분리
    const CONNECTORS_KO: &[&str] = &[
        "해서", "하고", "그리고", "다음에", "후에", "에서",
        "받아서", "저장하는", "보내는", "처리하는", "변환하는",
        "읽어서", "파싱해서", "검증하고", "암호화하고",
    ];
    const CONNECTORS_EN: &[&str] = &[
        " and ", " then ", " that ", " which ", " to ",
        " with ", " from ", " into ",
    ];

    // 구성 요소별 키워드 → 의도 매핑
    const COMPONENT_KO: &[(&str, &str)] = &[
        ("입력", "validator"), ("입력받", "validator"),
        ("검증", "validator"), ("유효성", "validator"),
        ("db에 저장", "database_client"), ("db 저장", "database_client"),
        ("데이터베이스에 저장", "database_client"),
        ("디비에 저장", "database_client"),
        ("저장하는", "database_client"), ("저장", "database_client"),
        ("파일에 저장", "file_writer"),
        ("api", "rest_api"), ("서버", "http_server"),
        ("파싱", "json_parser"), ("파서", "json_parser"),
        ("인증", "auth_handler"), ("로그인", "auth_handler"),
        ("이메일", "email_sender"), ("메일 보내", "email_sender"),
        ("캐시", "cache_client"), ("캐싱", "cache_client"),
        ("로그", "logger"), ("로깅", "logger"),
        ("암호화", "encryption"), ("해시", "hashing"),
        ("파일 읽", "file_reader"), ("파일 쓰", "file_writer"),
        ("이미지", "image_processor"),
        ("pdf", "pdf_generator"),
        ("큐", "queue_worker"), ("스케줄", "task_scheduler"),
        ("웹소켓", "websocket_server"),
        ("정렬", "sort_function"), ("검색", "binary_search"),
    ];
    const COMPONENT_EN: &[(&str, &str)] = &[
        ("input", "validator"), ("validate", "validator"),
        ("save to db", "database_client"), ("store in db", "database_client"),
        ("database", "database_client"), ("persist", "database_client"),
        ("api", "rest_api"), ("server", "http_server"),
        ("parse", "json_parser"), ("parser", "json_parser"),
        ("auth", "auth_handler"), ("login", "auth_handler"),
        ("email", "email_sender"), ("send mail", "email_sender"),
        ("cache", "cache_client"),
        ("log", "logger"),
        ("encrypt", "encryption"), ("hash", "hashing"),
        ("read file", "file_reader"), ("write file", "file_writer"),
        ("image", "image_processor"),
        ("pdf", "pdf_generator"),
        ("queue", "queue_worker"), ("schedule", "task_scheduler"),
        ("websocket", "websocket_server"),
        ("sort", "sort_function"), ("search", "binary_search"),
    ];

    // 먼저 단일 의도로 정규화 시도
    let single = normalize_intent(text);
    // 단일 매핑이 성공하고 generic이 아니면 단일 반환
    if !single.contains(' ') && single != lower.split_whitespace().collect::<Vec<_>>().join("_") {
        // 복합 키워드가 없으면 단일 반환
        let has_connector = CONNECTORS_KO.iter().any(|c| lower.contains(c))
            || CONNECTORS_EN.iter().any(|c| lower.contains(c));
        if !has_connector {
            return vec![single];
        }
    }

    // 복합 구성 요소 추출
    let mut intents = Vec::new();
    let components = if lower.chars().any(|c| ('\u{AC00}'..='\u{D7A3}').contains(&c)) {
        COMPONENT_KO
    } else {
        COMPONENT_EN
    };

    for (kw, intent) in components {
        if lower.contains(kw) && !intents.contains(&intent.to_string()) {
            intents.push(intent.to_string());
        }
    }

    if intents.is_empty() {
        vec![normalize_intent(text)]
    } else {
        intents
    }
}

fn extract_constraints(nodes: &[KpsNode]) -> Vec<Constraint> {
    let mut cs = Vec::new();
    for n in nodes.iter().filter(|n| n.kind == KpsKind::Constraint) {
        match n.tokens.first().map(|s| s.as_str()) {
            Some("async") => cs.push(Constraint::Async),
            Some("fast") => cs.push(Constraint::Fast),
            Some("memory-efficient") => cs.push(Constraint::MemoryEfficient),
            Some("safe") => cs.push(Constraint::Safe),
            Some("simple") => cs.push(Constraint::Simple),
            Some("rest") => cs.push(Constraint::Rest),
            _ => {}
        }
    }
    cs
}

// ── 의도 분류 ──────────────────────────────────────────────────

enum IntentCategory {
    HttpServer,
    SortFunction,
    DataProcessor,
    Generic,
}

fn intent_category(intent: &str) -> IntentCategory {
    match intent {
        s if s.contains("http_server") || s.contains("api_server")
            || s == "rest_api" => IntentCategory::HttpServer,
        "sort_function" => IntentCategory::SortFunction,
        s if s.contains("data_processor") => IntentCategory::DataProcessor,
        _ => IntentCategory::Generic,
    }
}

// ── IR 빌더들 ─────────────────────────────────────────────────

fn build_http_server_ir(is_async: bool) -> Vec<IrNode> {
    vec![
        IrNode::HttpRoute {
            method: HttpMethod::Get,
            path: "/".to_string(),
            handler: Box::new(IrNode::FunctionDef {
                name: "index".to_string(),
                params: vec![],
                return_type: Some(TypeHint::String),
                body: vec![IrNode::Return(Some("\"Hello from CrownyCode\"".to_string()))],
                is_async,
            }),
        },
        IrNode::HttpRoute {
            method: HttpMethod::Get,
            path: "/health".to_string(),
            handler: Box::new(IrNode::FunctionDef {
                name: "health".to_string(),
                params: vec![],
                return_type: Some(TypeHint::Custom("dict".to_string())),
                body: vec![IrNode::Return(Some("{\"status\": \"ok\"}".to_string()))],
                is_async,
            }),
        },
    ]
}

fn build_sort_ir(intent: &str) -> Vec<IrNode> {
    vec![
        IrNode::FunctionDef {
            name: "sort_items".to_string(),
            params: vec![
                Param { name: "items".to_string(), type_hint: Some(TypeHint::List(Box::new(TypeHint::Int))) },
            ],
            return_type: Some(TypeHint::List(Box::new(TypeHint::Int))),
            body: vec![IrNode::RawLogic(format!("# {intent} 정렬 구현"))],
            is_async: false,
        }
    ]
}

fn build_data_processor_ir(is_async: bool) -> Vec<IrNode> {
    vec![
        IrNode::FunctionDef {
            name: "process".to_string(),
            params: vec![
                Param { name: "data".to_string(), type_hint: Some(TypeHint::Custom("Any".to_string())) },
            ],
            return_type: Some(TypeHint::Custom("Any".to_string())),
            body: vec![IrNode::RawLogic("# 데이터 처리 로직".to_string())],
            is_async,
        }
    ]
}

fn build_generic_ir(intent: &str, constraints: &[Constraint]) -> Vec<IrNode> {
    let comment = if constraints.is_empty() {
        format!("# {intent}")
    } else {
        let cs: Vec<_> = constraints.iter().map(|c| format!("{c:?}")).collect();
        format!("# {intent} [{}]", cs.join(", "))
    };
    vec![
        IrNode::FunctionDef {
            name: intent.replace(' ', "_"),
            params: vec![],
            return_type: None,
            body: vec![IrNode::RawLogic(comment)],
            is_async: false,
        }
    ]
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── normalize_intent: 51개 시드 의도 매핑 ──

    #[test]
    fn test_normalize_korean_intents() {
        let cases = [
            ("HTTP 서버", "http_server"),
            ("웹 서버", "http_server"),
            ("REST API", "rest_api"),
            ("api 서버", "rest_api"),
            ("정렬 함수", "sort_function"),
            ("정렬", "sort_function"),
            ("이진 탐색", "binary_search"),
            ("파일 읽기", "file_reader"),
            ("파일 쓰기", "file_writer"),
            ("JSON 파서", "json_parser"),
            ("CSV 파서", "csv_parser"),
            ("HTML 파서", "html_parser"),
            ("XML 파서", "xml_parser"),
            ("데이터베이스 클라이언트", "database_client"),
            ("SQL 쿼리", "sql_query"),
            ("캐시 클라이언트", "cache_client"),
            ("레디스", "redis_client"),
            ("웹 스크래퍼", "web_scraper"),
            ("CLI 도구", "cli_tool"),
            ("인증 핸들러", "auth_handler"),
            ("인증", "auth_handler"),
            ("JWT 핸들러", "jwt_handler"),
            ("웹소켓 서버", "websocket_server"),
            ("TCP 서버", "tcp_server"),
            ("큐 워커", "queue_worker"),
            ("작업 스케줄러", "task_scheduler"),
            ("로거", "logger"),
            ("메트릭 수집", "metrics_collector"),
            ("데이터 처리", "data_processor"),
            ("ORM 모델", "orm_model"),
            ("단위 테스트", "unit_test"),
            ("통합 테스트", "integration_test"),
            ("설정 로더", "config_loader"),
            ("미들웨어", "middleware"),
            ("레이트 리미터", "rate_limiter"),
            ("유효성 검사", "validator"),
            ("직렬화", "serializer"),
            ("역직렬화", "deserializer"),
            ("암호화", "encryption"),
            ("해싱", "hashing"),
            ("압축", "compression"),
            ("정규식", "regex_matcher"),
            ("URL 라우터", "url_router"),
            ("템플릿 엔진", "template_engine"),
            ("상태 머신", "state_machine"),
            ("이벤트 이미터", "event_emitter"),
            ("옵저버 패턴", "observer_pattern"),
            ("팩토리 패턴", "factory_pattern"),
            ("싱글턴 패턴", "singleton_pattern"),
            ("빌더 패턴", "builder_pattern"),
            ("이메일 전송", "email_sender"),
            ("이미지 처리", "image_processor"),
            ("PDF 생성", "pdf_generator"),
            ("크론 잡", "cron_job"),
            ("인자 파서", "argument_parser"),
        ];
        for (ko, expected) in &cases {
            assert_eq!(
                normalize_intent(ko), *expected,
                "normalize_intent({:?}) should be {:?}", ko, expected
            );
        }
    }

    #[test]
    fn test_normalize_english_intents() {
        let cases = [
            ("http server", "http_server"),
            ("web server", "http_server"),
            ("rest api", "rest_api"),
            ("binary search", "binary_search"),
            ("file reader", "file_reader"),
            ("json parser", "json_parser"),
            ("database client", "database_client"),
            ("cache client", "cache_client"),
            ("redis client", "redis_client"),
            ("web scraper", "web_scraper"),
            ("cli tool", "cli_tool"),
            ("auth handler", "auth_handler"),
            ("jwt handler", "jwt_handler"),
            ("websocket server", "websocket_server"),
            ("tcp server", "tcp_server"),
            ("queue worker", "queue_worker"),
            ("task scheduler", "task_scheduler"),
            ("rate limiter", "rate_limiter"),
            ("state machine", "state_machine"),
            ("event emitter", "event_emitter"),
            ("template engine", "template_engine"),
        ];
        for (en, expected) in &cases {
            assert_eq!(
                normalize_intent(en), *expected,
                "normalize_intent({:?}) should be {:?}", en, expected
            );
        }
    }

    // ── split_compound_intents: 복합 요청 분할 ──

    #[test]
    fn test_compound_db_api() {
        let intents = split_compound_intents("사용자 입력을 받아서 DB에 저장하는 API");
        assert!(intents.contains(&"validator".to_string()),
            "should contain validator, got: {:?}", intents);
        assert!(intents.contains(&"database_client".to_string()),
            "should contain database_client, got: {:?}", intents);
        assert!(intents.contains(&"rest_api".to_string()),
            "should contain rest_api, got: {:?}", intents);
    }

    #[test]
    fn test_compound_auth_api() {
        let intents = split_compound_intents("인증하고 캐시하는 API 서버");
        assert!(intents.contains(&"auth_handler".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"cache_client".to_string()),
            "got: {:?}", intents);
    }

    #[test]
    fn test_compound_file_parse() {
        let intents = split_compound_intents("파일 읽어서 파싱해서 DB에 저장");
        assert!(intents.contains(&"file_reader".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"json_parser".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"database_client".to_string()),
            "got: {:?}", intents);
    }

    #[test]
    fn test_compound_english() {
        let intents = split_compound_intents("validate input and save to db with auth");
        assert!(intents.contains(&"validator".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"database_client".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"auth_handler".to_string()),
            "got: {:?}", intents);
    }

    #[test]
    fn test_compound_log_and_cache() {
        let intents = split_compound_intents("로깅하고 캐싱하는 서버");
        assert!(intents.contains(&"logger".to_string()),
            "got: {:?}", intents);
        assert!(intents.contains(&"cache_client".to_string()),
            "got: {:?}", intents);
    }

    #[test]
    fn test_single_intent_not_split() {
        let intents = split_compound_intents("HTTP 서버");
        assert_eq!(intents, vec!["http_server"]);
    }

    #[test]
    fn test_single_english_not_split() {
        let intents = split_compound_intents("json parser");
        assert_eq!(intents, vec!["json_parser"]);
    }

    // ── build: IR 트리 빌드 ──

    #[test]
    fn test_build_populates_sub_intents_compound() {
        let nodes = vec![KpsNode {
            kind: KpsKind::Target,
            text: "사용자 입력을 받아서 DB에 저장하는 API".to_string(),
            tokens: vec!["사용자".into(), "입력".into(), "db".into(), "저장".into(), "api".into()],
        }];
        let ir = build(&nodes).unwrap();
        assert!(ir.sub_intents.len() >= 2,
            "compound request should have 2+ sub_intents, got: {:?}", ir.sub_intents);
    }

    #[test]
    fn test_build_single_intent_sub_intents() {
        let nodes = vec![KpsNode {
            kind: KpsKind::Target,
            text: "HTTP 서버".to_string(),
            tokens: vec!["http".into(), "서버".into()],
        }];
        let ir = build(&nodes).unwrap();
        assert_eq!(ir.sub_intents, vec!["http_server"]);
        assert_eq!(ir.intent, "http_server");
    }

    #[test]
    fn test_intent_category_rest_api() {
        assert!(matches!(intent_category("rest_api"), IntentCategory::HttpServer));
        assert!(matches!(intent_category("http_server"), IntentCategory::HttpServer));
        assert!(matches!(intent_category("sort_function"), IntentCategory::SortFunction));
        assert!(matches!(intent_category("json_parser"), IntentCategory::Generic));
    }
}
