// crownycode/src/cell/store.rs
// ═══════════════════════════════════════════════════════════════
// CellStore 호환 레이어 — Step 3에서 제거 예정
// ═══════════════════════════════════════════════════════════════
//
// 내부: CellNet (인메모리 셀 관계망)
// 외부: 기존 CellStore API (pipeline/mod.rs, phase/judge.rs 등이 사용)
//
// DevStore가 아직 SQLite Connection을 필요로 하므로
// 별도의 SQLite 연결도 유지한다.

use std::cell::RefCell;
use anyhow::Result;
use rusqlite::Connection;

use super::{
    Cell, Relation,
    net::CellNet,
    signal::SignalKind,
};

/// 신뢰 전파 방향 (기존 호환)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TrustDirection {
    Boost,
    Decay,
}

/// CellStore — CellNet을 감싼 호환 래퍼
///
/// 기존 코드가 `CellStore::open(path)`, `db.find_by_intent()` 등을
/// 그대로 사용할 수 있도록 한다. 내부적으로는 CellNet에 위임.
pub struct CellStore {
    /// 새 저장소 (인메모리 셀 관계망) — RefCell로 interior mutability
    net: RefCell<CellNet>,
    /// 레거시 SQLite 연결 (DevStore용)
    conn: Connection,
    /// bincode 저장 경로
    net_path: String,
}

impl CellStore {
    /// DB 열기 (호환 API)
    ///
    /// path가 .db로 끝나면 같은 디렉터리에 .cellnet.bin도 생성
    pub fn open(path: &str) -> Result<Self> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        init_legacy_schema(&conn)?;

        let net_path = path.replace(".db", ".cellnet.bin");
        let net = if std::path::Path::new(&net_path).exists() {
            CellNet::load(&net_path).unwrap_or_else(|_| CellNet::new())
        } else {
            CellNet::new()
        };

        Ok(Self { net: RefCell::new(net), conn, net_path })
    }

    pub fn upsert_pattern(
        &self, intent: &str, target_lang: &str, code: &str, confidence: f32,
    ) -> Result<String> {
        let mut net = self.net.borrow_mut();
        let id = net.upsert_pattern(intent, target_lang, code, confidence);
        let _ = net.save(&self.net_path);
        Ok(id.to_string())
    }

    pub fn find_by_intent(&self, intent: &str) -> Result<Option<Cell>> {
        let net = self.net.borrow();
        Ok(net.find_by_intent(intent)
            .and_then(|c| Cell::from_crowny(c, "rust")
                .or_else(|| Cell::from_crowny(c, "python"))
                .or_else(|| Cell::from_crowny(c, ""))))
    }

    pub fn search(&self, query: &str) -> Result<Vec<Cell>> {
        let net = self.net.borrow();
        Ok(net.search(query).into_iter()
            .filter_map(|c| Cell::from_crowny(c, ""))
            .collect())
    }

    pub fn search_by_intent_tokens(&self, intent: &str) -> Result<Vec<Cell>> {
        let net = self.net.borrow();
        Ok(net.fuzzy_search(intent).into_iter()
            .filter_map(|c| Cell::from_crowny(c, ""))
            .collect())
    }

    pub fn propagate_trust(
        &self, root_intent: &str, direction: TrustDirection, depth: u8,
    ) -> Result<u32> {
        let mut net = self.net.borrow_mut();
        let kind = match direction {
            TrustDirection::Boost => SignalKind::Reinforce,
            TrustDirection::Decay => SignalKind::Decay,
        };
        Ok(net.propagate_trust_by_intent(root_intent, kind, depth as u32))
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn record_usage(&self, intent: &str) -> Result<()> {
        self.net.borrow_mut().record_usage(intent);
        Ok(())
    }

    pub fn cell_count(&self) -> Result<i64> {
        Ok(self.net.borrow().len() as i64)
    }

    pub fn refute(&self, intent: &str, _reason: &str) -> Result<()> {
        self.net.borrow_mut().refute(intent);
        Ok(())
    }

    pub fn add_edge(
        &self, from_intent: &str, to_intent: &str, relation: &str,
    ) -> Result<()> {
        let mut net = self.net.borrow_mut();
        let rel = match relation {
            "refutes" => Relation::Refutes,
            "extends" => Relation::Extends,
            "depends_on" => Relation::DependsOn,
            _ => Relation::Related,
        };
        net.add_edge_by_intent(from_intent, to_intent, rel, 1)
    }

    // ── 새 API (Step 3부터 직접 사용) ────────────────────────

    /// CellNet 직접 접근 (새 코드용)
    pub fn cell_net(&self) -> std::cell::Ref<'_, CellNet> {
        self.net.borrow()
    }

    /// CellNet 가변 접근 (새 코드용)
    pub fn cell_net_mut(&self) -> std::cell::RefMut<'_, CellNet> {
        self.net.borrow_mut()
    }
}

/// DevStore가 필요로 하는 최소 스키마
fn init_legacy_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS cells (
            id              TEXT PRIMARY KEY,
            intent          TEXT NOT NULL,
            target_lang     TEXT NOT NULL,
            code            TEXT NOT NULL,
            confidence      REAL NOT NULL DEFAULT 0.5,
            source          TEXT NOT NULL DEFAULT 'generated',
            created_at      TEXT NOT NULL,
            used_at         TEXT,
            refutation_count INTEGER NOT NULL DEFAULT 0,
            use_count        INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cells_intent ON cells(intent);
        CREATE TABLE IF NOT EXISTS cell_edges (
            from_id     TEXT NOT NULL,
            to_id       TEXT NOT NULL,
            relation    TEXT NOT NULL,
            weight      REAL NOT NULL DEFAULT 1.0,
            PRIMARY KEY (from_id, to_id)
        );
        CREATE TABLE IF NOT EXISTS usage_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cell_id     TEXT,
            intent      TEXT,
            timestamp   TEXT NOT NULL,
            success     INTEGER NOT NULL DEFAULT 1
        );
    ")?;
    Ok(())
}
