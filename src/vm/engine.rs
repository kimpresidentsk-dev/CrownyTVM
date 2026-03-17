// ═══════════════════════════════════════════════════════════════
// TritVM 실행 엔진 — ISA729 바이트코드 인터프리터
// 4세대 온톨로직 Claim 연산 포함
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::fmt;
use super::trit::*;
use super::opcode::op;

#[derive(Debug, Clone)]
struct CallFrame { return_pc: usize, base_slot: usize, stack_base: usize }

#[derive(Debug, Clone)]
struct ExcHandler { catch_pc: usize, stack_depth: usize, frame_depth: usize }

pub struct TritVM {
    code: Vec<Instruction>,
    constants: Vec<ConstValue>,
    pc: usize,
    halted: bool,
    stack: Vec<Value>,
    slots: Vec<Value>,
    frames: Vec<CallFrame>,
    exc_handlers: Vec<ExcHandler>,
    pub cycles: u64,
    pub output: Vec<String>,
    pub trace: bool,
    pub max_cycles: u64,
    pub direct_output: bool,
}

#[derive(Debug)]
pub enum VmError {
    StackUnderflow, InvalidConst(u16), DivisionByZero,
    TypeError(String), NotCallable(String), UncaughtException(String),
    CycleLimit(u64), Runtime(String),
}
impl fmt::Display for VmError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            VmError::StackUnderflow=>write!(f,"스택 언더플로"),
            VmError::InvalidConst(i)=>write!(f,"잘못된 상수:{}",i),
            VmError::DivisionByZero=>write!(f,"0나누기"),
            VmError::TypeError(m)=>write!(f,"타입에러:{}",m),
            VmError::NotCallable(v)=>write!(f,"호출불가:{}",v),
            VmError::UncaughtException(m)=>write!(f,"예외:{}",m),
            VmError::CycleLimit(c)=>write!(f,"사이클한도:{}",c),
            VmError::Runtime(m)=>write!(f,"런타임:{}",m),
        }
    }
}

impl TritVM {
    pub fn new(code: Vec<Instruction>, constants: Vec<ConstValue>) -> Self {
        TritVM {
            code, constants, pc: 0, halted: false,
            stack: Vec::with_capacity(1024),
            slots: vec![Value::None; 256],
            frames: Vec::new(), exc_handlers: Vec::new(),
            cycles: 0, output: Vec::new(), trace: false, max_cycles: 1_000_000, direct_output: false,
        }
    }

    pub fn run(&mut self) -> Result<Value, VmError> {
        while !self.halted && self.pc < self.code.len() {
            if self.cycles >= self.max_cycles { return Err(VmError::CycleLimit(self.cycles)); }
            self.step()?;
        }
        Ok(self.stack.last().cloned().unwrap_or(Value::None))
    }

    fn pop(&mut self) -> Result<Value, VmError> { self.stack.pop().ok_or(VmError::StackUnderflow) }
    fn peek(&self) -> Result<&Value, VmError> { self.stack.last().ok_or(VmError::StackUnderflow) }

    fn slot_set(&mut self, idx: usize, val: Value) {
        let a = self.frames.last().map(|f| f.base_slot + idx).unwrap_or(idx);
        if a >= self.slots.len() { self.slots.resize(a + 1, Value::None); }
        self.slots[a] = val;
    }
    fn slot_get(&self, idx: usize) -> Value {
        let a = self.frames.last().map(|f| f.base_slot + idx).unwrap_or(idx);
        self.slots.get(a).cloned().unwrap_or(Value::None)
    }

    fn load_const(&self, idx: u16) -> Result<Value, VmError> {
        match self.constants.get(idx as usize) {
            Some(cv) => Ok(match cv {
                ConstValue::None => Value::None,
                ConstValue::Int(v) => Value::Int(*v),
                ConstValue::Float(v) => Value::Float(*v),
                ConstValue::Str(s) => Value::Str(s.clone()),
                ConstValue::Trit(t) => Value::Trit(*t),
                ConstValue::FuncRef(o) => Value::FuncRef(*o),
            }),
            None => Err(VmError::InvalidConst(idx)),
        }
    }

    pub fn step(&mut self) -> Result<(), VmError> {
        let instr = self.code[self.pc].clone();
        let opc = instr.op_index();
        let a = instr.a_val();
        let b = instr.b_val();
        self.cycles += op::cycle_cost(opc);
        self.pc += 1;

        match opc {
            // ═══ 스택 ═══
            op::PUSH => { self.stack.push(self.load_const(a as u16)?); }
            op::POP => { self.pop()?; }
            op::DUP => { let v = self.peek()?.clone(); self.stack.push(v); }
            op::SWAP => {
                let l = self.stack.len();
                if l < 2 { return Err(VmError::StackUnderflow); }
                self.stack.swap(l-1, l-2);
            }
            op::CLEAR => { self.stack.clear(); }

            // ═══ 변수 ═══
            op::STORE => { let v = self.pop()?; self.slot_set(a as usize, v); }
            op::LOAD => { let v = self.slot_get(a as usize); self.stack.push(v); }

            // ═══ 산술 ═══
            op::ADD => { let b = self.pop()?; let a = self.pop()?; self.stack.push(self.arith_add(&a, &b)); }
            op::SUB => { let b = self.pop()?; let a = self.pop()?; self.stack.push(self.arith_sub(&a, &b)); }
            op::MUL => { let b = self.pop()?; let a = self.pop()?; self.stack.push(self.arith_mul(&a, &b)); }
            op::DIV => { let b = self.pop()?; let a = self.pop()?; self.stack.push(self.arith_div(&a, &b)?); }
            op::MOD => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Int(a.to_int() % b.to_int())); }
            op::NEG => { let v = self.pop()?; self.stack.push(Value::Int(-v.to_int())); }
            op::POW => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Float(a.to_float().powf(b.to_float()))); }
            op::MIN => { let b = self.pop()?; let a = self.pop()?; self.stack.push(if a.to_float() < b.to_float() { a } else { b }); }
            op::MAX => { let b = self.pop()?; let a = self.pop()?; self.stack.push(if a.to_float() > b.to_float() { a } else { b }); }

            // ═══ 비교/논리 ═══
            op::EQ => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Trit(if a == b { Trit::Ti } else { Trit::Ta })); }
            op::NEQ => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Trit(if a != b { Trit::Ti } else { Trit::Ta })); }
            op::GT => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Trit(self.cmp_gt(&a, &b))); }
            op::LT => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Trit(self.cmp_lt(&a, &b))); }
            op::NOT => { let v = self.pop()?; self.stack.push(Value::Trit(v.is_truthy().not())); }
            op::AND => { let b = self.pop()?; let a = self.pop()?; self.stack.push(Value::Trit(a.is_truthy().and(b.is_truthy()))); }
            op::CMP => {
                let b = self.pop()?; let a = self.pop()?;
                let r = if a == b { Trit::Om } else if a.to_float() > b.to_float() { Trit::Ti } else { Trit::Ta };
                self.stack.push(Value::Trit(r));
            }
            op::TRUE => { self.stack.push(Value::Trit(Trit::Ti)); }
            op::FALSE => { self.stack.push(Value::Trit(Trit::Ta)); }
            op::UNKNOWN => { self.stack.push(Value::Trit(Trit::Om)); }

            // ═══ 흐름 ═══
            op::JMP => { self.pc = a as usize; }
            op::JMPIF => {
                let v = self.pop()?;
                if v.is_truthy() == Trit::Ti { self.pc = a as usize; }
            }
            op::HALT => { self.halted = true; }
            op::NOP => {}

            // ═══ 함수 ═══
            op::FUNC => { /* 함수 진입점 마커 */ }
            op::CALL => {
                let nargs = a as usize;
                let func_val = self.pop()?;
                match func_val {
                    Value::FuncRef(target) => {
                        let base = self.slots.len();
                        let frame = CallFrame {
                            return_pc: self.pc,
                            base_slot: base,
                            stack_base: self.stack.len() - nargs,
                        };
                        // 인자를 슬롯으로 이동
                        for i in 0..nargs {
                            let idx = self.stack.len() - nargs + i;
                            let val = self.stack[idx].clone();
                            if base + i >= self.slots.len() { self.slots.resize(base + i + 1, Value::None); }
                            self.slots[base + i] = val;
                        }
                        for _ in 0..nargs { self.stack.pop(); }
                        self.frames.push(frame);
                        self.pc = target as usize;
                    }
                    _ => return Err(VmError::NotCallable(func_val.to_string_val())),
                }
            }
            op::RET => {
                let retval = self.pop().unwrap_or(Value::None);
                if let Some(frame) = self.frames.pop() {
                    self.pc = frame.return_pc;
                    self.slots.truncate(frame.base_slot);
                    self.stack.truncate(frame.stack_base);
                }
                self.stack.push(retval);
            }

            // ═══ 출력 ═══
            op::PRINT => {
                let v = self.pop()?;
                let s = v.to_string_val();
                if self.direct_output {
                    println!("{}", s);
                } else {
                    self.output.push(s);
                }
            }

            // ═══ 배열 ═══
            op::ARRAY => {
                let n = a as usize;
                let start = if self.stack.len() >= n { self.stack.len() - n } else { 0 };
                let arr: Vec<Value> = self.stack.drain(start..).collect();
                self.stack.push(Value::Array(arr));
            }
            op::LEN => {
                let v = self.pop()?;
                let l = match &v { Value::Array(a) => a.len(), Value::Str(s) => s.chars().count(), Value::Map(m) => m.len(), _ => 0 };
                self.stack.push(Value::Int(l as i64));
            }
            op::INDEX => {
                let idx = self.pop()?;
                let arr = self.pop()?;
                match (&arr, &idx) {
                    (Value::Array(a), Value::Int(i)) => {
                        self.stack.push(a.get(*i as usize).cloned().unwrap_or(Value::None));
                    }
                    (Value::Map(m), Value::Str(k)) => {
                        self.stack.push(m.get(k).cloned().unwrap_or(Value::None));
                    }
                    _ => self.stack.push(Value::None),
                }
            }
            op::APPEND => {
                let v = self.pop()?;
                let arr = self.pop()?;
                if let Value::Array(mut a) = arr { a.push(v); self.stack.push(Value::Array(a)); }
                else { self.stack.push(arr); }
            }
            // 배열 인덱스 대입: [스택: 배열, 인덱스, 값] → 수정된 배열
            op::SETIDX => {
                let val = self.pop()?;
                let idx = self.pop()?;
                let arr = self.pop()?;
                if let Value::Array(mut a) = arr {
                    let i = idx.to_int() as usize;
                    if i < a.len() { a[i] = val; }
                    self.stack.push(Value::Array(a));
                } else if let Value::Map(mut m) = arr {
                    m.insert(idx.to_string_val(), val);
                    self.stack.push(Value::Map(m));
                } else { self.stack.push(arr); }
            }
            op::SORT => {
                let v = self.pop()?;
                if let Value::Array(mut a) = v {
                    a.sort_by(|x,y| x.to_float().partial_cmp(&y.to_float()).unwrap_or(std::cmp::Ordering::Equal));
                    self.stack.push(Value::Array(a));
                } else { self.stack.push(v); }
            }
            op::REVERSE => {
                let v = self.pop()?;
                if let Value::Array(mut a) = v { a.reverse(); self.stack.push(Value::Array(a)); }
                else { self.stack.push(v); }
            }
            op::ZIP => {
                let b = self.pop()?; let a = self.pop()?;
                if let (Value::Array(av), Value::Array(bv)) = (a, b) {
                    let zipped: Vec<Value> = av.into_iter().zip(bv).map(|(x,y)| Value::Array(vec![x,y])).collect();
                    self.stack.push(Value::Array(zipped));
                } else { self.stack.push(Value::None); }
            }

            // ═══ 해시맵 ═══
            op::HASH_NEW => { self.stack.push(Value::Map(HashMap::new())); }
            op::HASH_SET => {
                let val = self.pop()?; let key = self.pop()?; let map = self.pop()?;
                if let Value::Map(mut m) = map { m.insert(key.to_string_val(), val); self.stack.push(Value::Map(m)); }
                else { self.stack.push(map); }
            }
            op::HASH_GET => {
                let key = self.pop()?; let map = self.pop()?;
                if let Value::Map(m) = &map { self.stack.push(m.get(&key.to_string_val()).cloned().unwrap_or(Value::None)); }
                else { self.stack.push(Value::None); }
            }

            // ═══ 타입 변환 ═══
            op::TOINT => { let v = self.pop()?; self.stack.push(Value::Int(v.to_int())); }
            op::TOFLT => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float())); }
            op::TOSTR => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val())); }
            op::TOTRIT => { let v = self.pop()?; self.stack.push(Value::Trit(v.is_truthy())); }
            op::TYPE => { let v = self.pop()?; self.stack.push(Value::Str(v.type_name().to_string())); }

            // ═══ 에러 ═══
            op::TRY => {
                self.exc_handlers.push(ExcHandler {
                    catch_pc: a as usize, stack_depth: self.stack.len(), frame_depth: self.frames.len(),
                });
            }
            op::CATCH => { /* 마커 */ }
            op::THROW => {
                let err = self.pop()?;
                if let Some(h) = self.exc_handlers.pop() {
                    self.stack.truncate(h.stack_depth);
                    self.frames.truncate(h.frame_depth);
                    self.stack.push(err);
                    self.pc = h.catch_pc;
                } else { return Err(VmError::UncaughtException(err.to_string_val())); }
            }

            // ═══════════════════════════════════════════════
            // 4세대 온톨로직 Claim 연산
            // ═══════════════════════════════════════════════

            op::CLAIM_NEW => {
                let estate_i = self.pop()?.to_int();
                let obj = self.pop()?;
                let pred = self.pop()?.to_string_val();
                let subj = self.pop()?.to_string_val();
                let ep = match estate_i { 0=>Epistemic::Ti, 1=>Epistemic::Om, 2=>Epistemic::Ta, _=>Epistemic::Eum };
                self.stack.push(Value::Claim(Box::new(Claim {
                    subject: subj, predicate: pred, object: obj,
                    epistemic: ep, confidence: ep.reliability(), evidence: vec![],
                })));
            }
            op::CLAIM_STATE => {
                let v = self.pop()?;
                if let Value::Claim(c) = v {
                    self.stack.push(Value::Str(c.epistemic.kr().to_string()));
                } else { self.stack.push(Value::None); }
            }
            op::CLAIM_SET => {
                let state_i = self.pop()?.to_int();
                let v = self.pop()?;
                if let Value::Claim(mut c) = v {
                    c.epistemic = match state_i { 0=>Epistemic::Ti, 1=>Epistemic::Om, 2=>Epistemic::Ta, _=>Epistemic::Eum };
                    c.confidence = c.epistemic.reliability();
                    self.stack.push(Value::Claim(c));
                } else { self.stack.push(Value::None); }
            }
            op::CLAIM_CONF => {
                let v = self.pop()?;
                if let Value::Claim(c) = v { self.stack.push(Value::Float(c.confidence)); }
                else { self.stack.push(Value::Float(0.0)); }
            }
            op::CLAIM_EVID => {
                let evid = self.pop()?.to_string_val();
                let v = self.pop()?;
                if let Value::Claim(mut c) = v { c.evidence.push(evid); self.stack.push(Value::Claim(c)); }
                else { self.stack.push(Value::None); }
            }
            op::CLAIM_DECIDE => {
                let goal_fit = self.pop()?.to_float();
                let v = self.pop()?;
                if let Value::Claim(c) = v {
                    let evid_quality = if c.evidence.is_empty() { 0.3 } else { (c.evidence.len() as f64).min(5.0) / 5.0 };
                    let score = goal_fit * evid_quality * c.epistemic.reliability();
                    self.stack.push(Value::Float(score));
                } else { self.stack.push(Value::Float(0.0)); }
            }
            op::CLAIM_TRANS => {
                let dir = self.pop()?.to_int();
                let v = self.pop()?;
                if let Value::Claim(mut c) = v {
                    c.epistemic = if dir > 0 { c.epistemic.forward() } else { c.epistemic.backward() };
                    c.confidence = c.epistemic.reliability();
                    self.stack.push(Value::Claim(c));
                } else { self.stack.push(Value::None); }
            }

            // ═══ 3분기: IF3 [a=ti_pc, b=ta_pc] (om은 다음줄) ═══
            op::IF3 => {
                let v = self.pop()?;
                match v.is_truthy() {
                    Trit::Ti => { self.pc = a as usize; }
                    Trit::Ta => { self.pc = b as usize; }
                    Trit::Om => { /* fall through to next instruction */ }
                }
            }

            // ═══════════════════════════════════════════════
            // BUILTIN — VM 내장함수 (수학/시간/타입/변환)
            // ═══════════════════════════════════════════════

            op::BUILTIN => {
                let id = a;
                match id {
                    // ─── 수학 (0~19) ───
                    0 => { let v = self.pop()?; self.stack.push(Value::Int(v.to_float().round() as i64)); }
                    1 => { let v = self.pop()?; self.stack.push(Value::Int(v.to_float().floor() as i64)); }
                    2 => { let v = self.pop()?; self.stack.push(Value::Int(v.to_float().ceil() as i64)); }
                    3 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().sin())); }
                    4 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().cos())); }
                    5 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().tan())); }
                    6 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().sqrt())); }
                    7 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().abs())); }
                    8 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().ln())); }
                    9 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float().log10())); }
                    10 => {
                        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
                        self.stack.push(Value::Int(t as i64));
                    }
                    11 => {
                        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
                        self.stack.push(Value::Int(t as i64));
                    }
                    15 => { let v = self.pop()?; self.stack.push(Value::Str(v.type_name().to_string())); }
                    16 => { let v = self.pop()?; self.stack.push(Value::Trit(if matches!(v, Value::Int(_)) { Trit::Ti } else { Trit::Ta })); }
                    17 => { let v = self.pop()?; self.stack.push(Value::Trit(if matches!(v, Value::Float(_)) { Trit::Ti } else { Trit::Ta })); }
                    18 => { let v = self.pop()?; self.stack.push(Value::Trit(if matches!(v, Value::Str(_)) { Trit::Ti } else { Trit::Ta })); }
                    19 => { let v = self.pop()?; self.stack.push(Value::Trit(if matches!(v, Value::Array(_)) { Trit::Ti } else { Trit::Ta })); }
                    20 => {
                        let s = self.pop()?.to_string_val();
                        let v = self.parse_json_simple(&s);
                        self.stack.push(v);
                    }
                    21 => {
                        let v = self.pop()?;
                        self.stack.push(Value::Str(self.to_json(&v)));
                    }
                    30 => {
                        let v = self.pop()?;
                        let len = match &v {
                            Value::Str(s) => s.chars().count(),
                            Value::Array(a) => a.len(),
                            Value::Map(m) => m.len(),
                            _ => 0,
                        };
                        self.stack.push(Value::Int(len as i64));
                    }
                    31 => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val().to_uppercase())); }
                    32 => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val().to_lowercase())); }
                    33 => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val().trim().to_string())); }
                    34 => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val().chars().rev().collect())); }
                    35 => {
                        let sep = self.pop()?.to_string_val();
                        let s = self.pop()?.to_string_val();
                        let parts: Vec<Value> = s.split(&sep).map(|p| Value::Str(p.to_string())).collect();
                        self.stack.push(Value::Array(parts));
                    }
                    36 => {
                        let sep = self.pop()?.to_string_val();
                        let arr = self.pop()?;
                        if let Value::Array(a) = arr {
                            self.stack.push(Value::Str(a.iter().map(|v| v.to_string_val()).collect::<Vec<_>>().join(&sep)));
                        } else { self.stack.push(Value::Str(arr.to_string_val())); }
                    }
                    37 => {
                        let needle = self.pop()?.to_string_val();
                        let haystack = self.pop()?.to_string_val();
                        self.stack.push(Value::Trit(if haystack.contains(&needle) { Trit::Ti } else { Trit::Ta }));
                    }
                    38 => {
                        let prefix = self.pop()?.to_string_val();
                        let s = self.pop()?.to_string_val();
                        self.stack.push(Value::Trit(if s.starts_with(&prefix) { Trit::Ti } else { Trit::Ta }));
                    }
                    39 => {
                        let replacement = self.pop()?.to_string_val();
                        let pattern = self.pop()?.to_string_val();
                        let s = self.pop()?.to_string_val();
                        self.stack.push(Value::Str(s.replace(&pattern, &replacement)));
                    }
                    40 => {
                        let v = self.pop()?;
                        if let Value::Array(mut a) = v {
                            a.sort_by(|x, y| x.to_float().partial_cmp(&y.to_float()).unwrap_or(std::cmp::Ordering::Equal));
                            self.stack.push(Value::Array(a));
                        } else { self.stack.push(v); }
                    }
                    41 => {
                        let v = self.pop()?;
                        if let Value::Array(mut a) = v { a.reverse(); self.stack.push(Value::Array(a)); }
                        else { self.stack.push(v); }
                    }
                    42 => {
                        let v = self.pop()?;
                        if let Value::Array(a) = v {
                            let mut seen = Vec::new();
                            for item in a { if !seen.iter().any(|s: &Value| s == &item) { seen.push(item); } }
                            self.stack.push(Value::Array(seen));
                        } else { self.stack.push(v); }
                    }
                    43 => {
                        let v = self.pop()?;
                        if let Value::Array(a) = v {
                            let mut flat = Vec::new();
                            for item in a {
                                if let Value::Array(inner) = item { flat.extend(inner); }
                                else { flat.push(item); }
                            }
                            self.stack.push(Value::Array(flat));
                        } else { self.stack.push(v); }
                    }
                    44 => {
                        let v = self.pop()?;
                        if let Value::Array(a) = v {
                            let sum: f64 = a.iter().map(|v| v.to_float()).sum();
                            self.stack.push(Value::Float(sum));
                        } else { self.stack.push(Value::Float(0.0)); }
                    }
                    50 => { let v = self.pop()?; self.stack.push(Value::Int(v.to_int())); }
                    51 => { let v = self.pop()?; self.stack.push(Value::Float(v.to_float())); }
                    52 => { let v = self.pop()?; self.stack.push(Value::Str(v.to_string_val())); }
                    53 => { let v = self.pop()?; self.stack.push(Value::Trit(v.is_truthy())); }
                    60 => {
                        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().subsec_nanos();
                        let r = (t as f64 % 10000.0) / 10000.0;
                        self.stack.push(Value::Float(r));
                    }
                    // ─── 비트 연산 (70~76) ───
                    70 => { let b = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(a & b)); }
                    71 => { let b = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(a | b)); }
                    72 => { let b = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(a ^ b)); }
                    73 => { let a = self.pop()?.to_int(); self.stack.push(Value::Int(!a)); }
                    74 => { let n = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(a << (n & 63))); }
                    75 => { let n = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(((a as u64) >> (n as u64 & 63)) as i64)); }
                    76 => { let n = self.pop()?.to_int(); let a = self.pop()?.to_int(); self.stack.push(Value::Int(((a as u64) >> ((n * 8) as u64 & 63) & 0xFF) as i64)); }
                    _ => { self.stack.push(Value::None); }
                }
            }

            // ═══════════════════════════════════════════════
            // SYSCALL — 호스트 OS 브리지
            // ═══════════════════════════════════════════════

            op::SYSCALL => {
                let nargs = a as usize;
                let name = self.pop()?.to_string_val();
                let mut args = Vec::new();
                for _ in 0..nargs { args.push(self.pop()?); }
                args.reverse();

                let result = match name.as_str() {
                    "파일쓰기" | "file_write" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        let data = args.get(1).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::fs::write(&path, &data) {
                            Ok(_) => Value::Trit(Trit::Ti),
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "파일읽기" | "file_read" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::fs::read_to_string(&path) {
                            Ok(s) => Value::Str(s),
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "파일추가" | "file_append" => {
                        use std::io::Write;
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        let data = args.get(1).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::fs::OpenOptions::new().append(true).create(true).open(&path) {
                            Ok(mut f) => match f.write_all(data.as_bytes()) {
                                Ok(_) => Value::Trit(Trit::Ti),
                                Err(e) => Value::Error(e.to_string()),
                            },
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "파일존재" | "file_exists" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        Value::Trit(if std::path::Path::new(&path).exists() { Trit::Ti } else { Trit::Ta })
                    }
                    "파일삭제" | "file_delete" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::fs::remove_file(&path) {
                            Ok(_) => Value::Trit(Trit::Ti),
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "현재시간" | "time_now" => {
                        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
                        Value::Int(t as i64)
                    }
                    "현재밀리초" | "time_ms" => {
                        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
                        Value::Int(t as i64)
                    }
                    "환경변수" | "env_get" => {
                        let key = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::env::var(&key) {
                            Ok(v) => Value::Str(v),
                            Err(_) => Value::None,
                        }
                    }
                    "출력원시" | "print_raw" => {
                        let s = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        self.output.push(s);
                        Value::Trit(Trit::Ti)
                    }
                    "바이너리쓰기" | "binary_write" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        let bytes: Vec<u8> = match args.get(1) {
                            Some(Value::Array(a)) => a.iter().map(|v| v.to_int() as u8).collect(),
                            _ => vec![],
                        };
                        match std::fs::write(&path, &bytes) {
                            Ok(_) => Value::Trit(Trit::Ti),
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "실행권한" | "chmod_exec" => {
                        let path = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        #[cfg(unix)] {
                            use std::os::unix::fs::PermissionsExt;
                            match std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)) {
                                Ok(_) => Value::Trit(Trit::Ti),
                                Err(e) => Value::Error(e.to_string()),
                            }
                        }
                        #[cfg(not(unix))] {
                            Value::Trit(Trit::Ti)
                        }
                    }
                    "명령실행" | "exec_cmd" => {
                        let cmd = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        match std::process::Command::new("sh").arg("-c").arg(&cmd).output() {
                            Ok(out) => {
                                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                                if !stdout.is_empty() {
                                    Value::Str(stdout)
                                } else if !stderr.is_empty() {
                                    Value::Str(stderr)
                                } else {
                                    Value::Str(format!("{}", out.status.code().unwrap_or(-1)))
                                }
                            }
                            Err(e) => Value::Error(e.to_string()),
                        }
                    }
                    "줄읽기" | "readline" => {
                        let prompt = args.get(0).map(|v| v.to_string_val()).unwrap_or_default();
                        use std::io::Write;
                        print!("{}", prompt);
                        let _ = std::io::stdout().flush();
                        let mut line = String::new();
                        match std::io::stdin().read_line(&mut line) {
                            Ok(0) => Value::Str("__EOF__".to_string()),
                            Ok(_) => Value::Str(line.trim_end_matches('\n').trim_end_matches('\r').to_string()),
                            Err(_) => Value::Str("__EOF__".to_string()),
                        }
                    }
                    _ => Value::Error(format!("알 수 없는 시스템 호출: {}", name)),
                };
                self.stack.push(result);
            }

            _ => { /* 미구현 옵코드 무시 */ }
        }
        Ok(())
    }

    // ═══ 산술 헬퍼 ═══
    fn arith_add(&self, a: &Value, b: &Value) -> Value {
        match (a, b) {
            (Value::Int(x), Value::Int(y)) => Value::Int(x.wrapping_add(*y)),
            (Value::Float(x), Value::Float(y)) => Value::Float(x+y),
            (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64+y),
            (Value::Float(x), Value::Int(y)) => Value::Float(x+*y as f64),
            (Value::Array(x), Value::Array(y)) => {
                let mut r = x.clone(); r.extend(y.clone()); Value::Array(r)
            }
            (Value::Str(x), Value::Str(y)) => Value::Str(format!("{}{}", x, y)),
            (Value::Str(x), o) => Value::Str(format!("{}{}", x, o.to_string_val())),
            _ => Value::Int(a.to_int() + b.to_int()),
        }
    }
    fn arith_sub(&self, a: &Value, b: &Value) -> Value {
        match (a, b) {
            (Value::Int(x), Value::Int(y)) => Value::Int(x-y),
            (Value::Float(x), Value::Float(y)) => Value::Float(x-y),
            (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64-y),
            (Value::Float(x), Value::Int(y)) => Value::Float(x-*y as f64),
            _ => Value::Int(a.to_int()-b.to_int()),
        }
    }
    fn arith_mul(&self, a: &Value, b: &Value) -> Value {
        match (a, b) {
            (Value::Int(x), Value::Int(y)) => Value::Int(x*y),
            (Value::Float(x), Value::Float(y)) => Value::Float(x*y),
            (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 * y),
            (Value::Float(x), Value::Int(y)) => Value::Float(x * *y as f64),
            _ => Value::Int(a.to_int()*b.to_int()),
        }
    }
    fn arith_div(&self, a: &Value, b: &Value) -> Result<Value, VmError> {
        let bv = b.to_float();
        if bv == 0.0 { return Err(VmError::DivisionByZero); }
        Ok(match (a, b) {
            (Value::Int(x), Value::Int(y)) => Value::Int(x/y),
            _ => Value::Float(a.to_float()/bv),
        })
    }
    fn cmp_gt(&self, a: &Value, b: &Value) -> Trit {
        if a.to_float() > b.to_float() { Trit::Ti } else { Trit::Ta }
    }
    fn cmp_lt(&self, a: &Value, b: &Value) -> Trit {
        if a.to_float() < b.to_float() { Trit::Ti } else { Trit::Ta }
    }

    pub fn disassemble(&self) -> String {
        let mut out = String::new();
        for (i, instr) in self.code.iter().enumerate() {
            let idx = instr.op_index();
            let a = instr.a_val(); let b = instr.b_val();
            if a == 0 && b == 0 { out.push_str(&format!("{:04} {}\n", i, op::name(idx))); }
            else if b == 0 { out.push_str(&format!("{:04} {} a={}\n", i, op::name(idx), a)); }
            else { out.push_str(&format!("{:04} {} a={} b={}\n", i, op::name(idx), a, b)); }
        }
        out
    }

    // ═══ JSON 헬퍼 ═══

    fn parse_json_simple(&self, s: &str) -> Value {
        let s = s.trim();
        if s == "null" || s == "없음" { return Value::None; }
        if let Ok(v) = s.parse::<i64>() { return Value::Int(v); }
        if let Ok(v) = s.parse::<f64>() { return Value::Float(v); }
        if s == "true" || s == "참" { return Value::Trit(Trit::Ti); }
        if s == "false" || s == "거짓" { return Value::Trit(Trit::Ta); }
        if s.starts_with('"') && s.ends_with('"') { return Value::Str(s[1..s.len()-1].to_string()); }
        Value::Str(s.to_string())
    }

    fn to_json(&self, v: &Value) -> String {
        match v {
            Value::None => "null".into(),
            Value::Int(n) => n.to_string(),
            Value::Float(n) => format!("{}", n),
            Value::Str(s) => format!("\"{}\"", s),
            Value::Trit(Trit::Ti) | Value::Bool(true) => "true".into(),
            Value::Trit(Trit::Ta) | Value::Bool(false) => "false".into(),
            Value::Array(a) => format!("[{}]", a.iter().map(|v| self.to_json(v)).collect::<Vec<_>>().join(",")),
            Value::Map(m) => format!("{{{}}}", m.iter().map(|(k,v)| format!("\"{}\":{}", k, self.to_json(v))).collect::<Vec<_>>().join(",")),
            _ => "null".into(),
        }
    }
}
