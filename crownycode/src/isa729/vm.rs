// crownycode/src/isa729/vm.rs
// ISA729 VM — 균형3진 가상머신
// 크라우니어셈블리 텍스트를 파싱하고 실행

use anyhow::{Result, bail};
use std::collections::HashMap;
use super::{Reg, TriWord};
use super::instr::Instr;

/// VM 상태
pub struct Vm {
    /// 범용 레지스터 T0~T8
    regs: [TriWord; 9],
    /// 프로그램 카운터
    pc: usize,
    /// 스택 포인터 (스택 슬롯 인덱스)
    sp: usize,
    /// 스택 메모리
    stack: Vec<TriWord>,
    /// 힙 메모리 (주소 → 값)
    heap: HashMap<usize, TriWord>,
    /// 실행 이력 (최근 N개)
    trace: Vec<String>,
    /// 최대 실행 스텝 (무한 루프 방지)
    max_steps: usize,
}

impl Default for Vm {
    fn default() -> Self {
        Self::new()
    }
}

impl Vm {
    pub fn new() -> Self {
        Self {
            regs: [TriWord::ZERO; 9],
            pc: 0,
            sp: 0,
            stack: vec![TriWord::ZERO; 256],
            heap: HashMap::new(),
            trace: Vec::new(),
            max_steps: 10_000,
        }
    }

    /// 레지스터 읽기
    pub fn get_reg(&self, reg: Reg) -> TriWord {
        match reg {
            Reg::T0 => self.regs[0], Reg::T1 => self.regs[1],
            Reg::T2 => self.regs[2], Reg::T3 => self.regs[3],
            Reg::T4 => self.regs[4], Reg::T5 => self.regs[5],
            Reg::T6 => self.regs[6], Reg::T7 => self.regs[7],
            Reg::T8 => self.regs[8],
            Reg::PC => TriWord::from_int(self.pc as i64),
            Reg::SP => TriWord::from_int(self.sp as i64),
            Reg::SR => TriWord::ZERO,
        }
    }

    fn set_reg(&mut self, reg: Reg, val: TriWord) {
        let idx = reg_idx(reg);
        if let Some(i) = idx { self.regs[i] = val; }
    }

    /// 명령어 목록 실행
    pub fn execute(&mut self, instrs: &[Instr]) -> Result<VmResult> {
        let mut labels: HashMap<String, usize> = HashMap::new();

        // 1패스: 레이블 수집
        for (i, instr) in instrs.iter().enumerate() {
            if let Instr::Label(name) = instr {
                labels.insert(name.clone(), i);
            }
        }

        let mut steps = 0;
        self.pc = 0;

        while self.pc < instrs.len() {
            if steps >= self.max_steps {
                bail!("최대 실행 스텝({}) 초과 — 무한 루프 의심", self.max_steps);
            }
            steps += 1;

            let instr = &instrs[self.pc];
            let trace_str = format!("[{:04}] {:?}", self.pc, instr);

            match instr {
                // ── 데이터 이동 ──────────────────────────────────
                Instr::Load(rd, imm) => {
                    self.set_reg(*rd, *imm);
                    self.pc += 1;
                }
                Instr::Mov(rd, rs) => {
                    let v = self.get_reg(*rs);
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Store(rs, addr_reg) => {
                    let addr = self.get_reg(*addr_reg).to_int() as usize;
                    let val = self.get_reg(*rs);
                    self.heap.insert(addr, val);
                    self.pc += 1;
                }
                Instr::Fetch(rd, addr_reg) => {
                    let addr = self.get_reg(*addr_reg).to_int() as usize;
                    let val = self.heap.get(&addr).copied().unwrap_or(TriWord::ZERO);
                    self.set_reg(*rd, val);
                    self.pc += 1;
                }
                Instr::Push(rs) => {
                    let val = self.get_reg(*rs);
                    if self.sp < self.stack.len() {
                        self.stack[self.sp] = val;
                        self.sp += 1;
                    }
                    self.pc += 1;
                }
                Instr::Pop(rd) => {
                    if self.sp > 0 {
                        self.sp -= 1;
                        let val = self.stack[self.sp];
                        self.set_reg(*rd, val);
                    }
                    self.pc += 1;
                }

                // ── 산술 ─────────────────────────────────────────
                Instr::Add(rd, r1, r2) => {
                    let v = TriWord::from_int(
                        self.get_reg(*r1).to_int() + self.get_reg(*r2).to_int()
                    );
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Sub(rd, r1, r2) => {
                    let v = TriWord::from_int(
                        self.get_reg(*r1).to_int() - self.get_reg(*r2).to_int()
                    );
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Mul(rd, r1, r2) => {
                    let v = TriWord::from_int(
                        self.get_reg(*r1).to_int() * self.get_reg(*r2).to_int()
                    );
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Neg(rd, rs) => {
                    let v = TriWord::from_int(-self.get_reg(*rs).to_int());
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Abs(rd, rs) => {
                    let v = TriWord::from_int(self.get_reg(*rs).to_int().abs());
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Sgns(rd, rs) => {
                    let n = self.get_reg(*rs).to_int();
                    let s = if n > 0 { 1 } else if n < 0 { -1 } else { 0 };
                    self.set_reg(*rd, TriWord::from_int(s));
                    self.pc += 1;
                }
                Instr::Div(rd, r1, r2) => {
                    let d = self.get_reg(*r2).to_int();
                    if d == 0 { bail!("0으로 나눗셈"); }
                    let v = TriWord::from_int(self.get_reg(*r1).to_int() / d);
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }
                Instr::Mod(rd, r1, r2) => {
                    let d = self.get_reg(*r2).to_int();
                    if d == 0 { bail!("0으로 나머지 연산"); }
                    let v = TriWord::from_int(self.get_reg(*r1).to_int() % d);
                    self.set_reg(*rd, v);
                    self.pc += 1;
                }

                // ── 균형3진 논리 ──────────────────────────────────
                Instr::Tand(rd, r1, r2) => {
                    // T-AND = min trit-wise
                    let a = self.get_reg(*r1);
                    let b = self.get_reg(*r2);
                    let mut res = TriWord::ZERO;
                    for i in 0..9 { res.0[i] = if a.0[i].0 < b.0[i].0 { a.0[i] } else { b.0[i] }; }
                    self.set_reg(*rd, res);
                    self.pc += 1;
                }
                Instr::Tor(rd, r1, r2) => {
                    // T-OR = max trit-wise
                    let a = self.get_reg(*r1);
                    let b = self.get_reg(*r2);
                    let mut res = TriWord::ZERO;
                    for i in 0..9 { res.0[i] = if a.0[i].0 > b.0[i].0 { a.0[i] } else { b.0[i] }; }
                    self.set_reg(*rd, res);
                    self.pc += 1;
                }
                Instr::Tcons(rd, r1, r2) => {
                    // 합의: 같으면 그 값, 다르면 0
                    let a = self.get_reg(*r1);
                    let b = self.get_reg(*r2);
                    let mut res = TriWord::ZERO;
                    for i in 0..9 {
                        res.0[i] = if a.0[i] == b.0[i] { a.0[i] } else { super::Trit(0) };
                    }
                    self.set_reg(*rd, res);
                    self.pc += 1;
                }

                // ── 4상 연산 ──────────────────────────────────────
                Instr::Phase(rd, rs) => {
                    let v = self.get_reg(*rs).phase_value();
                    self.set_reg(*rd, TriWord::from_int(v as i64));
                    self.pc += 1;
                }
                Instr::Confirm(rd) => {
                    self.set_reg(*rd, TriWord::from_int(2));
                    self.pc += 1;
                }
                Instr::Uncertain(rd) => {
                    self.set_reg(*rd, TriWord::ZERO);
                    self.pc += 1;
                }
                Instr::Refute(rd) => {
                    self.set_reg(*rd, TriWord::from_int(-1));
                    self.pc += 1;
                }
                Instr::Unknown(rd) => {
                    self.set_reg(*rd, TriWord::from_int(-2));
                    self.pc += 1;
                }

                // ── 제어 흐름 ──────────────────────────────────────
                Instr::Jmp(label) => {
                    self.pc = *labels.get(label)
                        .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                }
                Instr::Jt(label, rs) => {
                    if self.get_reg(*rs).to_int() > 0 {
                        self.pc = *labels.get(label)
                            .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                    } else {
                        self.pc += 1;
                    }
                }
                Instr::Jz(label, rs) => {
                    if self.get_reg(*rs).to_int() == 0 {
                        self.pc = *labels.get(label)
                            .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                    } else {
                        self.pc += 1;
                    }
                }
                Instr::Jn(label, rs) => {
                    if self.get_reg(*rs).to_int() < 0 {
                        self.pc = *labels.get(label)
                            .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                    } else {
                        self.pc += 1;
                    }
                }
                Instr::Call(label) => {
                    // 반환 주소를 스택에 저장
                    let ret_addr = TriWord::from_int((self.pc + 1) as i64);
                    if self.sp < self.stack.len() {
                        self.stack[self.sp] = ret_addr;
                        self.sp += 1;
                    }
                    self.pc = *labels.get(label)
                        .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                }
                Instr::Ret => {
                    if self.sp > 0 {
                        self.sp -= 1;
                        let ret_pc = self.stack[self.sp].to_int() as usize;
                        self.pc = ret_pc;
                    } else {
                        // 최상위 스택 반환 = 프로그램 종료
                        break;
                    }
                }
                Instr::Loop(rd, label) => {
                    let v = self.get_reg(*rd).to_int() - 1;
                    self.set_reg(*rd, TriWord::from_int(v));
                    if v != 0 {
                        self.pc = *labels.get(label)
                            .ok_or_else(|| anyhow::anyhow!("레이블 없음: {label}"))?;
                    } else {
                        self.pc += 1;
                    }
                }
                Instr::Hlt => break,

                // ── I/O ──────────────────────────────────────────
                Instr::Out(rs) => {
                    let v = self.get_reg(*rs).to_int();
                    self.trace.push(format!("OUT: {v}"));
                    self.pc += 1;
                }
                Instr::Trap(n) => {
                    self.trace.push(format!("TRAP {n}"));
                    self.pc += 1;
                }

                // ── 기타 (건너뜀) ─────────────────────────────────
                Instr::Frame(_) | Instr::Arg(..) | Instr::Rval(..) |
                Instr::In(_) | Instr::Label(_) | Instr::Section(_) |
                Instr::Global(_) | Instr::Nop | Instr::Shift(..) |
                Instr::Tslice(..) | Instr::Tmask(..) => {
                    self.pc += 1;
                }
            }

            if self.trace.len() < 1000 {
                self.trace.push(trace_str);
            }
        }

        Ok(VmResult {
            t0: self.get_reg(Reg::T0),
            steps,
            output: self.trace.iter()
                .filter(|s| s.starts_with("OUT:"))
                .cloned().collect(),
        })
    }
}

fn reg_idx(r: Reg) -> Option<usize> {
    match r {
        Reg::T0 => Some(0), Reg::T1 => Some(1), Reg::T2 => Some(2),
        Reg::T3 => Some(3), Reg::T4 => Some(4), Reg::T5 => Some(5),
        Reg::T6 => Some(6), Reg::T7 => Some(7), Reg::T8 => Some(8),
        _ => None,
    }
}

/// VM 실행 결과
#[derive(Debug)]
pub struct VmResult {
    /// T0 최종값 (주로 반환값)
    pub t0: TriWord,
    /// 실행 스텝 수
    pub steps: usize,
    /// OUT 명령 출력 목록
    pub output: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::instr::Instr;

    #[test]
    fn test_load_and_read() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(42)),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 42);
    }

    #[test]
    fn test_add() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(7)),
            Instr::Load(Reg::T1, TriWord::from_int(5)),
            Instr::Add(Reg::T2, Reg::T0, Reg::T1),
            Instr::Mov(Reg::T0, Reg::T2),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 12);
    }

    #[test]
    fn test_sub() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(10)),
            Instr::Load(Reg::T1, TriWord::from_int(3)),
            Instr::Sub(Reg::T0, Reg::T0, Reg::T1),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 7);
    }

    #[test]
    fn test_neg() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(4)),
            Instr::Neg(Reg::T0, Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), -4);
    }

    #[test]
    fn test_confirm_sets_plus2() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Confirm(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 2);
        assert_eq!(res.t0.phase_value(), 2);
    }

    #[test]
    fn test_uncertain_sets_zero() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(5)),
            Instr::Uncertain(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 0);
    }

    #[test]
    fn test_refute_sets_minus1() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Refute(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), -1);
        assert_eq!(res.t0.phase_value(), -1);
    }

    #[test]
    fn test_unknown_sets_minus2() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Unknown(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), -2);
        assert_eq!(res.t0.phase_value(), -2);
    }

    #[test]
    fn test_jt_taken() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(1)),  // T0 > 0
            Instr::Jt("end".to_string(), Reg::T0),
            Instr::Load(Reg::T0, TriWord::from_int(99)), // 건너뜀
            Instr::Label("end".to_string()),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 1); // 99를 실행하지 않음
    }

    #[test]
    fn test_jn_taken() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(-1)), // T0 < 0
            Instr::Jn("end".to_string(), Reg::T0),
            Instr::Load(Reg::T0, TriWord::from_int(99)), // 건너뜀
            Instr::Label("end".to_string()),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), -1);
    }

    #[test]
    fn test_loop_instruction() {
        let mut vm = Vm::new();
        // T1을 카운터(3)로, T0을 합산기로 사용
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::ZERO),
            Instr::Load(Reg::T1, TriWord::from_int(3)),
            Instr::Load(Reg::T2, TriWord::from_int(1)),
            Instr::Label("lp".to_string()),
            Instr::Add(Reg::T0, Reg::T0, Reg::T2),
            Instr::Loop(Reg::T1, "lp".to_string()),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 3); // 3번 루프 → T0 = 3
    }

    #[test]
    fn test_mul() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(4)),
            Instr::Load(Reg::T1, TriWord::from_int(3)),
            Instr::Mul(Reg::T0, Reg::T0, Reg::T1),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 12);
    }

    #[test]
    fn test_push_pop() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(77)),
            Instr::Push(Reg::T0),
            Instr::Load(Reg::T0, TriWord::ZERO),
            Instr::Pop(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 77);
    }

    #[test]
    fn test_out_captured() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(42)),
            Instr::Out(Reg::T0),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.output.len(), 1);
        assert!(res.output[0].contains("42"));
    }

    #[test]
    fn test_tand_min() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(1)),
            Instr::Load(Reg::T1, TriWord::from_int(-1)),
            Instr::Tand(Reg::T2, Reg::T0, Reg::T1),
            Instr::Mov(Reg::T0, Reg::T2),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), -1); // min(1, -1) = -1
    }

    #[test]
    fn test_tor_max() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Load(Reg::T0, TriWord::from_int(1)),
            Instr::Load(Reg::T1, TriWord::from_int(-1)),
            Instr::Tor(Reg::T2, Reg::T0, Reg::T1),
            Instr::Mov(Reg::T0, Reg::T2),
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.t0.to_int(), 1); // max(1, -1) = 1
    }

    #[test]
    fn test_steps_counted() {
        let mut vm = Vm::new();
        let prog = vec![
            Instr::Nop,
            Instr::Nop,
            Instr::Hlt,
        ];
        let res = vm.execute(&prog).unwrap();
        assert_eq!(res.steps, 3);
    }
}
