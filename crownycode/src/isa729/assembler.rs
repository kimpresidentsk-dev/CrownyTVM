// crownycode/src/isa729/assembler.rs
// ISA729 텍스트 어셈블러 — Instr 스트림 → 크라우니어셈블리 텍스트

use super::instr::Instr;

pub struct Assembler {
    lines: Vec<String>,
    indent: usize,
}

impl Default for Assembler {
    fn default() -> Self {
        Self::new()
    }
}

impl Assembler {
    pub fn new() -> Self {
        Self { lines: Vec::new(), indent: 0 }
    }

    pub fn emit(&mut self, instr: &Instr) {
        let line = self.format_instr(instr);
        self.lines.push(line);
    }

    pub fn emit_all(&mut self, instrs: &[Instr]) {
        for i in instrs { self.emit(i); }
    }

    pub fn emit_comment(&mut self, comment: &str) {
        self.lines.push(format!("{}; {comment}", "    ".repeat(self.indent)));
    }

    pub fn emit_blank(&mut self) {
        self.lines.push(String::new());
    }

    pub fn finish(self) -> String {
        self.lines.join("\n")
    }

    fn format_instr(&self, instr: &Instr) -> String {
        let pad = "    ".repeat(self.indent);
        match instr {
            // 데이터 이동
            Instr::Load(rd, imm) =>
                format!("{pad}LOAD {}, {}", rd.name(), imm.to_int()),
            Instr::Mov(rd, rs) =>
                format!("{pad}MOV {}, {}", rd.name(), rs.name()),
            Instr::Store(rs, addr) =>
                format!("{pad}STORE {}, [{}]", rs.name(), addr.name()),
            Instr::Fetch(rd, addr) =>
                format!("{pad}FETCH {}, [{}]", rd.name(), addr.name()),
            Instr::Push(rs) =>
                format!("{pad}PUSH {}", rs.name()),
            Instr::Pop(rd) =>
                format!("{pad}POP {}", rd.name()),

            // 산술
            Instr::Add(rd, r1, r2) =>
                format!("{pad}ADD {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Sub(rd, r1, r2) =>
                format!("{pad}SUB {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Mul(rd, r1, r2) =>
                format!("{pad}MUL {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Div(rd, r1, r2) =>
                format!("{pad}DIV {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Mod(rd, r1, r2) =>
                format!("{pad}MOD {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Neg(rd, rs) =>
                format!("{pad}NEG {}, {}", rd.name(), rs.name()),
            Instr::Abs(rd, rs) =>
                format!("{pad}ABS {}, {}", rd.name(), rs.name()),
            Instr::Sgns(rd, rs) =>
                format!("{pad}SGNS {}, {}", rd.name(), rs.name()),

            // 균형3진 논리
            Instr::Tand(rd, r1, r2) =>
                format!("{pad}TAND {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Tor(rd, r1, r2) =>
                format!("{pad}TOR {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Tcons(rd, r1, r2) =>
                format!("{pad}TCONS {}, {}, {}", rd.name(), r1.name(), r2.name()),
            Instr::Shift(rd, rs, n) =>
                format!("{pad}SHIFT {}, {}, {n}", rd.name(), rs.name()),
            Instr::Tslice(rd, rs, lo, hi) =>
                format!("{pad}TSLICE {}, {}, {lo}, {hi}", rd.name(), rs.name()),
            Instr::Tmask(rd, rs, mask) =>
                format!("{pad}TMASK {}, {}, {}", rd.name(), rs.name(), mask.to_int()),

            // 4상 연산
            Instr::Phase(rd, rs) =>
                format!("{pad}PHASE {}, {}", rd.name(), rs.name()),
            Instr::Confirm(rd) =>
                format!("{pad}CONFIRM {}", rd.name()),
            Instr::Uncertain(rd) =>
                format!("{pad}UNCERTAIN {}", rd.name()),
            Instr::Refute(rd) =>
                format!("{pad}REFUTE {}", rd.name()),
            Instr::Unknown(rd) =>
                format!("{pad}UNKNOWN {}", rd.name()),

            // 제어 흐름
            Instr::Jmp(label) =>
                format!("{pad}JMP {label}"),
            Instr::Jt(label, rs) =>
                format!("{pad}JT {label}, {}", rs.name()),
            Instr::Jz(label, rs) =>
                format!("{pad}JZ {label}, {}", rs.name()),
            Instr::Jn(label, rs) =>
                format!("{pad}JN {label}, {}", rs.name()),
            Instr::Call(label) =>
                format!("{pad}CALL {label}"),
            Instr::Ret =>
                format!("{pad}RET"),
            Instr::Loop(rd, label) =>
                format!("{pad}LOOP {}, {label}", rd.name()),
            Instr::Hlt =>
                format!("{pad}HLT"),

            // 스택
            Instr::Frame(n) =>
                format!("{pad}FRAME {n}"),
            Instr::Arg(rd, n) =>
                format!("{pad}ARG {}, {n}", rd.name()),
            Instr::Rval(rd) =>
                format!("{pad}RVAL {}", rd.name()),

            // I/O
            Instr::Out(rs) =>
                format!("{pad}OUT {}", rs.name()),
            Instr::In(rd) =>
                format!("{pad}IN {}", rd.name()),
            Instr::Trap(n) =>
                format!("{pad}TRAP {n}"),

            // 메타
            Instr::Label(name) =>
                format!("{name}:"),
            Instr::Section(name) =>
                format!("SECTION .{name}"),
            Instr::Global(name) =>
                format!("GLOBAL {name}"),
            Instr::Nop =>
                format!("{pad}NOP"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::isa729::{Reg, TriWord};

    #[test]
    fn test_load_instr() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Load(Reg::T0, TriWord::from_int(42)));
        assert_eq!(asm.finish(), "LOAD T0, 42");
    }

    #[test]
    fn test_add_instr() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Add(Reg::T2, Reg::T0, Reg::T1));
        assert_eq!(asm.finish(), "ADD T2, T0, T1");
    }

    #[test]
    fn test_phase_instr() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Phase(Reg::T0, Reg::T1));
        assert_eq!(asm.finish(), "PHASE T0, T1");
    }

    #[test]
    fn test_confirm_instr() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Confirm(Reg::T0));
        assert_eq!(asm.finish(), "CONFIRM T0");
    }

    #[test]
    fn test_label_no_indent() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Label("main".to_string()));
        assert_eq!(asm.finish(), "main:");
    }

    #[test]
    fn test_section_directive() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Section("text".to_string()));
        assert_eq!(asm.finish(), "SECTION .text");
    }

    #[test]
    fn test_branch_instrs() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Jmp("loop_start".to_string()));
        asm.emit(&Instr::Jt("pos_branch".to_string(), Reg::T0));
        asm.emit(&Instr::Jz("zero_branch".to_string(), Reg::T1));
        asm.emit(&Instr::Jn("neg_branch".to_string(), Reg::T2));
        let out = asm.finish();
        assert!(out.contains("JMP loop_start"));
        assert!(out.contains("JT pos_branch, T0"));
        assert!(out.contains("JZ zero_branch, T1"));
        assert!(out.contains("JN neg_branch, T2"));
    }

    #[test]
    fn test_full_function_sequence() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Section("text".to_string()));
        asm.emit(&Instr::Global("add_fn".to_string()));
        asm.emit(&Instr::Label("add_fn".to_string()));
        asm.emit(&Instr::Frame(2));
        asm.emit(&Instr::Arg(Reg::T0, 0));
        asm.emit(&Instr::Arg(Reg::T1, 1));
        asm.emit(&Instr::Add(Reg::T2, Reg::T0, Reg::T1));
        asm.emit(&Instr::Rval(Reg::T2));
        asm.emit(&Instr::Ret);
        let out = asm.finish();
        assert!(out.contains("add_fn:"));
        assert!(out.contains("FRAME 2"));
        assert!(out.contains("ADD T2, T0, T1"));
        assert!(out.contains("RVAL T2"));
        assert!(out.contains("RET"));
    }

    #[test]
    fn test_4phase_sequence() {
        let mut asm = Assembler::new();
        asm.emit(&Instr::Confirm(Reg::T0));
        asm.emit(&Instr::Uncertain(Reg::T1));
        asm.emit(&Instr::Refute(Reg::T2));
        asm.emit(&Instr::Unknown(Reg::T3));
        let out = asm.finish();
        assert!(out.contains("CONFIRM T0"));
        assert!(out.contains("UNCERTAIN T1"));
        assert!(out.contains("REFUTE T2"));
        assert!(out.contains("UNKNOWN T3"));
    }
}
