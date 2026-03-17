// ═══════════════════════════════════════════════════════════════
// 한선씨 코드 생성기 — AST → ISA729 바이트코드
// 4세대 온톨로직 Claim 연산 포함
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use crate::vm::trit::*;
use crate::vm::opcode::op;
use super::ast::*;

pub struct CodeGen {
    code: Vec<Instruction>,
    constants: Vec<ConstValue>,
    /// 변수명 → 슬롯 번호
    scopes: Vec<HashMap<String, usize>>,
    next_slot: usize,
    /// 함수명 → 상수 인덱스 (FuncRef)
    functions: HashMap<String, usize>,
    /// break/continue를 위한 루프 컨텍스트
    loop_stack: Vec<LoopCtx>,
    line: u32,
}

struct LoopCtx {
    start_pc: usize,
    break_patches: Vec<usize>,
}

impl CodeGen {
    pub fn new() -> Self {
        CodeGen {
            code: Vec::new(),
            constants: Vec::new(),
            scopes: vec![HashMap::new()],
            next_slot: 0,
            functions: HashMap::new(),
            loop_stack: Vec::new(),
            line: 0,
        }
    }

    pub fn generate(mut self, program: &Program) -> Result<(Vec<Instruction>, Vec<ConstValue>), String> {
        // 1차: 함수 선언을 먼저 등록 (전방 참조 허용)
        for stmt in program {
            if let Stmt::Fn { name, .. } = stmt {
                let ci = self.add_const(ConstValue::FuncRef(0));
                self.functions.insert(name.clone(), ci);
            }
        }

        // 2차: 코드 생성
        for stmt in program {
            self.gen_stmt(stmt)?;
        }
        self.emit_z(op::HALT);

        Ok((self.code, self.constants))
    }

    // ═══ 발행 헬퍼 ═══

    fn emit_z(&mut self, op: u16) -> usize {
        let pc = self.code.len();
        self.code.push(Instruction::z(op, self.line));
        pc
    }
    fn emit_a(&mut self, op: u16, a: i32) -> usize {
        let pc = self.code.len();
        self.code.push(Instruction::a(op, a, self.line));
        pc
    }
    fn emit_b(&mut self, op: u16, a: i32, b: i32) -> usize {
        let pc = self.code.len();
        self.code.push(Instruction::b(op, a, b, self.line));
        pc
    }
    fn patch_a(&mut self, pc: usize, target: i32) {
        self.code[pc].operand_a = Trit9::from_balanced(target);
    }
    fn patch_b(&mut self, pc: usize, target: i32) {
        self.code[pc].operand_b = Trit9::from_balanced(target);
    }
    fn add_const(&mut self, v: ConstValue) -> usize {
        let i = self.constants.len();
        self.constants.push(v);
        i
    }
    fn push_int(&mut self, v: i64) { let c = self.add_const(ConstValue::Int(v)); self.emit_a(op::PUSH, c as i32); }
    fn push_float(&mut self, v: f64) { let c = self.add_const(ConstValue::Float(v)); self.emit_a(op::PUSH, c as i32); }
    fn push_str(&mut self, s: &str) { let c = self.add_const(ConstValue::Str(s.to_string())); self.emit_a(op::PUSH, c as i32); }
    fn push_trit(&mut self, t: Trit) { let c = self.add_const(ConstValue::Trit(t)); self.emit_a(op::PUSH, c as i32); }

    // ═══ 스코프 ═══

    fn push_scope(&mut self) { self.scopes.push(HashMap::new()); }
    fn pop_scope(&mut self) { self.scopes.pop(); }

    fn declare_var(&mut self, name: &str) -> usize {
        let slot = self.next_slot;
        self.next_slot += 1;
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name.to_string(), slot);
        }
        slot
    }

    fn resolve_var(&self, name: &str) -> Option<usize> {
        for scope in self.scopes.iter().rev() {
            if let Some(&slot) = scope.get(name) { return Some(slot); }
        }
        None
    }

    // ═══ 문장 생성 ═══

    fn gen_stmt(&mut self, stmt: &Stmt) -> Result<(), String> {
        match stmt {
            Stmt::Let { name, value } | Stmt::Const { name, value } => {
                self.gen_expr(value)?;
                let slot = self.declare_var(name);
                self.emit_a(op::STORE, slot as i32);
            }
            Stmt::Assign { name, value } => {
                self.gen_expr(value)?;
                let slot = self.resolve_var(name)
                    .ok_or_else(|| format!("미정의 변수: {}", name))?;
                self.emit_a(op::STORE, slot as i32);
            }
            Stmt::Fn { name, params, body } => {
                // 함수 본문을 JMP으로 건너뜀
                let jmp_over = self.emit_a(op::JMP, 0);
                let func_start = self.code.len() as u16;

                // FuncRef 상수 패치
                if let Some(&ci) = self.functions.get(name) {
                    self.constants[ci] = ConstValue::FuncRef(func_start);
                }

                self.emit_z(op::FUNC);
                self.push_scope();

                // ★ 함수 내부는 슬롯 0부터 시작 (VM의 base_slot과 맞춤)
                let saved_slot = self.next_slot;
                self.next_slot = 0;

                // 매개변수 → 슬롯 0, 1, 2, ...
                for p in params {
                    self.declare_var(p);
                }

                for s in body { self.gen_stmt(s)?; }

                // 암묵적 반환
                if !matches!(body.last(), Some(Stmt::Return(_))) {
                    let c = self.add_const(ConstValue::None);
                    self.emit_a(op::PUSH, c as i32);
                    self.emit_z(op::RET);
                }

                self.next_slot = saved_slot;
                self.pop_scope();
                let after = self.code.len() as i32;
                self.patch_a(jmp_over, after);
            }
            Stmt::Return(expr) => {
                if let Some(e) = expr { self.gen_expr(e)?; }
                else { let c = self.add_const(ConstValue::None); self.emit_a(op::PUSH, c as i32); }
                self.emit_z(op::RET);
            }

            Stmt::If { cond, then_body, elifs, else_body } => {
                self.gen_expr(cond)?;
                self.emit_z(op::NOT);
                let jmp_else = self.emit_a(op::JMPIF, 0);

                self.push_scope();
                for s in then_body { self.gen_stmt(s)?; }
                self.pop_scope();

                let mut end_jumps = vec![self.emit_a(op::JMP, 0)];

                // elif 체인
                let mut next_patch = jmp_else;
                for (elif_cond, elif_body) in elifs {
                    let here = self.code.len() as i32;
                    self.patch_a(next_patch, here);

                    self.gen_expr(elif_cond)?;
                    self.emit_z(op::NOT);
                    next_patch = self.emit_a(op::JMPIF, 0);

                    self.push_scope();
                    for s in elif_body { self.gen_stmt(s)?; }
                    self.pop_scope();
                    end_jumps.push(self.emit_a(op::JMP, 0));
                }

                let else_start = self.code.len() as i32;
                self.patch_a(next_patch, else_start);

                if let Some(eb) = else_body {
                    self.push_scope();
                    for s in eb { self.gen_stmt(s)?; }
                    self.pop_scope();
                }

                let end = self.code.len() as i32;
                for j in end_jumps { self.patch_a(j, end); }
            }

            Stmt::If3 { expr, ti_body, om_body, ta_body } => {
                self.gen_expr(expr)?;
                // IF3: a=ti_pc, b=ta_pc, fall-through=om
                let if3_pc = self.emit_b(op::IF3, 0, 0);

                // Om 본문 (fall-through)
                self.push_scope();
                for s in om_body { self.gen_stmt(s)?; }
                self.pop_scope();
                let jmp_end_om = self.emit_a(op::JMP, 0);

                // Ti 본문
                let ti_start = self.code.len() as i32;
                self.patch_a(if3_pc, ti_start);
                self.push_scope();
                for s in ti_body { self.gen_stmt(s)?; }
                self.pop_scope();
                let jmp_end_ti = self.emit_a(op::JMP, 0);

                // Ta 본문
                let ta_start = self.code.len() as i32;
                self.patch_b(if3_pc, ta_start);
                self.push_scope();
                for s in ta_body { self.gen_stmt(s)?; }
                self.pop_scope();

                let end = self.code.len() as i32;
                self.patch_a(jmp_end_om, end);
                self.patch_a(jmp_end_ti, end);
            }

            Stmt::While { cond, body } => {
                let loop_start = self.code.len();
                self.loop_stack.push(LoopCtx { start_pc: loop_start, break_patches: Vec::new() });

                self.gen_expr(cond)?;
                self.emit_z(op::NOT);
                let jmp_end = self.emit_a(op::JMPIF, 0);

                self.push_scope();
                for s in body { self.gen_stmt(s)?; }
                self.pop_scope();

                self.emit_a(op::JMP, loop_start as i32);
                let end = self.code.len() as i32;
                self.patch_a(jmp_end, end);

                if let Some(ctx) = self.loop_stack.pop() {
                    for bp in ctx.break_patches { self.patch_a(bp, end); }
                }
            }

            Stmt::For { var, iter, body } => {
                // 각각 v 에서 배열 { ... }
                // → 배열을 slot에, i=0, len으로 while 루프
                self.gen_expr(iter)?;
                let arr_slot = self.declare_var("__arr__");
                self.emit_a(op::STORE, arr_slot as i32);

                self.push_int(0);
                let i_slot = self.declare_var("__i__");
                self.emit_a(op::STORE, i_slot as i32);

                self.emit_a(op::LOAD, arr_slot as i32);
                self.emit_z(op::LEN);
                let len_slot = self.declare_var("__len__");
                self.emit_a(op::STORE, len_slot as i32);

                let loop_start = self.code.len();
                self.loop_stack.push(LoopCtx { start_pc: loop_start, break_patches: Vec::new() });

                self.emit_a(op::LOAD, i_slot as i32);
                self.emit_a(op::LOAD, len_slot as i32);
                self.emit_z(op::LT);
                self.emit_z(op::NOT);
                let jmp_end = self.emit_a(op::JMPIF, 0);

                // v = arr[i]
                let v_slot = self.declare_var(var);
                self.emit_a(op::LOAD, arr_slot as i32);
                self.emit_a(op::LOAD, i_slot as i32);
                self.emit_z(op::INDEX);
                self.emit_a(op::STORE, v_slot as i32);

                self.push_scope();
                for s in body { self.gen_stmt(s)?; }
                self.pop_scope();

                // i++
                self.emit_a(op::LOAD, i_slot as i32);
                self.push_int(1);
                self.emit_z(op::ADD);
                self.emit_a(op::STORE, i_slot as i32);
                self.emit_a(op::JMP, loop_start as i32);

                let end = self.code.len() as i32;
                self.patch_a(jmp_end, end);
                if let Some(ctx) = self.loop_stack.pop() {
                    for bp in ctx.break_patches { self.patch_a(bp, end); }
                }
            }

            Stmt::Loop(body) => {
                let loop_start = self.code.len();
                self.loop_stack.push(LoopCtx { start_pc: loop_start, break_patches: Vec::new() });
                self.push_scope();
                for s in body { self.gen_stmt(s)?; }
                self.pop_scope();
                self.emit_a(op::JMP, loop_start as i32);

                let end = self.code.len() as i32;
                if let Some(ctx) = self.loop_stack.pop() {
                    for bp in ctx.break_patches { self.patch_a(bp, end); }
                }
            }

            Stmt::Break => {
                let bp = self.emit_a(op::JMP, 0);
                if let Some(ctx) = self.loop_stack.last_mut() { ctx.break_patches.push(bp); }
            }
            Stmt::Continue => {
                if let Some(ctx) = self.loop_stack.last() {
                    self.emit_a(op::JMP, ctx.start_pc as i32);
                }
            }

            Stmt::Print(expr) => {
                self.gen_expr(expr)?;
                self.emit_z(op::PRINT);
            }
            Stmt::Expr(expr) => {
                self.gen_expr(expr)?;
                // 표현식 결과를 스택에 남김 (마지막 값)
            }

            // ═══ 4세대 온톨로직 ═══

            Stmt::ClaimDecl { name, subject, predicate, object, epistemic } => {
                // [스택: 대상, 술어, 값, 인식상태] → CLAIM_NEW → STORE
                self.gen_expr(subject)?;
                self.gen_expr(predicate)?;
                self.gen_expr(object)?;
                let ep_i = match epistemic {
                    EpState::Ti => 0, EpState::Om => 1, EpState::Ta => 2, EpState::Eum => 3,
                };
                self.push_int(ep_i);
                self.emit_z(op::CLAIM_NEW);
                let slot = self.declare_var(name);
                self.emit_a(op::STORE, slot as i32);
            }

            Stmt::Evidence { claim, evidence } => {
                let slot = self.resolve_var(claim)
                    .ok_or_else(|| format!("미정의 주장: {}", claim))?;
                self.emit_a(op::LOAD, slot as i32);
                self.gen_expr(evidence)?;
                self.emit_z(op::CLAIM_EVID);
                self.emit_a(op::STORE, slot as i32);
            }

            Stmt::Transition { claim, forward } => {
                let slot = self.resolve_var(claim)
                    .ok_or_else(|| format!("미정의 주장: {}", claim))?;
                self.emit_a(op::LOAD, slot as i32);
                self.push_int(if *forward { 1 } else { -1 });
                self.emit_z(op::CLAIM_TRANS);
                self.emit_a(op::STORE, slot as i32);
            }

            Stmt::Try { body, catch_var, catch_body } => {
                let try_catch = self.emit_a(op::TRY, 0);
                self.push_scope();
                for s in body { self.gen_stmt(s)?; }
                self.pop_scope();
                let jmp_end = self.emit_a(op::JMP, 0);

                let catch_pc = self.code.len() as i32;
                self.patch_a(try_catch, catch_pc);
                self.emit_z(op::CATCH);
                let cv_slot = self.declare_var(catch_var);
                self.emit_a(op::STORE, cv_slot as i32);
                self.push_scope();
                for s in catch_body { self.gen_stmt(s)?; }
                self.pop_scope();

                let end = self.code.len() as i32;
                self.patch_a(jmp_end, end);
            }

            Stmt::Throw(expr) => {
                self.gen_expr(expr)?;
                self.emit_z(op::THROW);
            }

            // 모듈: 가져오기는 컴파일러 레벨에서 처리 (여기선 무시)
            Stmt::Import { .. } => { /* 컴파일러/mod.rs에서 선처리됨 */ }
            Stmt::Export { .. } => { /* 메타데이터만 — 코드 생성 불필요 */ }

            // 배열 인덱스 대입: a[i] = v → LOAD a, PUSH i, PUSH v, SETIDX, STORE a
            Stmt::IndexAssign { target, index, value } => {
                let slot = self.resolve_var(target)
                    .ok_or_else(|| format!("미정의 변수: {}", target))?;
                self.emit_a(op::LOAD, slot as i32);
                self.gen_expr(index)?;
                self.gen_expr(value)?;
                self.emit_z(op::SETIDX);
                self.emit_a(op::STORE, slot as i32);
            }
        }
        Ok(())
    }

    // ═══ 표현식 생성 ═══

    fn gen_expr(&mut self, expr: &Expr) -> Result<(), String> {
        match expr {
            Expr::IntLit(v) => { self.push_int(*v); }
            Expr::FloatLit(v) => { self.push_float(*v); }
            Expr::StrLit(s) => { self.push_str(s); }
            Expr::TritLit(v) => {
                match v { 1 => self.push_trit(Trit::Ti), 0 => self.push_trit(Trit::Om), _ => self.push_trit(Trit::Ta) }
            }

            Expr::Ident(name) => {
                let slot = self.resolve_var(name)
                    .ok_or_else(|| format!("미정의 변수: {}", name))?;
                self.emit_a(op::LOAD, slot as i32);
            }

            Expr::BinOp { op: bop, left, right } => {
                self.gen_expr(left)?;
                self.gen_expr(right)?;
                match bop {
                    BinOp::Add => { self.emit_z(op::ADD); }
                    BinOp::Sub => { self.emit_z(op::SUB); }
                    BinOp::Mul => { self.emit_z(op::MUL); }
                    BinOp::Div => { self.emit_z(op::DIV); }
                    BinOp::Mod => { self.emit_z(op::MOD); }
                    BinOp::Eq => { self.emit_z(op::EQ); }
                    BinOp::Neq => { self.emit_z(op::NEQ); }
                    BinOp::Gt => { self.emit_z(op::GT); }
                    BinOp::Lt => { self.emit_z(op::LT); }
                    BinOp::Gte => { self.emit_z(op::LT); self.emit_z(op::NOT); }  // a >= b = NOT(a < b)
                    BinOp::Lte => { self.emit_z(op::GT); self.emit_z(op::NOT); }  // a <= b = NOT(a > b)
                    BinOp::And => { self.emit_z(op::AND); }
                    BinOp::Or => { /* OR = NOT(AND(NOT a, NOT b)) */
                        // 간소화: 양쪽 이미 스택에 있으므로
                        // a OR b = TRIT max
                        self.emit_z(op::MAX);
                    }
                }
            }

            Expr::UnaryOp { op: uop, expr: e } => {
                self.gen_expr(e)?;
                match uop {
                    UnaryOp::Neg => { self.emit_z(op::NEG); }
                    UnaryOp::Not => { self.emit_z(op::NOT); }
                }
            }

            Expr::Call { func, args } => {
                // 인자를 스택에 푸시
                for arg in args { self.gen_expr(arg)?; }

                // 함수 참조 로드
                if let Some(&ci) = self.functions.get(func) {
                    self.emit_a(op::PUSH, ci as i32);
                    self.emit_a(op::CALL, args.len() as i32);
                } else {
                    return Err(format!("미정의 함수: {}", func));
                }
            }

            Expr::ArrayLit(elems) => {
                for e in elems { self.gen_expr(e)?; }
                self.emit_a(op::ARRAY, elems.len() as i32);
            }

            Expr::MapLit(pairs) => {
                self.emit_z(op::HASH_NEW);
                for (k, v) in pairs {
                    self.push_str(k);
                    self.gen_expr(v)?;
                    self.emit_z(op::HASH_SET);
                }
            }

            Expr::Index { target, index } => {
                self.gen_expr(target)?;
                self.gen_expr(index)?;
                self.emit_z(op::INDEX);
            }

            Expr::Field { target, field } => {
                self.gen_expr(target)?;
                self.push_str(field);
                self.emit_z(op::HASH_GET);
            }

            // ═══ 4세대 온톨로직 표현식 ═══

            Expr::ClaimExpr { subject, predicate, object, epistemic } => {
                self.gen_expr(subject)?;
                self.gen_expr(predicate)?;
                self.gen_expr(object)?;
                let ep_i = match epistemic {
                    EpState::Ti => 0, EpState::Om => 1, EpState::Ta => 2, EpState::Eum => 3,
                };
                self.push_int(ep_i);
                self.emit_z(op::CLAIM_NEW);
            }

            Expr::StateOf(e) => {
                self.gen_expr(e)?;
                self.emit_z(op::CLAIM_STATE);
            }

            Expr::ConfidenceOf(e) => {
                self.gen_expr(e)?;
                self.emit_z(op::CLAIM_CONF);
            }

            Expr::Decide { claim, goal_fit } => {
                self.gen_expr(claim)?;
                self.gen_expr(goal_fit)?;
                self.emit_z(op::CLAIM_DECIDE);
            }

            // ═══ 내장/시스템 호출 ═══

            Expr::Builtin { id, args } => {
                // 인자를 스택에 푸시 (역순이 아니라 순서대로)
                for arg in args { self.gen_expr(arg)?; }
                self.emit_a(op::BUILTIN, *id as i32);
            }

            Expr::Syscall { name, args } => {
                // 인자 → 스택, 이름 → 스택, SYSCALL(인자수)
                for arg in args { self.gen_expr(arg)?; }
                self.push_str(name);
                self.emit_a(op::SYSCALL, args.len() as i32);
            }
        }
        Ok(())
    }
}
