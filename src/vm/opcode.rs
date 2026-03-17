// ═══════════════════════════════════════════════════════════════
// ISA729 옵코드 상수 — 6-trit 인코딩 (0~728)
// 9 섹터 × 81 옵코드/섹터
// ═══════════════════════════════════════════════════════════════

pub mod op {
    // ═══ 섹터 0: 스택/흐름 (0~80) ═══
    pub const NOP:     u16 = 0;
    pub const HALT:    u16 = 1;
    pub const PUSH:    u16 = 2;
    pub const POP:     u16 = 3;
    pub const DUP:     u16 = 4;
    pub const SWAP:    u16 = 5;
    pub const CLEAR:   u16 = 6;
    pub const STORE:   u16 = 7;
    pub const LOAD:    u16 = 8;

    // ═══ 섹터 1: 산술 (81~161) ═══
    pub const ADD:     u16 = 81;
    pub const SUB:     u16 = 82;
    pub const MUL:     u16 = 83;
    pub const DIV:     u16 = 84;
    pub const MOD:     u16 = 85;
    pub const NEG:     u16 = 86;
    pub const POW:     u16 = 87;
    pub const MIN:     u16 = 88;
    pub const MAX:     u16 = 89;

    // ═══ 섹터 2: 비교/논리 (162~242) ═══
    pub const EQ:      u16 = 162;
    pub const NEQ:     u16 = 163;
    pub const GT:      u16 = 164;
    pub const LT:      u16 = 165;
    pub const NOT:     u16 = 166;
    pub const AND:     u16 = 167;
    pub const CMP:     u16 = 168;
    pub const TRUE:    u16 = 169;
    pub const FALSE:   u16 = 170;
    pub const UNKNOWN: u16 = 171;

    // ═══ 섹터 3: 흐름제어 (243~323) ═══
    pub const JMP:     u16 = 243;
    pub const JMPIF:   u16 = 244;
    pub const IF3:     u16 = 245;
    pub const FUNC:    u16 = 246;
    pub const CALL:    u16 = 247;
    pub const RET:     u16 = 248;

    // ═══ 섹터 4: IO (324~404) ═══
    pub const PRINT:   u16 = 324;

    // ═══ 섹터 5: 배열/해시 (405~485) ═══
    pub const ARRAY:   u16 = 405;
    pub const LEN:     u16 = 406;
    pub const INDEX:   u16 = 407;
    pub const APPEND:  u16 = 408;
    pub const SORT:    u16 = 409;
    pub const REVERSE: u16 = 410;
    pub const ZIP:     u16 = 411;
    pub const HASH_NEW: u16 = 412;
    pub const HASH_SET: u16 = 413;
    pub const HASH_GET: u16 = 414;

    // ═══ 섹터 6: 타입 변환 (486~566) ═══
    pub const TOINT:   u16 = 486;
    pub const TOFLT:   u16 = 487;
    pub const TOSTR:   u16 = 488;
    pub const TOTRIT:  u16 = 489;
    pub const TYPE:    u16 = 490;

    // ═══ 섹터 7: 에러 (567~647) ═══
    pub const TRY:     u16 = 567;
    pub const CATCH:   u16 = 568;
    pub const THROW:   u16 = 569;

    // ═══ 섹터 7+: Stage 1 확장 ═══
    pub const BUILTIN: u16 = 570;   // 내장함수 호출 (a=id, 인자는 스택)
    pub const SYSCALL: u16 = 571;   // 시스템콜 (이름+인자 스택)
    pub const SETIDX:  u16 = 572;   // 배열 인덱스 대입 [arr, idx, val] → arr

    // ═══ 섹터 8: 4세대 온톨로직 (648~728) ═══
    pub const CLAIM_NEW:    u16 = 648;
    pub const CLAIM_STATE:  u16 = 649;
    pub const CLAIM_SET:    u16 = 650;
    pub const CLAIM_CONF:   u16 = 651;
    pub const CLAIM_EVID:   u16 = 652;
    pub const CLAIM_DECIDE: u16 = 653;
    pub const CLAIM_TRANS:  u16 = 654;

    /// 옵코드별 사이클 비용
    pub fn cycle_cost(opc: u16) -> u64 {
        match opc {
            NOP => 1,
            CALL | RET => 3,
            CLAIM_NEW | CLAIM_DECIDE => 5,
            BUILTIN | SYSCALL => 2,
            _ => 1,
        }
    }

    /// 옵코드 이름 (디스어셈블용)
    pub fn name(opc: u16) -> &'static str {
        match opc {
            NOP => "NOP", HALT => "HALT", PUSH => "PUSH", POP => "POP",
            DUP => "DUP", SWAP => "SWAP", CLEAR => "CLEAR",
            STORE => "STORE", LOAD => "LOAD",
            ADD => "ADD", SUB => "SUB", MUL => "MUL", DIV => "DIV",
            MOD => "MOD", NEG => "NEG", POW => "POW", MIN => "MIN", MAX => "MAX",
            EQ => "EQ", NEQ => "NEQ", GT => "GT", LT => "LT",
            NOT => "NOT", AND => "AND", CMP => "CMP",
            TRUE => "TRUE", FALSE => "FALSE", UNKNOWN => "UNKNOWN",
            JMP => "JMP", JMPIF => "JMPIF", IF3 => "IF3",
            FUNC => "FUNC", CALL => "CALL", RET => "RET",
            PRINT => "PRINT",
            ARRAY => "ARRAY", LEN => "LEN", INDEX => "INDEX",
            APPEND => "APPEND", SORT => "SORT", REVERSE => "REVERSE", ZIP => "ZIP",
            HASH_NEW => "HASH_NEW", HASH_SET => "HASH_SET", HASH_GET => "HASH_GET",
            TOINT => "TOINT", TOFLT => "TOFLT", TOSTR => "TOSTR",
            TOTRIT => "TOTRIT", TYPE => "TYPE",
            TRY => "TRY", CATCH => "CATCH", THROW => "THROW",
            CLAIM_NEW => "CLAIM_NEW", CLAIM_STATE => "CLAIM_STATE",
            CLAIM_SET => "CLAIM_SET", CLAIM_CONF => "CLAIM_CONF",
            CLAIM_EVID => "CLAIM_EVID", CLAIM_DECIDE => "CLAIM_DECIDE",
            CLAIM_TRANS => "CLAIM_TRANS",
            BUILTIN => "BUILTIN", SYSCALL => "SYSCALL", SETIDX => "SETIDX",
            _ => "???",
        }
    }
}
