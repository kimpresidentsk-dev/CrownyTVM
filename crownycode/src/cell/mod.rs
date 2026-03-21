#![allow(dead_code)]
// crownycode/src/cell/mod.rs
// ═══════════════════════════════════════════════════════════════
// 크라우니셀로직 — 셀이 곧 관계망
// ═══════════════════════════════════════════════════════════════
//
// 원래 목적: "방사형 셀형 DB — 셀이 관계망 자체인 구조"
// SQLite cell_edges 테이블이 아니라, 각 셀이 자기 엣지를 직접 보유한다.
// 신뢰 전파는 DB 쿼리가 아니라 셀 간 메시지 패싱이다.

pub mod net;
pub mod signal;
pub mod store;

// ── CellId ──────────────────────────────────────────────────

/// 셀 고유 식별자 (TriWord 기반 — 후에 ISA729 네이티브로 확장)
pub type CellId = u64;

/// 다음 CellId 생성 (atomic counter)
static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub fn next_cell_id() -> CellId {
    NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

/// ID 카운터 시작값 설정 (테스트용)
pub fn set_cell_id_start(start: u64) {
    NEXT_ID.store(start, std::sync::atomic::Ordering::Relaxed);
}

// ── TritState ───────────────────────────────────────────────

/// 4상 인식 상태 — 균형3진 1st-class 값
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub enum TritState {
    /// +2 — 완전히 신뢰
    Confirmed,
    ///  0 — 존재하나 불확실
    Uncertain,
    /// -1 — 반박됨
    Refuted,
    /// -2 — 전혀 모름
    Unknown,
}

impl TritState {
    pub fn value(&self) -> i8 {
        match self {
            TritState::Confirmed =>  2,
            TritState::Uncertain =>  0,
            TritState::Refuted   => -1,
            TritState::Unknown   => -2,
        }
    }

    pub fn label_ko(&self) -> &'static str {
        match self {
            TritState::Confirmed => "확정 +2",
            TritState::Uncertain => "미확인 0",
            TritState::Refuted   => "오해 -1",
            TritState::Unknown   => "미인지 -2",
        }
    }

    pub fn from_energy(energy: f32) -> Self {
        match energy {
            e if e >= 0.75 => TritState::Confirmed,
            e if e >= 0.40 => TritState::Uncertain,
            e if e >= 0.15 => TritState::Refuted,
            _              => TritState::Unknown,
        }
    }
}

// ── Relation ────────────────────────────────────────────────

/// 셀 간 관계 유형
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub enum Relation {
    Related,
    Refutes,
    Extends,
    DependsOn,
}

// ── CellEdge ────────────────────────────────────────────────

/// 셀 간 엣지 — 셀이 직접 보유 (DB 테이블이 아님!)
#[derive(Debug, Clone)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub struct CellEdge {
    pub target: CellId,
    pub relation: Relation,
    pub weight: i8,
}

impl CellEdge {
    pub fn new(target: CellId, relation: Relation, weight: i8) -> Self {
        Self { target, relation, weight: weight.clamp(-1, 1) }
    }
}

// ── PatternSource ───────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub enum PatternSource {
    Generated,
    LearnedFromClaude,
    UserConfirmed,
    CommunityContributed,
}

// ── Pattern ─────────────────────────────────────────────────

/// 코드 패턴 — 하나의 셀이 여러 언어 패턴을 보유 가능
#[derive(Debug, Clone)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub struct Pattern {
    pub target_lang: String,
    pub code: String,
    pub confidence: f32,
    pub source: PatternSource,
}

impl Pattern {
    pub fn new(target_lang: &str, code: &str, confidence: f32, source: PatternSource) -> Self {
        Self {
            target_lang: target_lang.to_string(),
            code: code.to_string(),
            confidence: confidence.clamp(0.0, 1.0),
            source,
        }
    }
}

// ── CrownyCell ──────────────────────────────────────────────

/// 크라우니셀 — 관계망의 기본 단위
#[derive(Debug, Clone)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub struct CrownyCell {
    pub id: CellId,
    pub intent: String,
    pub trit_state: TritState,
    pub energy: f32,
    pub patterns: Vec<Pattern>,
    pub edges: Vec<CellEdge>,
    pub birth: i64,
    pub last_activated: i64,
    pub activation_count: u32,
    pub refutation_count: u32,
}

impl CrownyCell {
    pub fn new(intent: &str) -> Self {
        let now = crate::time_util::now_timestamp();
        Self {
            id: next_cell_id(),
            intent: intent.to_string(),
            trit_state: TritState::Unknown,
            energy: 0.0,
            patterns: Vec::new(),
            edges: Vec::new(),
            birth: now,
            last_activated: now,
            activation_count: 0,
            refutation_count: 0,
        }
    }

    pub fn with_energy(intent: &str, energy: f32) -> Self {
        let mut cell = Self::new(intent);
        cell.energy = energy.clamp(0.0, 1.0);
        cell.trit_state = TritState::from_energy(energy);
        cell
    }

    pub fn add_pattern(&mut self, pattern: Pattern) {
        if let Some(existing) = self.patterns.iter_mut()
            .find(|p| p.target_lang == pattern.target_lang)
        {
            if pattern.confidence > existing.confidence {
                *existing = pattern;
            }
        } else {
            self.patterns.push(pattern);
        }
        self.recalculate_energy();
    }

    pub fn add_edge(&mut self, edge: CellEdge) {
        if let Some(existing) = self.edges.iter_mut()
            .find(|e| e.target == edge.target)
        {
            *existing = edge;
        } else {
            self.edges.push(edge);
        }
    }

    pub fn activate(&mut self) {
        self.last_activated = crate::time_util::now_timestamp();
        self.activation_count += 1;
        self.recalculate_energy();
    }

    pub fn refute(&mut self) {
        self.refutation_count += 1;
        self.recalculate_energy();
    }

    pub fn recalculate_energy(&mut self) {
        let base = if self.patterns.is_empty() {
            0.0
        } else {
            self.patterns.iter().map(|p| p.confidence).sum::<f32>()
                / self.patterns.len() as f32
        };
        let usage_bonus = (self.activation_count as f32 / 20.0).min(0.2);
        let refutation_penalty = (self.refutation_count as f32 * 0.1).min(0.4);
        let now = crate::time_util::now_timestamp();
        let age_days = ((now - self.last_activated) as f32 / 86400.0).max(0.0);
        let age_factor = (-age_days / 30.0_f32).exp();

        self.energy = ((base + usage_bonus - refutation_penalty) * age_factor)
            .clamp(0.0, 1.0);
        self.trit_state = TritState::from_energy(self.energy);
    }

    pub fn pattern_for(&self, lang: &str) -> Option<&Pattern> {
        self.patterns.iter().find(|p| p.target_lang == lang)
    }

    pub fn best_pattern(&self) -> Option<&Pattern> {
        self.patterns.iter().max_by(|a, b|
            a.confidence.partial_cmp(&b.confidence).unwrap_or(std::cmp::Ordering::Equal))
    }

    pub fn neighbors(&self, relation: Relation) -> Vec<CellId> {
        self.edges.iter().filter(|e| e.relation == relation).map(|e| e.target).collect()
    }

    pub fn all_neighbors(&self) -> Vec<CellId> {
        self.edges.iter().map(|e| e.target).collect()
    }
}
