// crownycode/src/cell/net.rs
// ═══════════════════════════════════════════════════════════════
// CellNet — 셀 네트워크 (SQLite CellStore 완전 대체)
// ═══════════════════════════════════════════════════════════════
//
// 셀들의 인메모리 그래프. 영속성은 bincode 직렬화.
// 모든 조회는 HashMap O(1), 퍼지 검색은 토큰 매칭.
// 신뢰 전파는 signal.rs의 메시지 패싱으로 처리.

use std::collections::HashMap;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::{
    CellId, CrownyCell, TritState, CellEdge, Pattern, PatternSource, Relation,
    signal::{TrustSignal, SignalKind},
};

/// CellNet — 전체 지식 그래프
///
/// 핵심 원칙:
/// 1. 모든 셀은 인메모리 HashMap에 저장
/// 2. intent → 셀 역인덱스로 O(1) 조회
/// 3. 영속성은 bincode 직렬화 (SQLite 아님)
/// 4. 신뢰 전파는 셀 간 메시지 패싱
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellNet {
    /// 셀 저장소 (CellId → CrownyCell)
    cells: HashMap<CellId, CrownyCell>,
    /// 의도 → 셀 ID 역인덱스
    intent_index: HashMap<String, Vec<CellId>>,
}

impl CellNet {
    /// 빈 네트워크 생성
    pub fn new() -> Self {
        Self {
            cells: HashMap::new(),
            intent_index: HashMap::new(),
        }
    }

    // ── 셀 CRUD ──────────────────────────────────────────────

    /// 셀 삽입
    pub fn insert(&mut self, cell: CrownyCell) -> CellId {
        let id = cell.id;
        let intent = cell.intent.clone();
        self.cells.insert(id, cell);
        self.intent_index.entry(intent).or_default().push(id);
        id
    }

    /// 셀 조회 (불변)
    pub fn get(&self, id: CellId) -> Option<&CrownyCell> {
        self.cells.get(&id)
    }

    /// 셀 조회 (가변)
    pub fn get_mut(&mut self, id: CellId) -> Option<&mut CrownyCell> {
        self.cells.get_mut(&id)
    }

    /// 셀 삭제
    pub fn remove(&mut self, id: CellId) -> Option<CrownyCell> {
        if let Some(cell) = self.cells.remove(&id) {
            // 역인덱스에서도 제거
            if let Some(ids) = self.intent_index.get_mut(&cell.intent) {
                ids.retain(|&cid| cid != id);
                if ids.is_empty() {
                    self.intent_index.remove(&cell.intent);
                }
            }
            // 다른 셀의 엣지에서도 제거
            for other in self.cells.values_mut() {
                other.edges.retain(|e| e.target != id);
            }
            Some(cell)
        } else {
            None
        }
    }

    /// 전체 셀 수
    pub fn len(&self) -> usize {
        self.cells.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }

    /// 모든 셀 이터레이터
    pub fn iter(&self) -> impl Iterator<Item = (&CellId, &CrownyCell)> {
        self.cells.iter()
    }

    // ── 의도 기반 검색 ───────────────────────────────────────

    /// 정확 매칭 — O(1) 해시 조회
    pub fn find_by_intent(&self, intent: &str) -> Option<&CrownyCell> {
        self.intent_index.get(intent)
            .and_then(|ids| ids.first())
            .and_then(|id| self.cells.get(id))
    }

    /// 정확 매칭 (가변)
    pub fn find_by_intent_mut(&mut self, intent: &str) -> Option<&mut CrownyCell> {
        let id = self.intent_index.get(intent)
            .and_then(|ids| ids.first())
            .copied()?;
        self.cells.get_mut(&id)
    }

    /// 특정 의도의 모든 셀
    pub fn find_all_by_intent(&self, intent: &str) -> Vec<&CrownyCell> {
        self.intent_index.get(intent)
            .map(|ids| ids.iter().filter_map(|id| self.cells.get(id)).collect())
            .unwrap_or_default()
    }

    /// 퍼지 검색 — 토큰 분리 후 매칭
    ///
    /// "http_server_auth" → ["http", "server", "auth"]
    /// → "http_server" 셀도 매칭 (2/3 토큰 일치)
    pub fn fuzzy_search(&self, query: &str) -> Vec<&CrownyCell> {
        let query_tokens = tokenize(query);
        if query_tokens.is_empty() {
            return Vec::new();
        }

        let mut scored: Vec<(&CrownyCell, f32)> = self.cells.values()
            .filter_map(|cell| {
                let cell_tokens = tokenize(&cell.intent);
                let score = token_similarity(&query_tokens, &cell_tokens);
                if score > 0.3 { Some((cell, score)) } else { None }
            })
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.into_iter().map(|(cell, _)| cell).collect()
    }

    /// 문자열 검색 (intent에 query 포함)
    pub fn search(&self, query: &str) -> Vec<&CrownyCell> {
        if query.is_empty() {
            return self.cells.values().collect();
        }
        let q = query.to_lowercase();
        self.cells.values()
            .filter(|c| c.intent.to_lowercase().contains(&q))
            .collect()
    }

    // ── 패턴 관리 ────────────────────────────────────────────

    /// 의도 + 언어로 패턴 upsert (없으면 셀도 생성)
    pub fn upsert_pattern(
        &mut self,
        intent: &str,
        target_lang: &str,
        code: &str,
        confidence: f32,
    ) -> CellId {
        if let Some(cell) = self.find_by_intent_mut(intent) {
            cell.add_pattern(Pattern::new(target_lang, code, confidence, PatternSource::Generated));
            cell.activate();
            cell.id
        } else {
            let mut cell = CrownyCell::new(intent);
            cell.add_pattern(Pattern::new(target_lang, code, confidence, PatternSource::Generated));
            cell.recalculate_energy();
            self.insert(cell)
        }
    }

    /// 사용 기록
    pub fn record_usage(&mut self, intent: &str) {
        if let Some(cell) = self.find_by_intent_mut(intent) {
            cell.activate();
        }
    }

    /// 반박 등록
    pub fn refute(&mut self, intent: &str) {
        if let Some(cell) = self.find_by_intent_mut(intent) {
            cell.refute();
        }
    }

    // ── 엣지 관리 ────────────────────────────────────────────

    /// 의도 기반 엣지 추가
    pub fn add_edge_by_intent(
        &mut self,
        from_intent: &str,
        to_intent: &str,
        relation: Relation,
        weight: i8,
    ) -> Result<()> {
        let to_id = self.find_by_intent(to_intent)
            .map(|c| c.id)
            .ok_or_else(|| anyhow::anyhow!("대상 셀 없음: {}", to_intent))?;

        let from_cell = self.find_by_intent_mut(from_intent)
            .ok_or_else(|| anyhow::anyhow!("출발 셀 없음: {}", from_intent))?;

        from_cell.add_edge(CellEdge::new(to_id, relation, weight));
        Ok(())
    }

    // ── 신뢰 전파 — 메시지 패싱 ──────────────────────────────

    /// 셀에 신뢰 신호를 보내고 깊이 N까지 전파
    ///
    /// 이것이 크라우니셀로직의 핵심: DB 쿼리가 아니라
    /// 셀이 이웃에게 직접 감쇠 신호를 보낸다.
    pub fn propagate_trust(
        &mut self,
        start_id: CellId,
        signal: TrustSignal,
        max_depth: u32,
    ) -> u32 {
        let mut affected = 0u32;
        let mut queue: Vec<(CellId, TrustSignal)> = vec![(start_id, signal)];
        let mut visited: std::collections::HashSet<CellId> = std::collections::HashSet::new();

        while let Some((cell_id, sig)) = queue.pop() {
            if visited.contains(&cell_id) || sig.depth > max_depth {
                continue;
            }
            visited.insert(cell_id);

            // 셀의 에너지/상태 갱신
            if let Some(cell) = self.cells.get_mut(&cell_id) {
                let factor = sig.kind.factor();
                cell.energy = (cell.energy + sig.strength * factor).clamp(0.0, 1.0);
                cell.trit_state = TritState::from_energy(cell.energy);
                affected += 1;

                // 이웃에게 감쇠 전파
                if sig.depth < max_depth {
                    let propagated: Vec<(CellId, TrustSignal)> = cell.edges.iter()
                        .map(|edge| {
                            let attenuated = sig.attenuate(edge.weight);
                            (edge.target, attenuated)
                        })
                        .collect();
                    queue.extend(propagated);
                }
            }
        }
        affected
    }

    /// 의도 기반 신뢰 전파 (호환 API)
    pub fn propagate_trust_by_intent(
        &mut self,
        intent: &str,
        kind: SignalKind,
        max_depth: u32,
    ) -> u32 {
        if let Some(id) = self.find_by_intent(intent).map(|c| c.id) {
            let signal = TrustSignal::new(kind, 0.3, id);
            self.propagate_trust(id, signal, max_depth)
        } else {
            0
        }
    }

    // ── 의도별 에너지/상태 조회 ──────────────────────────────

    /// 의도의 현재 에너지
    pub fn energy_for(&self, intent: &str) -> f32 {
        self.find_by_intent(intent).map(|c| c.energy).unwrap_or(0.0)
    }

    /// 의도의 4상 상태 평가
    pub fn evaluate_intent(&self, intent: &str) -> TritState {
        self.find_by_intent(intent)
            .map(|c| c.trit_state)
            .unwrap_or(TritState::Unknown)
    }

    // ── 영속성 — bincode 직렬화 ──────────────────────────────

    /// 디스크에 저장 (bincode)
    pub fn save(&self, path: &str) -> Result<()> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let encoded = bincode::serialize(self)?;
        std::fs::write(path, encoded)?;
        Ok(())
    }

    /// 디스크에서 로드 (bincode)
    pub fn load(path: &str) -> Result<Self> {
        let data = std::fs::read(path)?;
        let net: CellNet = bincode::deserialize(&data)?;
        Ok(net)
    }

    /// JSON Lines 내보내기 (기존 snapshot.rs 호환)
    pub fn export_jsonl(&self, path: &str) -> Result<usize> {
        use std::io::Write;
        let mut file = std::io::BufWriter::new(std::fs::File::create(path)?);
        let mut count = 0;
        for cell in self.cells.values() {
            serde_json::to_writer(&mut file, cell)?;
            writeln!(file)?;
            count += 1;
        }
        Ok(count)
    }

    /// JSON Lines 가져오기
    pub fn import_jsonl(&mut self, path: &str) -> Result<usize> {
        use std::io::BufRead;
        let file = std::io::BufReader::new(std::fs::File::open(path)?);
        let mut count = 0;
        for line in file.lines() {
            let line = line?;
            if line.trim().is_empty() { continue; }
            let cell: CrownyCell = serde_json::from_str(&line)?;
            self.insert(cell);
            count += 1;
        }
        Ok(count)
    }
}

impl Default for CellNet {
    fn default() -> Self {
        Self::new()
    }
}

// ── 토큰 유틸 ───────────────────────────────────────────────

/// 의도 문자열을 토큰으로 분리
fn tokenize(intent: &str) -> Vec<String> {
    intent.to_lowercase()
        .split(['_', ' ', '-', '.'])
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// 두 토큰 목록의 유사도 (Jaccard-like)
fn token_similarity(a: &[String], b: &[String]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let matches = a.iter().filter(|t| b.contains(t)).count();
    let union = a.len().max(b.len());
    matches as f32 / union as f32
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_net() -> CellNet {
        let mut net = CellNet::new();
        let mut http = CrownyCell::with_energy("http_server", 0.85);
        http.add_pattern(Pattern::new("python", "from fastapi import FastAPI\napp = FastAPI()", 0.9, PatternSource::Generated));
        http.add_pattern(Pattern::new("rust", "use axum::Router;\nlet app = Router::new();", 0.85, PatternSource::Generated));
        net.insert(http);

        let mut sort = CrownyCell::with_energy("sort_function", 0.90);
        sort.add_pattern(Pattern::new("python", "def sort_items(items):\n    return sorted(items)", 0.95, PatternSource::UserConfirmed));
        net.insert(sort);

        let api = CrownyCell::with_energy("api_server", 0.60);
        net.insert(api);

        net
    }

    #[test]
    fn test_cellnet_new_is_empty() {
        let net = CellNet::new();
        assert!(net.is_empty());
        assert_eq!(net.len(), 0);
    }

    #[test]
    fn test_insert_and_get() {
        let mut net = CellNet::new();
        let cell = CrownyCell::new("test_intent");
        let id = net.insert(cell);
        assert_eq!(net.len(), 1);
        assert!(net.get(id).is_some());
        assert_eq!(net.get(id).unwrap().intent, "test_intent");
    }

    #[test]
    fn test_find_by_intent() {
        let net = make_test_net();
        let found = net.find_by_intent("http_server");
        assert!(found.is_some());
        assert_eq!(found.unwrap().intent, "http_server");
        assert!(net.find_by_intent("nonexistent").is_none());
    }

    #[test]
    fn test_find_all_by_intent() {
        let mut net = CellNet::new();
        net.insert(CrownyCell::new("http_server"));
        net.insert(CrownyCell::new("http_server")); // 중복 의도
        let all = net.find_all_by_intent("http_server");
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_fuzzy_search() {
        let net = make_test_net();
        let results = net.fuzzy_search("http_server_auth");
        assert!(!results.is_empty());
        assert_eq!(results[0].intent, "http_server");
    }

    #[test]
    fn test_fuzzy_search_partial_match() {
        let net = make_test_net();
        let results = net.fuzzy_search("server");
        assert!(results.len() >= 2); // http_server, api_server
    }

    #[test]
    fn test_search_substring() {
        let net = make_test_net();
        let results = net.search("http");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].intent, "http_server");
    }

    #[test]
    fn test_search_empty_returns_all() {
        let net = make_test_net();
        let results = net.search("");
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_upsert_pattern_new_cell() {
        let mut net = CellNet::new();
        let id = net.upsert_pattern("new_intent", "python", "print('hello')", 0.8);
        assert_eq!(net.len(), 1);
        let cell = net.get(id).unwrap();
        assert_eq!(cell.patterns.len(), 1);
        assert_eq!(cell.patterns[0].target_lang, "python");
    }

    #[test]
    fn test_upsert_pattern_existing_cell() {
        let mut net = make_test_net();
        let original_len = net.len();
        net.upsert_pattern("http_server", "javascript", "const express = require('express');", 0.7);
        assert_eq!(net.len(), original_len); // 셀 수 동일
        let cell = net.find_by_intent("http_server").unwrap();
        assert_eq!(cell.patterns.len(), 3); // python, rust, javascript
    }

    #[test]
    fn test_record_usage() {
        let mut net = make_test_net();
        let count_before = net.find_by_intent("http_server").unwrap().activation_count;
        net.record_usage("http_server");
        let count_after = net.find_by_intent("http_server").unwrap().activation_count;
        assert_eq!(count_after, count_before + 1);
    }

    #[test]
    fn test_refute() {
        let mut net = make_test_net();
        let energy_before = net.find_by_intent("http_server").unwrap().energy;
        net.refute("http_server");
        let cell = net.find_by_intent("http_server").unwrap();
        assert_eq!(cell.refutation_count, 1);
        assert!(cell.energy <= energy_before);
    }

    #[test]
    fn test_remove_cell() {
        let mut net = make_test_net();
        let id = net.find_by_intent("http_server").unwrap().id;
        let removed = net.remove(id);
        assert!(removed.is_some());
        assert!(net.find_by_intent("http_server").is_none());
        assert_eq!(net.len(), 2);
    }

    #[test]
    fn test_add_edge_by_intent() {
        let mut net = make_test_net();
        net.add_edge_by_intent("http_server", "api_server", Relation::Related, 1).unwrap();
        let cell = net.find_by_intent("http_server").unwrap();
        assert_eq!(cell.edges.len(), 1);
        assert_eq!(cell.edges[0].relation, Relation::Related);
    }

    #[test]
    fn test_energy_for() {
        let net = make_test_net();
        assert!(net.energy_for("http_server") > 0.5);
        assert_eq!(net.energy_for("nonexistent"), 0.0);
    }

    #[test]
    fn test_evaluate_intent() {
        let net = make_test_net();
        assert_eq!(net.evaluate_intent("http_server"), TritState::Confirmed);
        assert_eq!(net.evaluate_intent("nonexistent"), TritState::Unknown);
    }

    #[test]
    fn test_propagate_trust_reinforcement() {
        let mut net = make_test_net();
        let http_id = net.find_by_intent("http_server").unwrap().id;
        let api_id = net.find_by_intent("api_server").unwrap().id;

        // http_server → api_server 엣지 추가
        net.get_mut(http_id).unwrap().add_edge(CellEdge::new(api_id, Relation::Related, 1));

        let signal = TrustSignal::new(SignalKind::Reinforce, 0.3, http_id);
        let affected = net.propagate_trust(http_id, signal, 2);
        assert!(affected >= 1);
    }

    #[test]
    fn test_propagate_trust_refutation_decay() {
        let mut net = make_test_net();
        let http_id = net.find_by_intent("http_server").unwrap().id;
        let api_id = net.find_by_intent("api_server").unwrap().id;

        net.get_mut(http_id).unwrap().add_edge(CellEdge::new(api_id, Relation::Related, 1));

        let energy_before = net.get(api_id).unwrap().energy;
        let signal = TrustSignal::new(SignalKind::Refute, 0.3, http_id);
        net.propagate_trust(http_id, signal, 2);
        let energy_after = net.get(api_id).unwrap().energy;
        assert!(energy_after < energy_before || energy_before == 0.0);
    }

    #[test]
    fn test_propagate_trust_respects_max_depth() {
        let mut net = CellNet::new();
        let a = net.insert(CrownyCell::with_energy("a", 0.5));
        let b = net.insert(CrownyCell::with_energy("b", 0.5));
        let c = net.insert(CrownyCell::with_energy("c", 0.5));

        // a → b → c 체인
        net.get_mut(a).unwrap().add_edge(CellEdge::new(b, Relation::Related, 1));
        net.get_mut(b).unwrap().add_edge(CellEdge::new(c, Relation::Related, 1));

        let signal = TrustSignal::new(SignalKind::Reinforce, 0.3, a);
        let affected = net.propagate_trust(a, signal, 1); // depth 1 → a, b만
        assert!(affected <= 2); // c는 영향 안 받음
    }

    #[test]
    fn test_bincode_save_load() {
        let net = make_test_net();
        let path = "/tmp/crownycode_test_cellnet.bin";
        net.save(path).unwrap();

        let loaded = CellNet::load(path).unwrap();
        assert_eq!(loaded.len(), net.len());
        assert!(loaded.find_by_intent("http_server").is_some());
        assert!(loaded.find_by_intent("sort_function").is_some());

        // 패턴도 보존 확인
        let http = loaded.find_by_intent("http_server").unwrap();
        assert_eq!(http.patterns.len(), 2);

        std::fs::remove_file(path).ok();
    }

    #[test]
    fn test_jsonl_export_import() {
        let net = make_test_net();
        let path = "/tmp/crownycode_test_cellnet.jsonl";
        let exported = net.export_jsonl(path).unwrap();
        assert_eq!(exported, 3);

        let mut net2 = CellNet::new();
        let imported = net2.import_jsonl(path).unwrap();
        assert_eq!(imported, 3);
        assert!(net2.find_by_intent("http_server").is_some());

        std::fs::remove_file(path).ok();
    }

    #[test]
    fn test_tokenize() {
        assert_eq!(tokenize("http_server"), vec!["http", "server"]);
        assert_eq!(tokenize("rest-api"), vec!["rest", "api"]);
        assert_eq!(tokenize("simple"), vec!["simple"]);
        assert!(tokenize("").is_empty());
    }

    #[test]
    fn test_token_similarity() {
        let a = tokenize("http_server");
        let b = tokenize("http_server_auth");
        let sim = token_similarity(&a, &b);
        assert!(sim > 0.5); // "http"와 "server" 둘 다 매칭

        let c = tokenize("database_client");
        let sim2 = token_similarity(&a, &c);
        assert!(sim2 < 0.1); // 매칭 없음
    }

    #[test]
    fn test_remove_cleans_edges() {
        let mut net = CellNet::new();
        let a = net.insert(CrownyCell::new("a"));
        let b = net.insert(CrownyCell::new("b"));
        net.get_mut(a).unwrap().add_edge(CellEdge::new(b, Relation::Related, 1));

        net.remove(b);
        let cell_a = net.get(a).unwrap();
        assert!(cell_a.edges.is_empty()); // b를 가리키던 엣지 제거됨
    }

    #[test]
    fn test_iter() {
        let net = make_test_net();
        let count = net.iter().count();
        assert_eq!(count, 3);
    }
}
