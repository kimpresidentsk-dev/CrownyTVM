// ═══════════════════════════════════════════════════════════════
// 삼진VM — ISA729 레지스터 기반 가상 머신
//
// 레지스터: r0~r26 (27개, 각 27-trit TritWord)
//   특수: ACC=r9, FLAG=r10, SP=r11, PC=r12
// 메모리: 729 워드 기본 (확장 가능)
// 스택: mem[SP]부터 아래로 성장
// 명령어: ISA729 (6t 옵코드 + 피연산자)
//
// 포맷:
//   Z = 옵코드만
//   A = 옵코드 + 피연산자1 (레지스터 번호 또는 즉치값)
//   B = 옵코드 + 피연산자1 + 피연산자2
//   C = 옵코드 + 목적 + 소스1 + 소스2
// ═══════════════════════════════════════════════════════════════

use std::fmt;

// ═══ 상수 ═══
pub const 레지스터수: usize = 27;
pub const 메모리크기: usize = 729;  // 3^6 = 기본
pub const ACC: usize = 9;
pub const FLAG: usize = 10;
pub const SP: usize = 11;
pub const PC: usize = 12;

/// 플래그 상태 (3진)
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum 플래그 { 티, 옴, 타 }

impl 플래그 {
    pub fn 에서(v: i64) -> 플래그 {
        if v > 0 { 플래그::티 } else if v < 0 { 플래그::타 } else { 플래그::옴 }
    }
    pub fn 값(&self) -> i64 {
        match self { 플래그::티 => 1, 플래그::옴 => 0, 플래그::타 => -1 }
    }
}

/// 명령어 포맷
#[derive(Debug, Clone)]
pub enum 명령어 {
    Z(u16),                        // 옵코드만
    A(u16, i64),                   // 옵코드 + 피연산자1
    B(u16, i64, i64),              // 옵코드 + 피연산자1 + 피연산자2
    C(u16, i64, i64, i64),         // 옵코드 + 목적 + 소스1 + 소스2
}

impl 명령어 {
    pub fn 옵코드(&self) -> u16 {
        match self { 명령어::Z(op) | 명령어::A(op, _) | 명령어::B(op, _, _) | 명령어::C(op, _, _, _) => *op }
    }
}

/// 삼진VM
pub struct 삼진VM {
    pub 레지스터: [i64; 레지스터수],
    pub 메모리: Vec<i64>,
    pub 프로그램: Vec<명령어>,
    pub 정지됨: bool,
    pub 출력: Vec<String>,
    pub 직접출력: bool,
    // 문자열 풀 (메모리는 i64이므로 문자열은 별도 저장)
    pub 문자열풀: Vec<String>,
    // 사이클 카운터
    pub 사이클: u64,
}

impl 삼진VM {
    pub fn 새것() -> Self {
        let mut vm = 삼진VM {
            레지스터: [0; 레지스터수],
            메모리: vec![0; 메모리크기],
            프로그램: Vec::new(),
            정지됨: false,
            출력: Vec::new(),
            직접출력: false,
            문자열풀: Vec::new(),
            사이클: 0,
        };
        // SP 초기값: 메모리 끝
        vm.레지스터[SP] = (메모리크기 - 1) as i64;
        vm
    }

    pub fn 프로그램적재(&mut self, 프로그램: Vec<명령어>) {
        self.프로그램 = 프로그램;
        self.레지스터[PC] = 0;
        self.정지됨 = false;
    }

    // ═══ 레지스터 접근 ═══
    pub fn r(&self, 번호: usize) -> i64 { self.레지스터[번호 % 레지스터수] }
    pub fn r_set(&mut self, 번호: usize, 값: i64) { self.레지스터[번호 % 레지스터수] = 값; }
    pub fn acc(&self) -> i64 { self.레지스터[ACC] }
    pub fn acc_set(&mut self, 값: i64) { self.레지스터[ACC] = 값; }
    pub fn flag(&self) -> 플래그 { 플래그::에서(self.레지스터[FLAG]) }
    pub fn flag_set(&mut self, f: 플래그) { self.레지스터[FLAG] = f.값(); }
    pub fn pc(&self) -> usize { self.레지스터[PC] as usize }
    pub fn pc_set(&mut self, v: usize) { self.레지스터[PC] = v as i64; }
    pub fn sp(&self) -> usize { self.레지스터[SP] as usize }

    // ═══ 메모리 접근 ═══
    pub fn mem(&self, 주소: usize) -> i64 {
        if 주소 < self.메모리.len() { self.메모리[주소] } else { 0 }
    }
    pub fn mem_set(&mut self, 주소: usize, 값: i64) {
        while 주소 >= self.메모리.len() { self.메모리.push(0); }
        self.메모리[주소] = 값;
    }

    // ═══ 스택 연산 ═══
    pub fn 스택넣기(&mut self, 값: i64) {
        let sp = self.sp();
        self.mem_set(sp, 값);
        self.레지스터[SP] -= 1;
    }
    pub fn 스택빼기(&mut self) -> i64 {
        self.레지스터[SP] += 1;
        let sp = self.sp();
        self.mem(sp)
    }

    // ═══ 문자열 풀 ═══
    pub fn 문자열추가(&mut self, s: String) -> i64 {
        let id = self.문자열풀.len() as i64 + 10000; // 10000+ = 문자열 핸들
        self.문자열풀.push(s);
        id
    }
    pub fn 문자열읽기(&self, 핸들: i64) -> &str {
        let idx = (핸들 - 10000) as usize;
        if idx < self.문자열풀.len() { &self.문자열풀[idx] } else { "" }
    }
    pub fn 문자열인가(핸들: i64) -> bool { 핸들 >= 10000 }

    // ═══ 플래그 자동 설정 ═══
    pub fn 플래그갱신(&mut self, 값: i64) {
        self.flag_set(플래그::에서(값));
    }

    // ═══ 출력 ═══
    pub fn 출력하기(&mut self, s: String) {
        if self.직접출력 { println!("{}", s); }
        else { self.출력.push(s); }
    }

    // ═══ 실행 루프 ═══
    pub fn 실행(&mut self) -> Result<i64, String> {
        while !self.정지됨 {
            let pc = self.pc();
            if pc >= self.프로그램.len() { break; }

            let 명령 = self.프로그램[pc].clone();
            self.레지스터[PC] += 1;
            self.사이클 += 1;

            // 무한 루프 방지
            if self.사이클 > 10_000_000 {
                return Err("사이클 한도 초과 (10M)".into());
            }

            self.실행명령(명령)?;
        }

        Ok(self.acc())
    }

    fn 실행명령(&mut self, 명령: 명령어) -> Result<(), String> {
        let op = 명령.옵코드();

        match op {
            // ═══ S0.G0 상태 (000~008) ═══
            0 => { // 티 TI
                self.acc_set(1);
                self.flag_set(플래그::티);
            }
            1 => { // 옴 OM
                self.acc_set(0);
                self.flag_set(플래그::옴);
            }
            2 => { // 타 TA
                self.acc_set(-1);
                self.flag_set(플래그::타);
            }
            3 => { self.acc_set(1); self.flag_set(플래그::티); }  // 참 TRUE
            4 => { self.acc_set(0); self.flag_set(플래그::옴); }  // 중립 NEUTRAL
            5 => { self.acc_set(-1); self.flag_set(플래그::타); } // 거짓 FALSE
            6 => { // 있다 EXISTS [A: reg]
                if let 명령어::A(_, r) = 명령 { let v = self.r(r as usize); self.flag_set(if v != 0 { 플래그::티 } else { 플래그::타 }); self.acc_set(if v != 0 { 1 } else { -1 }); }
            }
            8 => { // 즉치 LIT [A: 값]
                if let 명령어::A(_, v) = 명령 { self.acc_set(v); self.플래그갱신(v); }
            }

            // ═══ S0.G1 3진연산 (009~017) ═══
            9 => { // 삼진부정 TNOT
                self.acc_set(-self.acc().signum());
                self.플래그갱신(self.acc());
            }
            10 => { // 삼진그리고 TAND [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = self.r(a as usize).signum().min(self.r(b as usize).signum()); self.acc_set(r); self.플래그갱신(r); }
            }
            11 => { // 삼진또는 TOR [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = self.r(a as usize).signum().max(self.r(b as usize).signum()); self.acc_set(r); self.플래그갱신(r); }
            }
            12 => { // 삼진합의 TCONSENSUS [B: a, b]
                if let 명령어::B(_, a, b) = 명령 {
                    let va = self.r(a as usize).signum();
                    let vb = self.r(b as usize).signum();
                    let r = if va == vb { va } else { 0 };
                    self.acc_set(r); self.플래그갱신(r);
                }
            }

            // ═══ S0.G2 레지스터 (018~026) ═══
            18 => { // 적재 LOAD [B: dst, 주소]
                if let 명령어::B(_, dst, 주소) = 명령 { let v = self.mem(주소 as usize); self.r_set(dst as usize, v); self.플래그갱신(v); }
            }
            19 => { // 저장 STORE [B: 주소, src]
                if let 명령어::B(_, 주소, src) = 명령 { self.mem_set(주소 as usize, self.r(src as usize)); }
            }
            20 => { // 이동 MOV [B: dst, src]
                if let 명령어::B(_, dst, src) = 명령 { let v = self.r(src as usize); self.r_set(dst as usize, v); }
            }
            21 => { // 교환 SWAP [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let t = self.r(a as usize); self.r_set(a as usize, self.r(b as usize)); self.r_set(b as usize, t); }
            }
            22 => { // 넣기 PUSH [A: src]
                if let 명령어::A(_, src) = 명령 { self.스택넣기(self.r(src as usize)); }
            }
            23 => { // 빼기 POP [A: dst]
                if let 명령어::A(_, dst) = 명령 { let v = self.스택빼기(); self.r_set(dst as usize, v); }
            }
            24 => { // 즉치적재 LOADI [B: dst, 즉치값]
                if let 명령어::B(_, dst, val) = 명령 { self.r_set(dst as usize, val); self.플래그갱신(val); }
            }

            // ═══ S0.G3 변수 (027~035) — 이름 기반 (고수준) ═══
            // (한선씨 컴파일러와의 호환을 위해 유지)

            // ═══ S0.G4 산술 (036~044) ═══
            36 => { // 더하기 ADD [C: dst, a, b]
                if let 명령어::C(_, dst, a, b) = 명령 { let r = self.r(a as usize) + self.r(b as usize); self.r_set(dst as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            37 => { // 빼기 SUB [C: dst, a, b]
                if let 명령어::C(_, dst, a, b) = 명령 { let r = self.r(a as usize) - self.r(b as usize); self.r_set(dst as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            38 => { // 곱하기 MUL [C: dst, a, b]
                if let 명령어::C(_, dst, a, b) = 명령 { let r = self.r(a as usize) * self.r(b as usize); self.r_set(dst as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            39 => { // 나누기 DIV [C: dst, a, b]
                if let 명령어::C(_, dst, a, b) = 명령 {
                    let d = self.r(b as usize);
                    if d == 0 { self.flag_set(플래그::타); self.acc_set(0); }
                    else { let r = self.r(a as usize) / d; self.r_set(dst as usize, r); self.acc_set(r); self.플래그갱신(r); }
                }
            }
            40 => { // 나머지 MOD [C: dst, a, b]
                if let 명령어::C(_, dst, a, b) = 명령 {
                    let d = self.r(b as usize);
                    if d == 0 { self.flag_set(플래그::타); }
                    else { let r = self.r(a as usize) % d; self.r_set(dst as usize, r); self.acc_set(r); self.플래그갱신(r); }
                }
            }
            41 => { // 증가 INC [A: reg]
                if let 명령어::A(_, reg) = 명령 { let r = self.r(reg as usize) + 1; self.r_set(reg as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            42 => { // 감소 DEC [A: reg]
                if let 명령어::A(_, reg) = 명령 { let r = self.r(reg as usize) - 1; self.r_set(reg as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            43 => { // 부호반전 NEG [A: reg]
                if let 명령어::A(_, reg) = 명령 { let r = -self.r(reg as usize); self.r_set(reg as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }
            44 => { // 절대값 ABS [A: reg]
                if let 명령어::A(_, reg) = 명령 { let r = self.r(reg as usize).abs(); self.r_set(reg as usize, r); self.acc_set(r); self.플래그갱신(r); }
            }

            // ═══ S0.G5 비교 (045~053) ═══
            45 => { // 같은가 EQ [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = if self.r(a as usize) == self.r(b as usize) { 1 } else { -1 }; self.acc_set(r); self.플래그갱신(r); }
            }
            46 => { // 다른가 NE [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = if self.r(a as usize) != self.r(b as usize) { 1 } else { -1 }; self.acc_set(r); self.플래그갱신(r); }
            }
            47 => { // 큰가 GT [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = if self.r(a as usize) > self.r(b as usize) { 1 } else { -1 }; self.acc_set(r); self.플래그갱신(r); }
            }
            48 => { // 작은가 LT [B: a, b]
                if let 명령어::B(_, a, b) = 명령 { let r = if self.r(a as usize) < self.r(b as usize) { 1 } else { -1 }; self.acc_set(r); self.플래그갱신(r); }
            }
            49 => { // 비교 CMP [B: a, b] → 양/중/음
                if let 명령어::B(_, a, b) = 명령 {
                    let va = self.r(a as usize); let vb = self.r(b as usize);
                    let r = if va > vb { 1 } else if va < vb { -1 } else { 0 };
                    self.acc_set(r); self.플래그갱신(r);
                }
            }

            // ═══ S0.G6 흐름 (054~062) ═══
            54 => { // 점프 JMP [A: 주소]
                if let 명령어::A(_, 주소) = 명령 { self.pc_set(주소 as usize); }
            }
            55 => { // 양점프 JT [A: 주소] — FLAG=Ti이면
                if let 명령어::A(_, 주소) = 명령 { if self.flag() == 플래그::티 { self.pc_set(주소 as usize); } }
            }
            56 => { // 음점프 JF [A: 주소] — FLAG=Ta이면
                if let 명령어::A(_, 주소) = 명령 { if self.flag() == 플래그::타 { self.pc_set(주소 as usize); } }
            }
            57 => { // 중점프 JN [A: 주소] — FLAG=Om이면
                if let 명령어::A(_, 주소) = 명령 { if self.flag() == 플래그::옴 { self.pc_set(주소 as usize); } }
            }
            58 => { // 세갈래 IF3 [C: -, 양주소, 음주소] — 중이면 다음
                if let 명령어::C(_, _, 양, 음) = 명령 {
                    match self.flag() {
                        플래그::티 => self.pc_set(양 as usize),
                        플래그::타 => self.pc_set(음 as usize),
                        플래그::옴 => {} // fall through
                    }
                }
            }
            59 => { // 호출 CALL [A: 주소]
                if let 명령어::A(_, 주소) = 명령 {
                    self.스택넣기(self.pc() as i64); // 복귀주소
                    self.pc_set(주소 as usize);
                }
            }
            60 => { // 복귀 RET [Z]
                let 복귀 = self.스택빼기();
                self.pc_set(복귀 as usize);
            }
            61 => { // 정지 HALT [Z]
                self.정지됨 = true;
            }
            62 => { // 무연산 NOP [Z]
                // 아무것도 안 함
            }

            // ═══ S0.G8 체계 (072~080) ═══
            72 => { // 출력정수 PRINT_INT [A: reg]
                if let 명령어::A(_, reg) = 명령 {
                    let v = self.r(reg as usize);
                    if 삼진VM::문자열인가(v) {
                        self.출력하기(self.문자열읽기(v).to_string());
                    } else {
                        self.출력하기(v.to_string());
                    }
                }
            }
            73 => { // 출력문자열 PRINT_STR [A: 핸들]
                if let 명령어::A(_, 핸들) = 명령 {
                    let s = self.문자열읽기(핸들).to_string();
                    self.출력하기(s);
                }
            }
            74 => { // 문자열적재 STR_LIT [A: -] (문자열풀 인덱스를 ACC에)
                if let 명령어::A(_, idx) = 명령 { self.acc_set(idx); }
            }
            76 => { // 즉치출력 PRINT_IMM [A: 값] — 즉치값 직접 출력
                if let 명령어::A(_, v) = 명령 {
                    if 삼진VM::문자열인가(v) {
                        self.출력하기(self.문자열읽기(v).to_string());
                    } else {
                        self.출력하기(v.to_string());
                    }
                }
            }
            80 => { // 사이클 CYCLE [Z] — 현재 사이클을 ACC에
                self.acc_set(self.사이클 as i64);
            }

            _ => {
                // 미구현 옵코드 — 무시 (NOP처럼 동작)
            }
        }

        Ok(())
    }
}

impl fmt::Display for 삼진VM {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "삼진VM[ACC={} FLAG={:?} SP={} PC={} 사이클={}]",
            self.acc(), self.flag(), self.sp(), self.pc(), self.사이클)
    }
}

#[cfg(test)]
mod 시험 {
    use super::*;

    #[test]
    fn 기본_산술() {
        let mut vm = 삼진VM::새것();
        vm.프로그램적재(vec![
            명령어::B(24, 0, 30),    // r0 = 30
            명령어::B(24, 1, 12),    // r1 = 12
            명령어::C(36, 2, 0, 1),  // r2 = r0 + r1
            명령어::Z(61),           // HALT
        ]);
        let r = vm.실행().unwrap();
        assert_eq!(vm.r(2), 42);
        assert_eq!(r, 42);  // ACC = 마지막 산술 결과
    }

    #[test]
    fn 비교_점프() {
        let mut vm = 삼진VM::새것();
        vm.프로그램적재(vec![
            명령어::B(24, 0, 5),     // 0: r0 = 5
            명령어::B(24, 1, 3),     // 1: r1 = 3
            명령어::B(47, 0, 1),     // 2: GT r0, r1 → FLAG=Ti
            명령어::A(55, 5),        // 3: JT 5 (5>3이면 5번으로)
            명령어::B(24, 2, 0),     // 4: r2 = 0 (여기 안 옴)
            명령어::B(24, 2, 42),    // 5: r2 = 42 (여기로 점프)
            명령어::Z(61),           // 6: HALT
        ]);
        vm.실행().unwrap();
        assert_eq!(vm.r(2), 42);
    }

    #[test]
    fn 세갈래_분기() {
        let mut vm = 삼진VM::새것();
        // 양 경로 테스트
        vm.프로그램적재(vec![
            명령어::B(24, 0, 1),     // 0: r0 = 1 (양)
            명령어::B(24, 1, 0),     // 1: r1 = 0
            명령어::B(49, 0, 1),     // 2: CMP r0, r1 → 양
            명령어::C(58, 0, 5, 7),  // 3: IF3 양→5 음→7
            명령어::B(24, 3, 99),    // 4: 중(fall-through) r3=99
            명령어::B(24, 3, 1),     // 5: 양 r3=1
            명령어::A(54, 8),        // 6: JMP 8
            명령어::B(24, 3, -1),    // 7: 음 r3=-1
            명령어::Z(61),           // 8: HALT
        ]);
        vm.실행().unwrap();
        assert_eq!(vm.r(3), 1);
    }

    #[test]
    fn 스택_호출() {
        let mut vm = 삼진VM::새것();
        vm.프로그램적재(vec![
            명령어::B(24, 0, 10),    // 0: r0 = 10 (인자)
            명령어::A(59, 4),        // 1: CALL 4 (함수 주소)
            명령어::B(24, 3, 99),    // 2: 복귀 후 실행 (r3=99)
            명령어::Z(61),           // 3: HALT
            // 함수: r0 * 2 → ACC
            명령어::B(24, 1, 2),     // 4: r1 = 2
            명령어::C(38, ACC as i64, 0, 1), // 5: ACC = r0 * r1
            명령어::Z(60),           // 6: RET
        ]);
        vm.실행().unwrap();
        assert_eq!(vm.acc(), 20);
        assert_eq!(vm.r(3), 99);  // 복귀 후 실행됨
    }

    #[test]
    fn 삼진논리() {
        let mut vm = 삼진VM::새것();
        vm.프로그램적재(vec![
            명령어::B(24, 0, 1),     // r0 = 1 (양)
            명령어::B(24, 1, -1),    // r1 = -1 (음)
            명령어::B(12, 0, 1),     // TCONSENSUS r0, r1 → 0 (불일치)
            명령어::Z(61),
        ]);
        vm.실행().unwrap();
        assert_eq!(vm.acc(), 0);
    }

    #[test]
    fn 루프_합계() {
        let mut vm = 삼진VM::새것();
        // sum = 0, i = 0; while(i < 5) { sum += i; i++; }
        vm.프로그램적재(vec![
            명령어::B(24, 0, 0),     // 0: r0(합) = 0
            명령어::B(24, 1, 0),     // 1: r1(i) = 0
            명령어::B(24, 2, 5),     // 2: r2 = 5 (한도)
            // 루프 시작 (PC=3)
            명령어::B(48, 1, 2),     // 3: LT r1, r2 → FLAG
            명령어::A(56, 8),        // 4: JF 8 (i>=5면 탈출)
            명령어::C(36, 0, 0, 1),  // 5: r0 = r0 + r1
            명령어::A(41, 1),        // 6: r1++ (INC)
            명령어::A(54, 3),        // 7: JMP 3
            명령어::Z(61),           // 8: HALT
        ]);
        vm.실행().unwrap();
        assert_eq!(vm.r(0), 10);  // 0+1+2+3+4 = 10
    }
}
