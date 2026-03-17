// ═══════════════════════════════════════════════════════════════
// 균형3진 기본 타입 + 4세대 인식상태 (Ti/Om/Ta + Eum)
// ═══════════════════════════════════════════════════════════════

use std::fmt;
use std::collections::HashMap;

// ═══ 트릿 ═══

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Trit { Ta, Om, Ti }

impl Trit {
    pub fn val(self) -> i8 { match self { Trit::Ta => -1, Trit::Om => 0, Trit::Ti => 1 } }
    pub fn from_i8(v: i8) -> Self { match v { 1.. => Trit::Ti, 0 => Trit::Om, _ => Trit::Ta } }
    pub fn not(self) -> Self { match self { Trit::Ti=>Trit::Ta, Trit::Ta=>Trit::Ti, Trit::Om=>Trit::Om } }
    pub fn and(self, o: Self) -> Self { Trit::from_i8(self.val().min(o.val())) }
    pub fn or(self, o: Self) -> Self { Trit::from_i8(self.val().max(o.val())) }
    pub fn consensus(self, o: Self) -> Self { if self == o { self } else { Trit::Om } }
    pub fn sym(self) -> &'static str { match self { Trit::Ti=>"▲", Trit::Om=>"■", Trit::Ta=>"▼" } }
    pub fn kr(self) -> &'static str { match self { Trit::Ti=>"티", Trit::Om=>"옴", Trit::Ta=>"타" } }
}

impl fmt::Display for Trit { fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "{}", self.sym()) } }

// ═══ 6-trit 워드 (ISA729 옵코드) ═══

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Trit6(pub [Trit; 6]);

impl Trit6 {
    pub fn from_index(idx: u16) -> Self {
        let mut v = idx; let mut t = [Trit::Ta; 6];
        for i in (0..6).rev() { t[i] = match v%3 { 0=>Trit::Ta, 1=>Trit::Om, _=>Trit::Ti }; v/=3; }
        Trit6(t)
    }
    pub fn to_index(&self) -> u16 {
        self.0.iter().fold(0u16, |a, t| a*3 + match t { Trit::Ta=>0, Trit::Om=>1, Trit::Ti=>2 })
    }
}

// ═══ 9-trit 워드 (피연산자) ═══

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Trit9(pub [Trit; 9]);

impl Trit9 {
    pub fn zero() -> Self { Trit9([Trit::Om; 9]) }
    pub fn from_balanced(val: i32) -> Self {
        let mut t = [Trit::Om; 9]; let mut v = val.abs();
        for i in (0..9).rev() {
            let r = v % 3;
            t[i] = match r { 0=>Trit::Om, 1=>Trit::Ti, _=>{ v+=1; Trit::Ta } };
            v /= 3;
        }
        if val < 0 { for tr in &mut t { *tr = tr.not(); } }
        Trit9(t)
    }
    pub fn to_balanced(&self) -> i32 {
        self.0.iter().fold(0i32, |a, t| a*3 + t.val() as i32)
    }
}

// ═══ 인스트럭션 ═══

#[derive(Debug, Clone)]
pub struct Instruction {
    pub opcode: Trit6,
    pub operand_a: Trit9,
    pub operand_b: Trit9,
    pub line: u32,
}

impl Instruction {
    pub fn z(op: u16, l: u32) -> Self {
        Instruction { opcode: Trit6::from_index(op), operand_a: Trit9::zero(), operand_b: Trit9::zero(), line: l }
    }
    pub fn a(op: u16, a: i32, l: u32) -> Self {
        Instruction { opcode: Trit6::from_index(op), operand_a: Trit9::from_balanced(a), operand_b: Trit9::zero(), line: l }
    }
    pub fn b(op: u16, a: i32, b: i32, l: u32) -> Self {
        Instruction { opcode: Trit6::from_index(op), operand_a: Trit9::from_balanced(a), operand_b: Trit9::from_balanced(b), line: l }
    }
    pub fn op_index(&self) -> u16 { self.opcode.to_index() }
    pub fn a_val(&self) -> i32 { self.operand_a.to_balanced() }
    pub fn b_val(&self) -> i32 { self.operand_b.to_balanced() }
}

// ═══ 상수값 ═══

#[derive(Debug, Clone)]
pub enum ConstValue { None, Int(i64), Float(f64), Str(String), Trit(Trit), FuncRef(u16) }

// ═══ 런타임 값 (4세대 인식상태 포함) ═══

#[derive(Debug, Clone)]
pub enum Value {
    None,
    Int(i64),
    Float(f64),
    Str(String),
    Trit(Trit),
    Bool(bool),
    Array(Vec<Value>),
    Map(HashMap<String, Value>),
    FuncRef(u16),
    Closure { func_ref: u16, upvalues: Vec<Value> },
    Error(String),
    FileHandle(i32),
    Module { name: String, exports: HashMap<String, Value> },
    // ═══ 4세대 온톨로직: Claim (주장 객체) ═══
    Claim(Box<Claim>),
}

/// 4세대 온톨로직 인식상태
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Epistemic {
    Ti,  // 아는 것 (Known) → 1.0
    Om,  // 모르는 것 (Unknown) → 0.35
    Ta,  // 잘못 아는 것 (Misknown) → -0.7
    Eum, // 아는지 모르는지조차 모르는 것 → 0.0
}

impl Epistemic {
    pub fn reliability(self) -> f64 {
        match self { Epistemic::Ti=>1.0, Epistemic::Om=>0.35, Epistemic::Ta=>-0.7, Epistemic::Eum=>0.0 }
    }
    pub fn forward(self) -> Self {
        match self { Epistemic::Eum=>Epistemic::Om, Epistemic::Om=>Epistemic::Ti, Epistemic::Ta=>Epistemic::Om, Epistemic::Ti=>Epistemic::Ti }
    }
    pub fn backward(self) -> Self {
        match self { Epistemic::Ti=>Epistemic::Om, Epistemic::Om=>Epistemic::Eum, Epistemic::Ta=>Epistemic::Ta, Epistemic::Eum=>Epistemic::Eum }
    }
    pub fn kr(self) -> &'static str {
        match self { Epistemic::Ti=>"티(확정)", Epistemic::Om=>"옴(미확인)", Epistemic::Ta=>"타(오해)", Epistemic::Eum=>"음(미인지)" }
    }
}
impl fmt::Display for Epistemic { fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "{}", self.kr()) } }

/// Claim: 4세대 온톨로직의 핵심 단위 — 주장+근거+인식상태
#[derive(Debug, Clone)]
pub struct Claim {
    pub subject: String,
    pub predicate: String,
    pub object: Value,
    pub epistemic: Epistemic,
    pub confidence: f64,
    pub evidence: Vec<String>,
}

impl Value {
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::None=>"없음", Value::Int(_)=>"정수", Value::Float(_)=>"실수",
            Value::Str(_)=>"문자열", Value::Trit(_)=>"트릿", Value::Bool(_)=>"참거짓",
            Value::Array(_)=>"배열", Value::Map(_)=>"객체", Value::FuncRef(_)=>"함수",
            Value::Closure{..}=>"클로저", Value::Error(_)=>"에러",
            Value::FileHandle(_)=>"파일", Value::Module{..}=>"모듈",
            Value::Claim(_)=>"주장",
        }
    }
    pub fn is_truthy(&self) -> Trit {
        match self {
            Value::Trit(t) => *t, Value::Bool(b) => if *b { Trit::Ti } else { Trit::Ta },
            Value::Int(v) => if *v > 0 { Trit::Ti } else if *v == 0 { Trit::Om } else { Trit::Ta },
            Value::Float(v) => if *v > 0.0 { Trit::Ti } else if *v == 0.0 { Trit::Om } else { Trit::Ta },
            Value::None | Value::Error(_) => Trit::Ta,
            Value::Str(s) => if s.is_empty() { Trit::Ta } else { Trit::Ti },
            Value::Array(a) => if a.is_empty() { Trit::Ta } else { Trit::Ti },
            Value::Claim(c) => Trit::from_i8(if c.confidence > 0.5 { 1 } else if c.confidence < -0.3 { -1 } else { 0 }),
            _ => Trit::Ti,
        }
    }
    pub fn to_int(&self) -> i64 { match self { Value::Int(v)=>*v, Value::Float(v)=>*v as i64, Value::Trit(t)=>t.val() as i64, Value::Str(s)=>s.parse().unwrap_or(0), _=>0 } }
    pub fn to_float(&self) -> f64 { match self { Value::Float(v)=>*v, Value::Int(v)=>*v as f64, Value::Trit(t)=>t.val() as f64, Value::Str(s)=>s.parse().unwrap_or(0.0), _=>0.0 } }
    pub fn to_string_val(&self) -> String {
        match self {
            Value::None=>"없음".into(), Value::Int(v)=>v.to_string(), Value::Float(v)=>format!("{}",v),
            Value::Str(s)=>s.clone(), Value::Bool(b)=>(if *b {"참"} else {"거짓"}).into(),
            Value::Trit(t)=>t.sym().into(),
            Value::Array(a)=>format!("[{}]", a.iter().map(|v|v.to_string_val()).collect::<Vec<_>>().join(", ")),
            Value::Map(m)=>format!("{{{}}}", m.iter().map(|(k,v)|format!("{}: {}",k,v.to_string_val())).collect::<Vec<_>>().join(", ")),
            Value::FuncRef(o)=>format!("<함수@{}>",o), Value::Closure{func_ref,..}=>format!("<클로저@{}>",func_ref),
            Value::Error(e)=>format!("<에러: {}>",e), Value::FileHandle(fd)=>format!("<파일#{}>",fd),
            Value::Module{name,..}=>format!("<모듈:{}>",name),
            Value::Claim(c)=>format!("<주장: {}.{} = {} [{}] 확신:{:.2}>", c.subject, c.predicate, c.object.to_string_val(), c.epistemic, c.confidence),
        }
    }
}

impl fmt::Display for Value { fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "{}", self.to_string_val()) } }
impl PartialEq for Value {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Value::None, Value::None) => true,
            (Value::Int(a), Value::Int(b)) => a==b,
            (Value::Float(a), Value::Float(b)) => a==b,
            (Value::Str(a), Value::Str(b)) => a==b,
            (Value::Trit(a), Value::Trit(b)) => a==b,
            (Value::Bool(a), Value::Bool(b)) => a==b,
            _ => false,
        }
    }
}
