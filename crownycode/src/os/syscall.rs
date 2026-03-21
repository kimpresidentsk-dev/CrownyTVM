// crownycode/src/os/syscall.rs
// ═══════════════════════════════════════════════════════════════
// CrownyOS Syscall 인터페이스
// ═══════════════════════════════════════════════════════════════
//
// CrownyOS 커널이 crownycode에 코드 생성을 요청하는 방식.
// bridge.js가 아니라 커널 레벨 연결.
//
// syscall 번호:
//   SYS_CROWNYCODE_GEN    = 0x100  코드 생성 요청
//   SYS_CROWNYCODE_LEARN  = 0x101  학습 요청
//   SYS_CROWNYCODE_QUERY  = 0x102  셀 조회
//   SYS_CROWNYCODE_STATUS = 0x103  상태 조회
//   SYS_CROWNYCODE_SYNC   = 0x104  Life Graph 동기화

use crate::error::Result;
use crate::cell::net::CellNet;
use crate::cell::TritState;

/// Syscall 번호
pub const SYS_CROWNYCODE_GEN: u32    = 0x100;
pub const SYS_CROWNYCODE_LEARN: u32  = 0x101;
pub const SYS_CROWNYCODE_QUERY: u32  = 0x102;
pub const SYS_CROWNYCODE_STATUS: u32 = 0x103;
pub const SYS_CROWNYCODE_SYNC: u32   = 0x104;

/// Syscall 요청
#[derive(Debug, Clone)]
pub enum SyscallRequest {
    /// 코드 생성: 자연어 입력 + 대상 언어
    Generate { input: String, target_lang: String },
    /// 학습: 토픽
    Learn { topic: String },
    /// 셀 조회: 의도
    Query { intent: String },
    /// 상태 조회
    Status,
    /// Life Graph 동기화: CellNet 스냅샷 교환
    Sync { snapshot: Vec<u8> },
}

/// Syscall 응답
#[derive(Debug, Clone)]
pub enum SyscallResponse {
    /// 코드 생성 결과
    Generated {
        code: String,
        target_lang: String,
        confidence: f32,
        trit_state: TritState,
    },
    /// 학습 결과
    Learned { cell_id: u64, intent: String },
    /// 셀 조회 결과
    QueryResult {
        intent: String,
        trit_state: TritState,
        energy: f32,
        patterns_count: usize,
    },
    /// 상태
    StatusInfo {
        cell_count: usize,
        engine_version: String,
        os_connected: bool,
    },
    /// 동기화 완료
    Synced { cells_merged: usize },
    /// 오류
    Error(String),
}

/// CrownyOS Syscall 인터페이스 트레이트
///
/// CrownyOS 커널이 이 트레이트를 구현하면
/// crownycode와 네이티브로 연결된다.
pub trait CrownyOsSyscall {
    /// syscall 처리
    fn handle(&self, request: SyscallRequest) -> Result<SyscallResponse>;

    /// Life Graph와 CellNet 동기화
    fn sync_life_graph(&self, net: &mut CellNet) -> Result<usize>;

    /// ISA729 코드를 네이티브로 실행
    fn execute_native(&self, asm_text: &str) -> Result<NativeExecResult>;
}

/// 네이티브 실행 결과
#[derive(Debug, Clone)]
pub struct NativeExecResult {
    /// 실행 성공 여부
    pub success: bool,
    /// 실행 시간 (마이크로초)
    pub exec_time_us: u64,
    /// 결과 값 (T0 레지스터)
    pub result_value: i64,
    /// 출력 로그
    pub output: Vec<String>,
}

/// 스텁 구현 — 개발/테스트 환경용
///
/// CrownyOS 커널 없이 동작. 모든 요청을 로컬에서 처리.
pub struct StubSyscall;

impl CrownyOsSyscall for StubSyscall {
    fn handle(&self, request: SyscallRequest) -> Result<SyscallResponse> {
        match request {
            SyscallRequest::Status => {
                Ok(SyscallResponse::StatusInfo {
                    cell_count: 0,
                    engine_version: "0.2-stub".to_string(),
                    os_connected: false,
                })
            }
            SyscallRequest::Query { intent } => {
                Ok(SyscallResponse::QueryResult {
                    intent,
                    trit_state: TritState::Unknown,
                    energy: 0.0,
                    patterns_count: 0,
                })
            }
            _ => Ok(SyscallResponse::Error(
                "CrownyOS 미연결: stub 모드".to_string()
            )),
        }
    }

    fn sync_life_graph(&self, _net: &mut CellNet) -> Result<usize> {
        // 스텁: 동기화 없음
        Ok(0)
    }

    fn execute_native(&self, _asm_text: &str) -> Result<NativeExecResult> {
        // 스텁: 소프트웨어 VM으로 폴백
        Ok(NativeExecResult {
            success: false,
            exec_time_us: 0,
            result_value: 0,
            output: vec!["stub: CrownyOS 미연결, VM 폴백 필요".to_string()],
        })
    }
}

/// 현재 환경에 맞는 syscall 구현 생성
pub fn create_syscall() -> Box<dyn CrownyOsSyscall> {
    // CrownyOS 환경이면 KernelSyscall, 아니면 StubSyscall
    // TODO: Step 5b에서 KernelSyscall 구현
    Box::new(StubSyscall)
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stub_status() {
        let sys = StubSyscall;
        let resp = sys.handle(SyscallRequest::Status).unwrap();
        match resp {
            SyscallResponse::StatusInfo { os_connected, .. } => {
                assert!(!os_connected);
            }
            _ => panic!("Expected StatusInfo"),
        }
    }

    #[test]
    fn test_stub_query() {
        let sys = StubSyscall;
        let resp = sys.handle(SyscallRequest::Query { intent: "http_server".into() }).unwrap();
        match resp {
            SyscallResponse::QueryResult { trit_state, .. } => {
                assert_eq!(trit_state, TritState::Unknown);
            }
            _ => panic!("Expected QueryResult"),
        }
    }

    #[test]
    fn test_stub_generate_returns_error() {
        let sys = StubSyscall;
        let resp = sys.handle(SyscallRequest::Generate {
            input: "test".into(), target_lang: "rust".into()
        }).unwrap();
        assert!(matches!(resp, SyscallResponse::Error(_)));
    }

    #[test]
    fn test_stub_sync_returns_zero() {
        let sys = StubSyscall;
        let mut net = CellNet::new();
        let synced = sys.sync_life_graph(&mut net).unwrap();
        assert_eq!(synced, 0);
    }

    #[test]
    fn test_stub_native_exec_fails() {
        let sys = StubSyscall;
        let result = sys.execute_native("LOAD T0, 42\nHLT").unwrap();
        assert!(!result.success);
    }

    #[test]
    fn test_create_syscall_returns_stub() {
        let sys = create_syscall();
        let resp = sys.handle(SyscallRequest::Status).unwrap();
        assert!(matches!(resp, SyscallResponse::StatusInfo { .. }));
    }

    #[test]
    fn test_syscall_constants() {
        assert_eq!(SYS_CROWNYCODE_GEN, 0x100);
        assert_eq!(SYS_CROWNYCODE_SYNC, 0x104);
    }
}
