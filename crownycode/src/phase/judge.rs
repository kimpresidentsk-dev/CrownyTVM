// crownycode/src/phase/judge.rs
// 4상 판별기 v2 — 다중 신호 가중합 기반

use crate::error::Result;
use crate::cell::store::CrownyDb;
use crate::pipeline::ir::IrTree;
use super::signals::{compute_signals, compute_seed_signals};

#[derive(Debug, Clone, PartialEq)]
pub enum Phase {
    Confirmed,
    Uncertain,
    Misunderstood,
    Unknown,
}

impl Phase {
    pub fn label(&self) -> &'static str {
        match self {
            Phase::Confirmed     => "확정 +2",
            Phase::Uncertain     => "미확인 0",
            Phase::Misunderstood => "오해 -1",
            Phase::Unknown       => "미인지 -2",
        }
    }
    pub fn trit_value(&self) -> i8 {
        match self {
            Phase::Confirmed     =>  2,
            Phase::Uncertain     =>  0,
            Phase::Misunderstood => -1,
            Phase::Unknown       => -2,
        }
    }
}

pub struct PhaseResult {
    pub phase: Phase,
    pub confidence: f32,
    pub clarifications: Vec<String>,
    pub signal_breakdown: Option<SignalBreakdown>,
}

pub struct SignalBreakdown {
    pub age:        f32,
    pub usage:      f32,
    pub refutation: f32,
    pub similarity: f32,
    pub weighted:   f32,
    pub source:     BreakdownSource,
}

pub enum BreakdownSource {
    CellDb(String),
    SeedIntent(String),
    ConflictDetected,
    NoSignal,
}

pub struct PhaseJudge<'a> {
    db: &'a CrownyDb,
}

impl<'a> PhaseJudge<'a> {
    pub fn new(db: &'a CrownyDb) -> Self { Self { db } }

    pub fn evaluate(&self, ir: &IrTree) -> Result<PhaseResult> {
        // 1. 충돌 감지
        if let Some(conflict) = self.detect_conflict(ir) {
            return Ok(PhaseResult {
                phase: Phase::Misunderstood,
                confidence: 0.0,
                clarifications: conflict,
                signal_breakdown: Some(SignalBreakdown {
                    age: 0.0, usage: 0.0, refutation: 0.0, similarity: 0.0,
                    weighted: 0.0, source: BreakdownSource::ConflictDetected,
                }),
            });
        }

        let net = self.db.cell_net();

        // 2. CellDB 정확 매칭
        if let Some(cell) = net.find_by_intent(&ir.intent) {
            let signals = compute_signals(&ir.intent, cell);
            let confidence = signals.weighted_confidence();
            let phase = phase_from_confidence(confidence);
            let cell_id = cell.id.to_string();
            let cell_id_short = cell_id[..8.min(cell_id.len())].to_string();
            return Ok(PhaseResult {
                phase,
                confidence,
                clarifications: vec![],
                signal_breakdown: Some(SignalBreakdown {
                    age:        signals.age_signal,
                    usage:      signals.usage_signal,
                    refutation: signals.refutation_signal,
                    similarity: signals.similarity_signal,
                    weighted:   confidence,
                    source: BreakdownSource::CellDb(cell_id_short),
                }),
            });
        }

        // 3. CellDB 퍼지 검색
        let candidates = net.fuzzy_search(&ir.intent);
        if let Some(best) = candidates.first() {
            let signals = compute_signals(&ir.intent, best);
            let confidence = (signals.weighted_confidence() * 0.85).clamp(0.0, 1.0);
            if confidence >= 0.30 {
                let phase = phase_from_confidence(confidence);
                let cell_id = best.id.to_string();
                let cell_id_short = cell_id[..8.min(cell_id.len())].to_string();
                return Ok(PhaseResult {
                    phase,
                    confidence,
                    clarifications: vec![],
                    signal_breakdown: Some(SignalBreakdown {
                        age:        signals.age_signal,
                        usage:      signals.usage_signal,
                        refutation: signals.refutation_signal,
                        similarity: signals.similarity_signal,
                        weighted:   confidence,
                        source: BreakdownSource::CellDb(cell_id_short),
                    }),
                });
            }
        }

        // 4. 시드 사전 폴백
        if let Some(seed) = find_best_seed(&ir.intent) {
            let signals = compute_seed_signals(&ir.intent, seed);
            let confidence = signals.weighted_confidence();
            if confidence >= 0.40 {
                return Ok(PhaseResult {
                    phase: Phase::Confirmed,
                    confidence,
                    clarifications: vec![],
                    signal_breakdown: Some(SignalBreakdown {
                        age:        signals.age_signal,
                        usage:      signals.usage_signal,
                        refutation: signals.refutation_signal,
                        similarity: signals.similarity_signal,
                        weighted:   confidence,
                        source: BreakdownSource::SeedIntent(seed.to_string()),
                    }),
                });
            }
        }

        // 5. 미인지
        Ok(PhaseResult {
            phase: Phase::Unknown,
            confidence: 0.0,
            clarifications: vec![],
            signal_breakdown: Some(SignalBreakdown {
                age: 0.0, usage: 0.0, refutation: 0.0, similarity: 0.0,
                weighted: 0.0, source: BreakdownSource::NoSignal,
            }),
        })
    }

    fn detect_conflict(&self, ir: &IrTree) -> Option<Vec<String>> {
        use crate::pipeline::ir::Constraint;
        let mut conflicts = Vec::new();

        if ir.intent.contains("sort") && ir.constraints.contains(&Constraint::Rest) {
            conflicts.push("정렬 함수에 REST 제약이 붙어 있습니다. HTTP API로 감싸드릴까요?".to_string());
        }
        if ir.intent.contains("sort") && ir.constraints.contains(&Constraint::Async) {
            conflicts.push("정렬은 CPU 바운드 작업입니다. async 대신 병렬(rayon) 처리가 더 적합합니다.".to_string());
        }

        if conflicts.is_empty() { None } else { Some(conflicts) }
    }
}

fn phase_from_confidence(c: f32) -> Phase {
    match c {
        c if c >= 0.75 => Phase::Confirmed,
        c if c >= 0.40 => Phase::Uncertain,
        c if c >= 0.15 => Phase::Misunderstood,
        _              => Phase::Unknown,
    }
}

fn find_best_seed(intent: &str) -> Option<&'static str> {
    use super::signals::similarity_signal;
    KNOWN_INTENTS.iter()
        .max_by(|a, b| {
            similarity_signal(intent, a).partial_cmp(&similarity_signal(intent, b)).unwrap()
        })
        .copied()
        .filter(|seed| similarity_signal(intent, seed) > 0.4)
}

const KNOWN_INTENTS: &[&str] = &[
    "http_server", "api_server", "rest_api",
    "sort_function", "binary_search", "data_structure",
    "data_processor", "file_reader", "file_writer",
    "json_parser", "csv_parser", "xml_parser",
    "database_client", "sql_query", "orm_model",
    "web_scraper", "html_parser",
    "cli_tool", "argument_parser",
    "unit_test", "integration_test",
    "auth_handler", "jwt_handler",
    "websocket_server", "tcp_server",
    "cache_client", "redis_client",
    "queue_worker", "task_scheduler",
    "logger", "metrics_collector",
];
