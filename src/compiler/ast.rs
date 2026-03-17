// ═══════════════════════════════════════════════════════════════
// 한선씨 AST — 4세대 온톨로직 노드 포함
// ═══════════════════════════════════════════════════════════════

pub type Program = Vec<Stmt>;

#[derive(Debug, Clone)]
pub enum Stmt {
    Let { name: String, value: Expr },
    Const { name: String, value: Expr },
    Assign { name: String, value: Expr },
    Fn { name: String, params: Vec<String>, body: Vec<Stmt> },
    Return(Option<Expr>),
    If { cond: Expr, then_body: Vec<Stmt>, elifs: Vec<(Expr, Vec<Stmt>)>, else_body: Option<Vec<Stmt>> },
    If3 { expr: Expr, ti_body: Vec<Stmt>, om_body: Vec<Stmt>, ta_body: Vec<Stmt> },
    While { cond: Expr, body: Vec<Stmt> },
    For { var: String, iter: Expr, body: Vec<Stmt> },
    Loop(Vec<Stmt>),
    Break,
    Continue,
    Print(Expr),
    Expr(Expr),
    // 4세대 온톨로직
    ClaimDecl { name: String, subject: Expr, predicate: Expr, object: Expr, epistemic: EpState },
    Evidence { claim: String, evidence: Expr },
    Transition { claim: String, forward: bool },
    // 에러
    Try { body: Vec<Stmt>, catch_var: String, catch_body: Vec<Stmt> },
    Throw(Expr),
    // Stage 1: 모듈
    Import(String),
    Export(Vec<String>),
    // Stage 1: 배열 인덱스 대입
    IndexAssign { target: String, index: Expr, value: Expr },
}

#[derive(Debug, Clone)]
pub enum Expr {
    IntLit(i64),
    FloatLit(f64),
    StrLit(String),
    TritLit(i8),     // 1=Ti, 0=Om, -1=Ta
    Ident(String),
    BinOp { op: BinOp, left: Box<Expr>, right: Box<Expr> },
    UnaryOp { op: UnaryOp, expr: Box<Expr> },
    Call { func: String, args: Vec<Expr> },
    ArrayLit(Vec<Expr>),
    MapLit(Vec<(String, Expr)>),
    Index { target: Box<Expr>, index: Box<Expr> },
    Field { target: Box<Expr>, field: String },
    // 4세대 온톨로직 표현식
    ClaimExpr { subject: Box<Expr>, predicate: Box<Expr>, object: Box<Expr>, epistemic: EpState },
    StateOf(Box<Expr>),
    ConfidenceOf(Box<Expr>),
    Decide { claim: Box<Expr>, goal_fit: Box<Expr> },
    // Stage 1: 내장함수/시스템콜
    Builtin { id: Box<Expr>, args: Vec<Expr> },
    Syscall { name: Box<Expr>, args: Vec<Expr> },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BinOp {
    Add, Sub, Mul, Div, Mod,
    Eq, Neq, Gt, Lt, Gte, Lte,
    And, Or,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UnaryOp { Neg, Not }

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EpState { Ti, Om, Ta, Eum }
