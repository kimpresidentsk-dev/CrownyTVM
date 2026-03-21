// crownycode/src/os/mod.rs
// ═══════════════════════════════════════════════════════════════
// CrownyOS 네이티브 연결 — syscall 인터페이스
// ═══════════════════════════════════════════════════════════════
//
// 원래 목적: "CrownyOS에서만 돌아가는 엔진"
//
// 크라우니코드는 CrownyOS의 코그니티브 레이어로 동작한다.
// 연결 포인트 3개:
//   1. syscall: 커널이 crownycode에 코드 생성 요청
//   2. Life Graph 공유: CrownyOS의 신뢰 전파 그래프와 CellNet 공유
//   3. ISA729 네이티브 실행: 생성된 크라우니어가 OS 위에서 직접 실행
//
// 현재: StubSyscall (개발/테스트용)
// CrownyOS 연결 시: KernelSyscall로 교체

pub mod syscall;


/// CrownyOS 연결 상태
#[derive(Debug, Clone, PartialEq)]
pub enum OsConnectionState {
    /// CrownyOS 커널에 직접 연결됨
    NativeKernel,
    /// QEMU 에뮬레이션을 통해 연결됨
    QemuEmulated,
    /// bridge.js REST API를 통해 연결됨 (임시)
    BridgeApi(String),
    /// 연결 없음 (standalone 모드)
    Disconnected,
}

/// CrownyOS 정보
#[derive(Debug, Clone)]
pub struct OsInfo {
    pub connection: OsConnectionState,
    pub kernel_version: Option<String>,
    pub elf_size: Option<u64>,
    pub board: Option<String>,
}

impl OsInfo {
    /// 연결되어 있는지
    pub fn is_connected(&self) -> bool {
        !matches!(self.connection, OsConnectionState::Disconnected)
    }

    /// 네이티브 실행 가능한지
    pub fn can_execute_native(&self) -> bool {
        matches!(self.connection,
            OsConnectionState::NativeKernel | OsConnectionState::QemuEmulated)
    }
}

/// 현재 OS 연결 상태 감지
///
/// CrownyOS 환경이면 커널 연결을 시도하고,
/// 아니면 bridge.js나 standalone으로 폴백.
pub fn detect_os() -> OsInfo {
    // 1. CrownyOS 커널 존재 확인
    if std::path::Path::new("/proc/crownyos/version").exists() {
        let version = std::fs::read_to_string("/proc/crownyos/version")
            .unwrap_or_else(|_| "unknown".to_string());
        return OsInfo {
            connection: OsConnectionState::NativeKernel,
            kernel_version: Some(version.trim().to_string()),
            elf_size: None,
            board: detect_board(),
        };
    }

    // 2. QEMU 환경 확인
    if std::env::var("CROWNYOS_QEMU").is_ok() {
        return OsInfo {
            connection: OsConnectionState::QemuEmulated,
            kernel_version: std::env::var("CROWNYOS_VERSION").ok(),
            elf_size: None,
            board: Some("qemu-virt".to_string()),
        };
    }

    // 3. bridge.js 확인
    if let Ok(bridge_url) = std::env::var("CROWNYOS_BRIDGE_URL") {
        return OsInfo {
            connection: OsConnectionState::BridgeApi(bridge_url),
            kernel_version: None,
            elf_size: None,
            board: None,
        };
    }

    // 4. Standalone
    OsInfo {
        connection: OsConnectionState::Disconnected,
        kernel_version: None,
        elf_size: None,
        board: None,
    }
}

fn detect_board() -> Option<String> {
    // 실제 CrownyOS에서 보드 감지
    std::fs::read_to_string("/proc/crownyos/board")
        .ok()
        .map(|s| s.trim().to_string())
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_os_standalone() {
        // 테스트 환경에서는 항상 Disconnected
        let info = detect_os();
        assert!(!info.is_connected());
        assert!(!info.can_execute_native());
    }

    #[test]
    fn test_os_connection_states() {
        let native = OsInfo {
            connection: OsConnectionState::NativeKernel,
            kernel_version: Some("0.1.0".into()),
            elf_size: Some(87_000),
            board: Some("rpi4".into()),
        };
        assert!(native.is_connected());
        assert!(native.can_execute_native());

        let bridge = OsInfo {
            connection: OsConnectionState::BridgeApi("http://localhost:3000".into()),
            kernel_version: None,
            elf_size: None,
            board: None,
        };
        assert!(bridge.is_connected());
        assert!(!bridge.can_execute_native());
    }
}
