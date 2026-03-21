// crownycode/src/cell/store.rs
// CrownyDb — CellNet + SQLite Connection (DevStore용)

use std::cell::RefCell;
use anyhow::Result;
use rusqlite::Connection;
use super::net::CellNet;

/// CrownyDb — 셀 네트워크 + SQLite 연결
///
/// CellNet: 인메모리 셀 관계망 (bincode 영속성)
/// Connection: DevStore가 사용하는 SQLite
pub struct CrownyDb {
    net: RefCell<CellNet>,
    conn: Connection,
    net_path: String,
}

impl CrownyDb {
    pub fn open(path: &str) -> Result<Self> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        init_dev_schema(&conn)?;

        let net_path = path.replace(".db", ".cellnet.bin");
        let net = if std::path::Path::new(&net_path).exists() {
            CellNet::load(&net_path).unwrap_or_else(|_| CellNet::new())
        } else {
            CellNet::new()
        };

        Ok(Self { net: RefCell::new(net), conn, net_path })
    }

    pub fn cell_net(&self) -> std::cell::Ref<'_, CellNet> {
        self.net.borrow()
    }

    pub fn cell_net_mut(&self) -> std::cell::RefMut<'_, CellNet> {
        self.net.borrow_mut()
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn net_path(&self) -> &str {
        &self.net_path
    }

    /// CellNet을 디스크에 저장
    pub fn save_net(&self) -> Result<()> {
        self.net.borrow().save(&self.net_path)?;
        Ok(())
    }
}

/// DevStore가 필요로 하는 최소 스키마
fn init_dev_schema(conn: &Connection) -> Result<()> {
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
