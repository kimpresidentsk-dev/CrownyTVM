// crownycode/src/cell/store.rs
// CrownyDb — CellNet 기반 (rusqlite 완전 제거)

use std::cell::RefCell;
use crate::error::Result;
use super::net::CellNet;

/// CrownyDb — 셀 네트워크 + 파일 기반 저장소
///
/// CellNet: 인메모리 셀 관계망 (자체 바이너리 영속성)
/// db_path: DevStore/gateway가 사용하는 기본 경로
pub struct CrownyDb {
    net: RefCell<CellNet>,
    db_path: String,
    net_path: String,
}

impl CrownyDb {
    pub fn open(path: &str) -> Result<Self> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }

        let net_path = path.replace(".db", ".cellnet.bin");
        let net = if std::path::Path::new(&net_path).exists() {
            CellNet::load(&net_path).unwrap_or_else(|_| CellNet::new())
        } else {
            CellNet::new()
        };

        Ok(Self { net: RefCell::new(net), db_path: path.to_string(), net_path })
    }

    pub fn cell_net(&self) -> std::cell::Ref<'_, CellNet> {
        self.net.borrow()
    }

    pub fn cell_net_mut(&self) -> std::cell::RefMut<'_, CellNet> {
        self.net.borrow_mut()
    }

    /// DB 기본 경로 (DevStore/gateway용)
    pub fn db_path(&self) -> &str {
        &self.db_path
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
