// ═══════════════════════════════════════════════════════════════
// 한선씨 파서 — 4세대 온톨로직 문법 포함
//
// 문법 개요:
//   변수 이름 = 표현식
//   함수 이름(a, b) { 본문 }
//   만약 (조건) { } 혹시 (조건) { } 아니면 { }
//   만약3 (표현식) { 긍정: { } 보류: { } 부정: { } }
//   동안 (조건) { }
//   각각 x 에서 배열 { }
//   주장 이름 = 주장(대상, 술어, 값, 인식상태)
//   근거(주장이름, "증거")
//   전이(주장이름, 전진/후퇴)
//   출력(표현식)
// ═══════════════════════════════════════════════════════════════

use super::token::Token;
use super::ast::*;

pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, pos: 0 }
    }

    fn cur(&self) -> &Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof)
    }
    fn advance(&mut self) -> Token {
        let t = self.cur().clone();
        self.pos += 1;
        t
    }
    fn expect(&mut self, expected: &Token) -> Result<(), String> {
        if self.cur() == expected { self.advance(); Ok(()) }
        else { Err(format!("기대: {:?}, 실제: {:?}", expected, self.cur())) }
    }
    fn eat_ident(&mut self) -> Result<String, String> {
        match self.cur().clone() {
            Token::Ident(s) => { self.advance(); Ok(s) }
            t => Err(format!("식별자 기대, 실제: {:?}", t))
        }
    }
    fn at_end(&self) -> bool { matches!(self.cur(), Token::Eof) }

    pub fn parse(&mut self) -> Result<Program, String> {
        let mut stmts = Vec::new();
        while !self.at_end() {
            stmts.push(self.parse_stmt()?);
        }
        Ok(stmts)
    }

    fn parse_stmt(&mut self) -> Result<Stmt, String> {
        match self.cur().clone() {
            Token::KwLet => self.parse_let(),
            Token::KwConst => self.parse_const(),
            Token::KwFn => self.parse_fn(),
            Token::KwReturn => self.parse_return(),
            Token::KwIf => self.parse_if(),
            Token::KwIf3 => self.parse_if3(),
            Token::KwWhile => self.parse_while(),
            Token::KwFor => self.parse_for(),
            Token::KwLoop => self.parse_loop(),
            Token::KwBreak => { self.advance(); Ok(Stmt::Break) }
            Token::KwContinue => { self.advance(); Ok(Stmt::Continue) }
            Token::KwPrint => self.parse_print(),
            Token::KwClaim => self.parse_claim_decl(),
            Token::KwEvidence => self.parse_evidence(),
            Token::KwTransition => self.parse_transition(),
            Token::KwTry => self.parse_try(),
            Token::KwThrow => self.parse_throw(),
            Token::Ident(_) => self.parse_ident_stmt(),
            _ => {
                let expr = self.parse_expr()?;
                Ok(Stmt::Expr(expr))
            }
        }
    }

    // ═══ 변수/상수 ═══

    fn parse_let(&mut self) -> Result<Stmt, String> {
        self.advance(); // 변수
        let name = self.eat_ident()?;
        self.expect(&Token::Assign)?;
        let value = self.parse_expr()?;
        Ok(Stmt::Let { name, value })
    }

    fn parse_const(&mut self) -> Result<Stmt, String> {
        self.advance(); // 상수
        let name = self.eat_ident()?;
        self.expect(&Token::Assign)?;
        let value = self.parse_expr()?;
        Ok(Stmt::Const { name, value })
    }

    fn parse_ident_stmt(&mut self) -> Result<Stmt, String> {
        let name = self.eat_ident()?;
        if matches!(self.cur(), Token::Assign) {
            self.advance();
            let value = self.parse_expr()?;
            Ok(Stmt::Assign { name, value })
        } else if matches!(self.cur(), Token::LParen) {
            // 함수 호출
            self.advance(); // (
            let args = self.parse_args()?;
            self.expect(&Token::RParen)?;
            Ok(Stmt::Expr(Expr::Call { func: name, args }))
        } else {
            Ok(Stmt::Expr(Expr::Ident(name)))
        }
    }

    // ═══ 함수 ═══

    fn parse_fn(&mut self) -> Result<Stmt, String> {
        self.advance(); // 함수
        let name = self.eat_ident()?;
        self.expect(&Token::LParen)?;
        let params = self.parse_param_list()?;
        self.expect(&Token::RParen)?;
        let body = self.parse_block()?;
        Ok(Stmt::Fn { name, params, body })
    }

    fn parse_param_list(&mut self) -> Result<Vec<String>, String> {
        let mut params = Vec::new();
        if !matches!(self.cur(), Token::RParen) {
            params.push(self.eat_ident()?);
            while matches!(self.cur(), Token::Comma) {
                self.advance();
                params.push(self.eat_ident()?);
            }
        }
        Ok(params)
    }

    fn parse_return(&mut self) -> Result<Stmt, String> {
        self.advance(); // 반환
        if matches!(self.cur(), Token::RBrace | Token::Eof) {
            Ok(Stmt::Return(None))
        } else {
            Ok(Stmt::Return(Some(self.parse_expr()?)))
        }
    }

    // ═══ 제어문 ═══

    fn parse_if(&mut self) -> Result<Stmt, String> {
        self.advance(); // 만약
        self.expect(&Token::LParen)?;
        let cond = self.parse_expr()?;
        self.expect(&Token::RParen)?;
        let then_body = self.parse_block()?;

        let mut elifs = Vec::new();
        while matches!(self.cur(), Token::KwElseIf) {
            self.advance();
            self.expect(&Token::LParen)?;
            let elif_cond = self.parse_expr()?;
            self.expect(&Token::RParen)?;
            let elif_body = self.parse_block()?;
            elifs.push((elif_cond, elif_body));
        }

        let else_body = if matches!(self.cur(), Token::KwElse) {
            self.advance();
            Some(self.parse_block()?)
        } else { None };

        Ok(Stmt::If { cond, then_body, elifs, else_body })
    }

    /// 만약3 (표현식) { 긍정: { } 보류: { } 부정: { } }
    fn parse_if3(&mut self) -> Result<Stmt, String> {
        self.advance(); // 만약3
        self.expect(&Token::LParen)?;
        let expr = self.parse_expr()?;
        self.expect(&Token::RParen)?;
        self.expect(&Token::LBrace)?;

        let mut ti_body = Vec::new();
        let mut om_body = Vec::new();
        let mut ta_body = Vec::new();

        // 긍정: { ... }  보류: { ... }  부정: { ... }
        for _ in 0..3 {
            let is_ti = matches!(self.cur(), Token::TritTi) || matches!(self.cur(), Token::Ident(s) if s == "긍정");
            let is_om = matches!(self.cur(), Token::TritOm) || matches!(self.cur(), Token::Ident(s) if s == "보류");
            let is_ta = matches!(self.cur(), Token::TritTa) || matches!(self.cur(), Token::Ident(s) if s == "부정");
            if is_ti {
                self.advance(); self.expect(&Token::Colon)?;
                ti_body = self.parse_block()?;
            } else if is_om {
                self.advance(); self.expect(&Token::Colon)?;
                om_body = self.parse_block()?;
            } else if is_ta {
                self.advance(); self.expect(&Token::Colon)?;
                ta_body = self.parse_block()?;
            } else { break; }
        }
        self.expect(&Token::RBrace)?;
        Ok(Stmt::If3 { expr, ti_body, om_body, ta_body })
    }

    fn parse_while(&mut self) -> Result<Stmt, String> {
        self.advance(); // 동안
        self.expect(&Token::LParen)?;
        let cond = self.parse_expr()?;
        self.expect(&Token::RParen)?;
        let body = self.parse_block()?;
        Ok(Stmt::While { cond, body })
    }

    fn parse_for(&mut self) -> Result<Stmt, String> {
        self.advance(); // 각각
        let var = self.eat_ident()?;
        self.expect(&Token::KwIn)?;
        let iter = self.parse_expr()?;
        let body = self.parse_block()?;
        Ok(Stmt::For { var, iter, body })
    }

    fn parse_loop(&mut self) -> Result<Stmt, String> {
        self.advance(); // 반복
        let body = self.parse_block()?;
        Ok(Stmt::Loop(body))
    }

    fn parse_print(&mut self) -> Result<Stmt, String> {
        self.advance(); // 출력
        self.expect(&Token::LParen)?;
        let expr = self.parse_expr()?;
        self.expect(&Token::RParen)?;
        Ok(Stmt::Print(expr))
    }

    // ═══ 4세대 온톨로직 ═══

    /// 주장 이름 = 주장(대상, 술어, 값, 인식상태)
    fn parse_claim_decl(&mut self) -> Result<Stmt, String> {
        self.advance(); // 주장
        let name = self.eat_ident()?;
        self.expect(&Token::Assign)?;
        self.expect(&Token::LParen)?;
        let subject = self.parse_expr()?;
        self.expect(&Token::Comma)?;
        let predicate = self.parse_expr()?;
        self.expect(&Token::Comma)?;
        let object = self.parse_expr()?;
        self.expect(&Token::Comma)?;
        let epistemic = self.parse_epistemic()?;
        self.expect(&Token::RParen)?;
        Ok(Stmt::ClaimDecl { name, subject, predicate, object, epistemic })
    }

    fn parse_epistemic(&mut self) -> Result<EpState, String> {
        match self.cur() {
            Token::KwEpTi | Token::TritTi => { self.advance(); Ok(EpState::Ti) }
            Token::KwEpOm | Token::TritOm => { self.advance(); Ok(EpState::Om) }
            Token::KwEpTa | Token::TritTa => { self.advance(); Ok(EpState::Ta) }
            Token::KwEpEum => { self.advance(); Ok(EpState::Eum) }
            Token::Ident(s) => {
                let ep = match s.as_str() {
                    "확정" | "Ti" => EpState::Ti,
                    "미확인" | "Om" => EpState::Om,
                    "오해" | "Ta" => EpState::Ta,
                    "미인지" | "Eum" => EpState::Eum,
                    _ => return Err(format!("인식상태 기대: 확정/미확인/오해/미인지, 실제: {}", s)),
                };
                self.advance(); Ok(ep)
            }
            t => Err(format!("인식상태 기대, 실제: {:?}", t)),
        }
    }

    /// 근거(주장이름, "증거")
    fn parse_evidence(&mut self) -> Result<Stmt, String> {
        self.advance(); // 근거
        self.expect(&Token::LParen)?;
        let claim = self.eat_ident()?;
        self.expect(&Token::Comma)?;
        let evidence = self.parse_expr()?;
        self.expect(&Token::RParen)?;
        Ok(Stmt::Evidence { claim, evidence })
    }

    /// 전이(주장이름, 전진) 또는 전이(주장이름, 후퇴)
    fn parse_transition(&mut self) -> Result<Stmt, String> {
        self.advance(); // 전이
        self.expect(&Token::LParen)?;
        let claim = self.eat_ident()?;
        self.expect(&Token::Comma)?;
        let dir_tok = self.advance();
        let forward = match &dir_tok {
            Token::Ident(s) => match s.as_str() {
                "전진" | "forward" => true,
                "후퇴" | "backward" => false,
                _ => return Err(format!("전진/후퇴 기대, 실제: {}", s)),
            },
            _ => return Err(format!("전진/후퇴 기대, 실제: {:?}", dir_tok)),
        };
        self.expect(&Token::RParen)?;
        Ok(Stmt::Transition { claim, forward })
    }

    // ═══ 에러 ═══

    fn parse_try(&mut self) -> Result<Stmt, String> {
        self.advance(); // 시도
        let body = self.parse_block()?;
        self.expect(&Token::KwCatch)?;
        self.expect(&Token::LParen)?;
        let catch_var = self.eat_ident()?;
        self.expect(&Token::RParen)?;
        let catch_body = self.parse_block()?;
        Ok(Stmt::Try { body, catch_var, catch_body })
    }

    fn parse_throw(&mut self) -> Result<Stmt, String> {
        self.advance(); // 던져
        let expr = self.parse_expr()?;
        Ok(Stmt::Throw(expr))
    }

    // ═══ 블록 ═══

    fn parse_block(&mut self) -> Result<Vec<Stmt>, String> {
        self.expect(&Token::LBrace)?;
        let mut stmts = Vec::new();
        while !matches!(self.cur(), Token::RBrace | Token::Eof) {
            stmts.push(self.parse_stmt()?);
        }
        self.expect(&Token::RBrace)?;
        Ok(stmts)
    }

    fn parse_args(&mut self) -> Result<Vec<Expr>, String> {
        let mut args = Vec::new();
        if !matches!(self.cur(), Token::RParen) {
            args.push(self.parse_expr()?);
            while matches!(self.cur(), Token::Comma) {
                self.advance();
                args.push(self.parse_expr()?);
            }
        }
        Ok(args)
    }

    // ═══ 표현식 (우선순위: or < and < cmp < add < mul < unary < primary) ═══

    fn parse_expr(&mut self) -> Result<Expr, String> { self.parse_or() }

    fn parse_or(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_and()?;
        while matches!(self.cur(), Token::Or) {
            self.advance();
            let right = self.parse_and()?;
            left = Expr::BinOp { op: BinOp::Or, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_comparison()?;
        while matches!(self.cur(), Token::And) {
            self.advance();
            let right = self.parse_comparison()?;
            left = Expr::BinOp { op: BinOp::And, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    fn parse_comparison(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_addition()?;
        loop {
            let op = match self.cur() {
                Token::Eq => BinOp::Eq, Token::Neq => BinOp::Neq,
                Token::Gt => BinOp::Gt, Token::Lt => BinOp::Lt,
                Token::Gte => BinOp::Gte, Token::Lte => BinOp::Lte,
                _ => break,
            };
            self.advance();
            let right = self.parse_addition()?;
            left = Expr::BinOp { op, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    fn parse_addition(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_multiplication()?;
        loop {
            let op = match self.cur() {
                Token::Plus => BinOp::Add, Token::Minus => BinOp::Sub,
                _ => break,
            };
            self.advance();
            let right = self.parse_multiplication()?;
            left = Expr::BinOp { op, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    fn parse_multiplication(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_unary()?;
        loop {
            let op = match self.cur() {
                Token::Star => BinOp::Mul, Token::Slash => BinOp::Div, Token::Percent => BinOp::Mod,
                _ => break,
            };
            self.advance();
            let right = self.parse_unary()?;
            left = Expr::BinOp { op, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        match self.cur() {
            Token::Minus => {
                self.advance();
                let expr = self.parse_postfix()?;
                Ok(Expr::UnaryOp { op: UnaryOp::Neg, expr: Box::new(expr) })
            }
            Token::Not => {
                self.advance();
                let expr = self.parse_postfix()?;
                Ok(Expr::UnaryOp { op: UnaryOp::Not, expr: Box::new(expr) })
            }
            _ => self.parse_postfix()
        }
    }

    fn parse_postfix(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_primary()?;
        loop {
            match self.cur() {
                Token::LBrack => {
                    self.advance();
                    let index = self.parse_expr()?;
                    self.expect(&Token::RBrack)?;
                    expr = Expr::Index { target: Box::new(expr), index: Box::new(index) };
                }
                Token::Dot => {
                    self.advance();
                    let field = self.eat_ident()?;
                    expr = Expr::Field { target: Box::new(expr), field };
                }
                _ => break,
            }
        }
        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        match self.cur().clone() {
            Token::IntLit(v) => { self.advance(); Ok(Expr::IntLit(v)) }
            Token::FloatLit(v) => { self.advance(); Ok(Expr::FloatLit(v)) }
            Token::StrLit(s) => { self.advance(); Ok(Expr::StrLit(s)) }
            Token::TritTi => { self.advance(); Ok(Expr::TritLit(1)) }
            Token::TritOm => { self.advance(); Ok(Expr::TritLit(0)) }
            Token::TritTa => { self.advance(); Ok(Expr::TritLit(-1)) }

            // 온톨로직 표현식
            Token::KwState => {
                self.advance();
                self.expect(&Token::LParen)?;
                let e = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                Ok(Expr::StateOf(Box::new(e)))
            }
            Token::KwConfidence => {
                self.advance();
                self.expect(&Token::LParen)?;
                let e = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                Ok(Expr::ConfidenceOf(Box::new(e)))
            }
            Token::KwDecide => {
                self.advance();
                self.expect(&Token::LParen)?;
                let claim = self.parse_expr()?;
                self.expect(&Token::Comma)?;
                let goal_fit = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                Ok(Expr::Decide { claim: Box::new(claim), goal_fit: Box::new(goal_fit) })
            }

            // 배열 리터럴
            Token::LBrack => {
                self.advance();
                let mut elems = Vec::new();
                if !matches!(self.cur(), Token::RBrack) {
                    elems.push(self.parse_expr()?);
                    while matches!(self.cur(), Token::Comma) {
                        self.advance();
                        if matches!(self.cur(), Token::RBrack) { break; }
                        elems.push(self.parse_expr()?);
                    }
                }
                self.expect(&Token::RBrack)?;
                Ok(Expr::ArrayLit(elems))
            }

            // 그룹 / 괄호
            Token::LParen => {
                self.advance();
                let e = self.parse_expr()?;
                self.expect(&Token::RParen)?;
                Ok(e)
            }

            // 식별자 또는 함수 호출
            Token::Ident(name) => {
                self.advance();
                if matches!(self.cur(), Token::LParen) {
                    self.advance();
                    let args = self.parse_args()?;
                    self.expect(&Token::RParen)?;
                    Ok(Expr::Call { func: name, args })
                } else {
                    Ok(Expr::Ident(name))
                }
            }

            t => Err(format!("표현식 기대, 실제: {:?}", t))
        }
    }
}
