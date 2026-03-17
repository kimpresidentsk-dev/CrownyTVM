// ═══════════════════════════════════════════════════════════════
// 한선씨 렉서 — 한국어/영어 이중 키워드 토큰화
// ═══════════════════════════════════════════════════════════════

use super::token::Token;

pub struct Lexer {
    chars: Vec<char>,
    pos: usize,
}

impl Lexer {
    pub fn new(source: &str) -> Self {
        Lexer { chars: source.chars().collect(), pos: 0 }
    }

    pub fn tokenize(&mut self) -> Result<Vec<Token>, String> {
        let mut tokens = Vec::new();
        while self.pos < self.chars.len() {
            self.skip_whitespace();
            if self.pos >= self.chars.len() { break; }

            let ch = self.chars[self.pos];

            // 주석: // 부터 줄 끝까지
            if ch == '/' && self.peek_next() == Some('/') {
                while self.pos < self.chars.len() && self.chars[self.pos] != '\n' {
                    self.pos += 1;
                }
                continue;
            }

            // 숫자
            if ch.is_ascii_digit() {
                tokens.push(self.read_number());
                continue;
            }

            // 문자열
            if ch == '"' {
                tokens.push(self.read_string()?);
                continue;
            }

            // 식별자/키워드 (한글 또는 ASCII 알파벳 또는 _)
            if self.is_ident_start(ch) {
                tokens.push(self.read_ident());
                continue;
            }

            // 연산자/구두점
            match ch {
                '+' => { self.pos += 1; tokens.push(Token::Plus); }
                '-' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '>' {
                        self.pos += 1; tokens.push(Token::Arrow);
                    } else { tokens.push(Token::Minus); }
                }
                '*' => { self.pos += 1; tokens.push(Token::Star); }
                '/' => { self.pos += 1; tokens.push(Token::Slash); }
                '%' => { self.pos += 1; tokens.push(Token::Percent); }
                '=' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.pos += 1; tokens.push(Token::Eq);
                    } else if self.pos < self.chars.len() && self.chars[self.pos] == '>' {
                        self.pos += 1; tokens.push(Token::FatArrow);
                    } else { tokens.push(Token::Assign); }
                }
                '!' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.pos += 1; tokens.push(Token::Neq);
                    } else { tokens.push(Token::Not); }
                }
                '>' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.pos += 1; tokens.push(Token::Gte);
                    } else { tokens.push(Token::Gt); }
                }
                '<' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.pos += 1; tokens.push(Token::Lte);
                    } else { tokens.push(Token::Lt); }
                }
                '.' => {
                    self.pos += 1;
                    if self.pos < self.chars.len() && self.chars[self.pos] == '.' {
                        self.pos += 1; tokens.push(Token::DotDot);
                    } else { tokens.push(Token::Dot); }
                }
                ',' => { self.pos += 1; tokens.push(Token::Comma); }
                ':' => { self.pos += 1; tokens.push(Token::Colon); }
                ';' => { self.pos += 1; tokens.push(Token::Semicolon); }
                '(' => { self.pos += 1; tokens.push(Token::LParen); }
                ')' => { self.pos += 1; tokens.push(Token::RParen); }
                '[' => { self.pos += 1; tokens.push(Token::LBrack); }
                ']' => { self.pos += 1; tokens.push(Token::RBrack); }
                '{' => { self.pos += 1; tokens.push(Token::LBrace); }
                '}' => { self.pos += 1; tokens.push(Token::RBrace); }
                '\n' => { self.pos += 1; /* 개행 무시 (문법은 중괄호 기반) */ }
                _ => {
                    return Err(format!("알 수 없는 문자: '{}' (U+{:04X})", ch, ch as u32));
                }
            }
        }
        tokens.push(Token::Eof);
        Ok(tokens)
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.chars.len() {
            let ch = self.chars[self.pos];
            if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
                self.pos += 1;
            } else { break; }
        }
    }

    fn peek_next(&self) -> Option<char> {
        self.chars.get(self.pos + 1).copied()
    }

    fn is_ident_start(&self, ch: char) -> bool {
        ch.is_alphabetic() || ch == '_' || ('\u{AC00}'..='\u{D7AF}').contains(&ch)
            || ('\u{3131}'..='\u{318E}').contains(&ch)
    }

    fn is_ident_continue(&self, ch: char) -> bool {
        self.is_ident_start(ch) || ch.is_ascii_digit() || ch == '_'
    }

    fn read_number(&mut self) -> Token {
        let start = self.pos;
        let mut is_float = false;
        while self.pos < self.chars.len() && (self.chars[self.pos].is_ascii_digit() || self.chars[self.pos] == '.') {
            if self.chars[self.pos] == '.' {
                // 구분: 1..2 (범위) vs 1.2 (소수)
                if self.pos + 1 < self.chars.len() && self.chars[self.pos + 1] == '.' {
                    break;
                }
                if is_float { break; }
                is_float = true;
            }
            self.pos += 1;
        }
        let s: String = self.chars[start..self.pos].iter().collect();
        if is_float { Token::FloatLit(s.parse().unwrap_or(0.0)) }
        else { Token::IntLit(s.parse().unwrap_or(0)) }
    }

    fn read_string(&mut self) -> Result<Token, String> {
        self.pos += 1; // skip opening "
        let mut s = String::new();
        while self.pos < self.chars.len() && self.chars[self.pos] != '"' {
            if self.chars[self.pos] == '\\' {
                self.pos += 1;
                if self.pos >= self.chars.len() { return Err("문자열 이스케이프 미완료".into()); }
                match self.chars[self.pos] {
                    'n' => s.push('\n'),
                    't' => s.push('\t'),
                    '\\' => s.push('\\'),
                    '"' => s.push('"'),
                    c => { s.push('\\'); s.push(c); }
                }
            } else {
                s.push(self.chars[self.pos]);
            }
            self.pos += 1;
        }
        if self.pos >= self.chars.len() { return Err("문자열 닫힘 없음".into()); }
        self.pos += 1; // skip closing "
        Ok(Token::StrLit(s))
    }

    fn read_ident(&mut self) -> Token {
        let start = self.pos;
        while self.pos < self.chars.len() && self.is_ident_continue(self.chars[self.pos]) {
            self.pos += 1;
        }
        // 특수: 만약3 — 숫자가 키워드 일부인 경우
        if self.pos < self.chars.len() && self.chars[self.pos].is_ascii_digit() {
            let word_so_far: String = self.chars[start..self.pos].iter().collect();
            if word_so_far == "만약" || word_so_far == "if" {
                self.pos += 1;
            }
        }
        let word: String = self.chars[start..self.pos].iter().collect();
        Token::from_keyword(&word).unwrap_or(Token::Ident(word))
    }
}
