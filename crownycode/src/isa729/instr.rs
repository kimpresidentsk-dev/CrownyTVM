// crownycode/src/isa729/instr.rs
// ISA729 명령 집합 — 43개 opcode
// 균형3진 원칙: 이진 NOT → 3진 NEG, AND/OR → TAND/TOR, 조건 분기 3방향

use super::{Reg, TriWord};

/// ISA729 명령어 (43 opcodes)
#[derive(Debug, Clone, PartialEq)]
pub enum Instr {
    // ── 데이터 이동 (5) ────────────────────────────────────────
    /// LOAD rd, imm  — 즉시값 → 레지스터
    Load(Reg, TriWord),
    /// MOV rd, rs   — 레지스터 복사
    Mov(Reg, Reg),
    /// STORE rs, [rd] — 레지스터 → 메모리
    Store(Reg, Reg),
    /// FETCH rd, [rs] — 메모리 → 레지스터
    Fetch(Reg, Reg),
    /// PUSH rs      — 스택에 저장
    Push(Reg),

    // ── 균형3진 산술 (8) ──────────────────────────────────────
    /// ADD rd, rs1, rs2 — 균형3진 덧셈
    Add(Reg, Reg, Reg),
    /// SUB rd, rs1, rs2
    Sub(Reg, Reg, Reg),
    /// MUL rd, rs1, rs2
    Mul(Reg, Reg, Reg),
    /// DIV rd, rs1, rs2
    Div(Reg, Reg, Reg),
    /// MOD rd, rs1, rs2 — 나머지
    Mod(Reg, Reg, Reg),
    /// NEG rd, rs   — 균형3진 부정 (-1↔+1, 0→0)
    Neg(Reg, Reg),
    /// ABS rd, rs   — 절댓값
    Abs(Reg, Reg),
    /// SGNS rd, rs  — 부호 추출 (-1/0/+1)
    Sgns(Reg, Reg),

    // ── 균형3진 논리 (6) ──────────────────────────────────────
    /// TAND rd, rs1, rs2 — 3진 AND: min(a,b)
    Tand(Reg, Reg, Reg),
    /// TOR rd, rs1, rs2  — 3진 OR: max(a,b)
    Tor(Reg, Reg, Reg),
    /// TCONS rd, rs1, rs2 — 합의: 같으면 그 값, 다르면 0
    Tcons(Reg, Reg, Reg),
    /// SHIFT rd, rs, n   — trit 시프트 (n칸)
    Shift(Reg, Reg, i8),
    /// TSLICE rd, rs, lo, hi — trit 슬라이스 추출
    Tslice(Reg, Reg, u8, u8),
    /// TMASK rd, rs, mask — trit 마스킹
    Tmask(Reg, Reg, TriWord),

    // ── 4상 연산 (5) ──────────────────────────────────────────
    /// PHASE rd, rs — 4상 상태 추출 (+2/0/-1/-2)
    Phase(Reg, Reg),
    /// CONFIRM rd   — rd를 확정(+2)으로 설정
    Confirm(Reg),
    /// UNCERTAIN rd — rd를 미확인(0)으로 설정
    Uncertain(Reg),
    /// REFUTE rd    — rd를 오해(-1)로 설정
    Refute(Reg),
    /// UNKNOWN rd   — rd를 미인지(-2)로 설정
    Unknown(Reg),

    // ── 제어 흐름 (8) ─────────────────────────────────────────
    /// JMP label    — 무조건 점프
    Jmp(String),
    /// JT label     — rs > 0 이면 점프 (양수 = 확정)
    Jt(String, Reg),
    /// JZ label     — rs == 0 이면 점프 (영 = 미확인)
    Jz(String, Reg),
    /// JN label     — rs < 0 이면 점프 (음수 = 오해/미인지)
    Jn(String, Reg),
    /// CALL label   — 서브루틴 호출
    Call(String),
    /// RET          — 반환
    Ret,
    /// LOOP rd, label — rd를 1씩 감소, 0이 아닌 동안 반복
    Loop(Reg, String),
    /// HLT          — 실행 중지
    Hlt,

    // ── 스택 / 호출 규약 (4) ──────────────────────────────────
    /// POP rd
    Pop(Reg),
    /// FRAME n      — 스택 프레임 n 슬롯 할당
    Frame(u8),
    /// ARG rd, n    — n번째 인자를 rd에 로드
    Arg(Reg, u8),
    /// RVAL rd      — 반환값을 rd에 저장
    Rval(Reg),

    // ── I/O (3) ───────────────────────────────────────────────
    /// OUT rs       — rs 출력 (콘솔)
    Out(Reg),
    /// IN rd        — 입력 → rd
    In(Reg),
    /// TRAP n       — 시스템 콜 n
    Trap(u8),

    // ── 메타 / 디버그 (4) ─────────────────────────────────────
    /// LABEL name   — 레이블 정의 (어셈블러 지시어)
    Label(String),
    /// SECTION name — 섹션 지시어 (.text, .data, .bss)
    Section(String),
    /// GLOBAL name  — 전역 심볼 선언
    Global(String),
    /// NOP          — 무연산
    Nop,
}

impl Instr {
    /// opcode 이름 (어셈블리 출력용)
    pub fn mnemonic(&self) -> &'static str {
        match self {
            Instr::Load(..)     => "LOAD",
            Instr::Mov(..)      => "MOV",
            Instr::Store(..)    => "STORE",
            Instr::Fetch(..)    => "FETCH",
            Instr::Push(..)     => "PUSH",
            Instr::Add(..)      => "ADD",
            Instr::Sub(..)      => "SUB",
            Instr::Mul(..)      => "MUL",
            Instr::Div(..)      => "DIV",
            Instr::Mod(..)      => "MOD",
            Instr::Neg(..)      => "NEG",
            Instr::Abs(..)      => "ABS",
            Instr::Sgns(..)     => "SGNS",
            Instr::Tand(..)     => "TAND",
            Instr::Tor(..)      => "TOR",
            Instr::Tcons(..)    => "TCONS",
            Instr::Shift(..)    => "SHIFT",
            Instr::Tslice(..)   => "TSLICE",
            Instr::Tmask(..)    => "TMASK",
            Instr::Phase(..)    => "PHASE",
            Instr::Confirm(..)  => "CONFIRM",
            Instr::Uncertain(..)=> "UNCERTAIN",
            Instr::Refute(..)   => "REFUTE",
            Instr::Unknown(..)  => "UNKNOWN",
            Instr::Jmp(..)      => "JMP",
            Instr::Jt(..)       => "JT",
            Instr::Jz(..)       => "JZ",
            Instr::Jn(..)       => "JN",
            Instr::Call(..)     => "CALL",
            Instr::Ret          => "RET",
            Instr::Loop(..)     => "LOOP",
            Instr::Hlt          => "HLT",
            Instr::Pop(..)      => "POP",
            Instr::Frame(..)    => "FRAME",
            Instr::Arg(..)      => "ARG",
            Instr::Rval(..)     => "RVAL",
            Instr::Out(..)      => "OUT",
            Instr::In(..)       => "IN",
            Instr::Trap(..)     => "TRAP",
            Instr::Label(..)    => "LABEL",
            Instr::Section(..)  => "SECTION",
            Instr::Global(..)   => "GLOBAL",
            Instr::Nop          => "NOP",
        }
    }

    /// 데이터 흐름에 영향을 주는 명령인지
    pub fn is_data(&self) -> bool {
        matches!(self, Instr::Load(..) | Instr::Mov(..) | Instr::Fetch(..) |
                       Instr::Add(..) | Instr::Sub(..) | Instr::Mul(..) |
                       Instr::Neg(..) | Instr::Phase(..) | Instr::Confirm(..) |
                       Instr::Uncertain(..) | Instr::Refute(..) | Instr::Unknown(..))
    }

    /// 제어 흐름 명령인지
    pub fn is_branch(&self) -> bool {
        matches!(self, Instr::Jmp(..) | Instr::Jt(..) | Instr::Jz(..) |
                       Instr::Jn(..) | Instr::Call(..) | Instr::Ret | Instr::Hlt)
    }
}

/// ISA729 opcode 수 상수
pub const OPCODE_COUNT: usize = 43;

/// 전체 opcode 목록 (문서화용)
pub const ALL_MNEMONICS: &[&str] = &[
    "LOAD", "MOV", "STORE", "FETCH", "PUSH",
    "ADD", "SUB", "MUL", "DIV", "MOD", "NEG", "ABS", "SGNS",
    "TAND", "TOR", "TCONS", "SHIFT", "TSLICE", "TMASK",
    "PHASE", "CONFIRM", "UNCERTAIN", "REFUTE", "UNKNOWN",
    "JMP", "JT", "JZ", "JN", "CALL", "RET", "LOOP", "HLT",
    "POP", "FRAME", "ARG", "RVAL",
    "OUT", "IN", "TRAP",
    "LABEL", "SECTION", "GLOBAL", "NOP",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opcode_count() {
        assert_eq!(ALL_MNEMONICS.len(), OPCODE_COUNT);
    }

    #[test]
    fn test_mnemonic_hlt() {
        assert_eq!(Instr::Hlt.mnemonic(), "HLT");
    }

    #[test]
    fn test_mnemonic_add() {
        assert_eq!(Instr::Add(Reg::T0, Reg::T1, Reg::T2).mnemonic(), "ADD");
    }

    #[test]
    fn test_is_branch() {
        assert!(Instr::Hlt.is_branch());
        assert!(Instr::Jmp("loop".to_string()).is_branch());
        assert!(!Instr::Add(Reg::T0, Reg::T1, Reg::T2).is_branch());
    }

    #[test]
    fn test_is_data() {
        assert!(Instr::Load(Reg::T0, TriWord::ZERO).is_data());
        assert!(Instr::Confirm(Reg::T0).is_data());
        assert!(!Instr::Hlt.is_data());
    }

    #[test]
    fn test_phase_instrs_all_unique_mnemonics() {
        let phase_instrs = ["PHASE", "CONFIRM", "UNCERTAIN", "REFUTE", "UNKNOWN"];
        for m in &phase_instrs {
            assert!(ALL_MNEMONICS.contains(m), "{m} not in ALL_MNEMONICS");
        }
    }
}
