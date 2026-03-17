use std::collections::HashMap;
use crate::한선씨::구문::노드;
use crate::삼진VM::핵심::{명령어, ACC};

const 변수시작: i64 = 200;

pub struct 삼진짜개 {
    명령들: Vec<명령어>,
    변수맵: HashMap<String, i64>,
    다음변수: i64,
    함수맵: HashMap<String, usize>,
    pub 문자열들: Vec<String>,
    임시: usize,
}

impl 삼진짜개 {
    pub fn 새것() -> Self {
        삼진짜개 { 명령들: Vec::new(), 변수맵: HashMap::new(), 다음변수: 변수시작,
                  함수맵: HashMap::new(), 문자열들: Vec::new(), 임시: 0 }
    }
    fn 추가(&mut self, m: 명령어) -> usize { let i = self.명령들.len(); self.명령들.push(m); i }
    fn 현재(&self) -> usize { self.명령들.len() }
    fn 임시(&mut self) -> i64 { let r = self.임시 as i64; self.임시 = (self.임시+1).min(7); r }
    fn 임시해제(&mut self) { if self.임시 > 0 { self.임시 -= 1; } }
    fn 변수주소(&mut self, n: &str) -> i64 {
        if let Some(&a) = self.변수맵.get(n) { a }
        else { let a = self.다음변수; self.다음변수 += 1; self.변수맵.insert(n.into(), a); a }
    }
    fn 문자열(&mut self, s: &str) -> i64 { let h = self.문자열들.len() as i64+10000; self.문자열들.push(s.into()); h }

    pub fn 생성(&mut self, ast: &노드) -> Result<(Vec<명령어>, Vec<String>), String> {
        let jmp = self.추가(명령어::A(54, 0));
        if let 노드::블록(stmts) = ast {
            for s in stmts {
                if let 노드::함수(이름, 인자들, 본문) = s {
                    let addr = self.현재();
                    self.함수맵.insert(이름.clone(), addr);
                    // 함수 프롤로그: 복귀주소를 r8에 저장 (CALL이 스택에 넣은 것)
                    self.추가(명령어::A(23, 8));  // POP r8 (복귀주소)
                    // 인자를 스택에서 꺼내 메모리에 (역순)
                    for p in 인자들.iter().rev() {
                        let a = self.변수주소(p);
                        self.추가(명령어::A(23, 0));        // POP r0
                        self.추가(명령어::B(19, a, 0));     // STORE [a], r0
                    }
                    self.노드(본문)?;
                    // 에필로그: 복귀주소를 다시 스택에 넣고 RET
                    self.추가(명령어::A(22, 8));  // PUSH r8 (복귀주소)
                    self.추가(명령어::Z(60));     // RET
                }
            }
        }
        let main_addr = self.현재();
        self.명령들[jmp] = 명령어::A(54, main_addr as i64);
        if let 노드::블록(stmts) = ast {
            for s in stmts { if !matches!(s, 노드::함수(..)) { self.노드(s)?; } }
        }
        self.추가(명령어::Z(61));
        Ok((self.명령들.clone(), self.문자열들.clone()))
    }

    fn cmp_zero(&mut self) {
        let zr = self.임시();
        self.추가(명령어::B(24, zr, 0));
        self.추가(명령어::B(49, ACC as i64, zr));
        self.임시해제();
    }

    fn 노드(&mut self, n: &노드) -> Result<(), String> {
        match n {
            노드::정수(v) => { self.추가(명령어::A(8, *v)); }
            노드::실수(v) => { self.추가(명령어::A(8, *v as i64)); }
            노드::문자열(s) => { let h = self.문자열(s); self.추가(명령어::A(8, h)); }
            노드::삼진(v) => { self.추가(명령어::A(8, *v as i64)); }
            노드::이름(nm) => { let a = self.변수주소(nm); self.추가(명령어::B(18, ACC as i64, a)); }

            노드::이항(l, op, r) => {
                self.노드(l)?;
                let lr = self.임시();
                self.추가(명령어::B(20, lr, ACC as i64));
                self.노드(r)?;
                let rr = self.임시();
                self.추가(명령어::B(20, rr, ACC as i64));
                match op.as_str() {
                    "+"=>{ self.추가(명령어::C(36, ACC as i64, lr, rr)); }
                    "-"=>{ self.추가(명령어::C(37, ACC as i64, lr, rr)); }
                    "*"=>{ self.추가(명령어::C(38, ACC as i64, lr, rr)); }
                    "/"=>{ self.추가(명령어::C(39, ACC as i64, lr, rr)); }
                    "%"=>{ self.추가(명령어::C(40, ACC as i64, lr, rr)); }
                    "=="=>{ self.추가(명령어::B(45, lr, rr)); }
                    "!="=>{ self.추가(명령어::B(46, lr, rr)); }
                    ">"=>{ self.추가(명령어::B(47, lr, rr)); }
                    "<"=>{ self.추가(명령어::B(48, lr, rr)); }
                    ">="=>{ self.추가(명령어::B(48, lr, rr)); self.추가(명령어::Z(9)); }
                    "<="=>{ self.추가(명령어::B(47, lr, rr)); self.추가(명령어::Z(9)); }
                    "&&"=>{ self.추가(명령어::B(10, lr, rr)); }
                    "||"=>{ self.추가(명령어::B(11, lr, rr)); }
                    "~~"=>{ self.추가(명령어::B(12, lr, rr)); }
                    _ => return Err(format!("알 수 없는 연산: {}", op)),
                }
                self.임시해제(); self.임시해제();
            }
            노드::단항(op, t) => { self.노드(t)?; if op=="!" { self.추가(명령어::Z(9)); } }

            노드::변수(nm, v) | 노드::대입(nm, v) => {
                self.노드(v)?;
                let a = self.변수주소(nm);
                self.추가(명령어::B(19, a, ACC as i64));
            }

            노드::만약(cond, then, els) => {
                self.노드(cond)?; self.cmp_zero();
                if let Some(el) = els {
                    let jf = self.추가(명령어::A(56, 0));
                    let jn = self.추가(명령어::A(57, 0));
                    self.노드(then)?;
                    let je = self.추가(명령어::A(54, 0));
                    let fa = self.현재();
                    self.노드(el)?;
                    let ea = self.현재();
                    self.명령들[jf] = 명령어::A(56, fa as i64);
                    self.명령들[jn] = 명령어::A(57, fa as i64);
                    self.명령들[je] = 명령어::A(54, ea as i64);
                } else {
                    let jf = self.추가(명령어::A(56, 0));
                    let jn = self.추가(명령어::A(57, 0));
                    self.노드(then)?;
                    let ea = self.현재();
                    self.명령들[jf] = 명령어::A(56, ea as i64);
                    self.명령들[jn] = 명령어::A(57, ea as i64);
                }
            }

            노드::판정(cond, pos, mid, neg) => {
                self.노드(cond)?; self.cmp_zero();
                let if3 = self.추가(명령어::C(58, 0, 0, 0));
                self.노드(mid)?;
                let jm = self.추가(명령어::A(54, 0));
                let pa = self.현재();
                self.노드(pos)?;
                let jp = self.추가(명령어::A(54, 0));
                let na = self.현재();
                self.노드(neg)?;
                let ea = self.현재();
                self.명령들[if3] = 명령어::C(58, 0, pa as i64, na as i64);
                self.명령들[jm] = 명령어::A(54, ea as i64);
                self.명령들[jp] = 명령어::A(54, ea as i64);
            }

            노드::동안(cond, body) => {
                let start = self.현재();
                self.노드(cond)?; self.cmp_zero();
                let jf = self.추가(명령어::A(56, 0));
                let jn = self.추가(명령어::A(57, 0));
                self.노드(body)?;
                self.추가(명령어::A(54, start as i64));
                let ea = self.현재();
                self.명령들[jf] = 명령어::A(56, ea as i64);
                self.명령들[jn] = 명령어::A(57, ea as i64);
            }

            노드::블록(stmts) => { for s in stmts { self.노드(s)?; } }
            노드::함수(..) => {}

            노드::호출(nm, args) => {
                for a in args { self.노드(a)?; self.추가(명령어::A(22, ACC as i64)); }
                if let Some(&addr) = self.함수맵.get(nm) {
                    self.추가(명령어::A(59, addr as i64));
                }
            }

            노드::반환(v) => { self.노드(v)?; self.추가(명령어::A(22, 8)); self.추가(명령어::Z(60)); }
            노드::출력(v) | 노드::출력값(v) => { self.노드(v)?; self.추가(명령어::A(72, ACC as i64)); }
            _ => {}
        }
        Ok(())
    }
}
