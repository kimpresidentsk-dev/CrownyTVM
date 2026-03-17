use super::낱말::낱말;
pub struct 읽개 { 원천: Vec<char>, 위치: usize }
impl 읽개 {
    pub fn 새것(s: &str) -> Self { 읽개 { 원천: s.chars().collect(), 위치: 0 } }
    fn 현재(&self) -> char { self.원천.get(self.위치).copied().unwrap_or('\0') }
    fn 다음(&self) -> char { self.원천.get(self.위치+1).copied().unwrap_or('\0') }
    fn 전진(&mut self) { self.위치 += 1; }
    fn 끝(&self) -> bool { self.위치 >= self.원천.len() }

    pub fn 분석(&mut self) -> Result<Vec<낱말>, String> {
        let mut r = Vec::new();
        while !self.끝() {
            let c = self.현재();
            if c.is_whitespace() { self.전진(); continue; }
            if c == '/' && self.다음() == '/' { while !self.끝() && self.현재() != '\n' { self.전진(); } continue; }
            if c == '"' { r.push(self.문자열()?); continue; }
            if c.is_ascii_digit() { r.push(self.숫자()); continue; }
            if c.is_alphabetic() || c == '_' || "▲●▼◆".contains(c) { r.push(self.이름()); continue; }
            r.push(self.기호()?);
        }
        r.push(낱말::끝); Ok(r)
    }
    fn 문자열(&mut self) -> Result<낱말, String> {
        self.전진(); let mut s = String::new();
        while !self.끝() && self.현재() != '"' {
            if self.현재() == '\\' {
                self.전진();
                match self.현재() { 'n'=>s.push('\n'), 't'=>s.push('\t'), '\\'=>s.push('\\'), '"'=>s.push('"'), c=>s.push(c) }
            } else { s.push(self.현재()); }
            self.전진();
        }
        if self.끝() { return Err("문자열 미닫힘".into()); }
        self.전진(); Ok(낱말::문자열(s))
    }
    fn 숫자(&mut self) -> 낱말 {
        let mut s = String::new();
        while !self.끝() && (self.현재().is_ascii_digit() || self.현재() == '.') { s.push(self.현재()); self.전진(); }
        if s.contains('.') { 낱말::실수(s.parse().unwrap_or(0.0)) } else { 낱말::정수(s.parse().unwrap_or(0)) }
    }
    fn 이름(&mut self) -> 낱말 {
        let mut s = String::new();
        while !self.끝() && (self.현재().is_alphanumeric() || self.현재() == '_' || "▲●▼◆".contains(self.현재())) { s.push(self.현재()); self.전진(); }
        match s.as_str() {
            "티"|"▲"|"참" => 낱말::티, "옴"|"●"|"보류" => 낱말::옴, "타"|"▼"|"거짓" => 낱말::타,
            "확정" => 낱말::확정, "미확인" => 낱말::미확인, "오해" => 낱말::오해, "미인지" => 낱말::미인지,
            "변수" => 낱말::변수, "함수" => 낱말::함수, "반환" => 낱말::반환,
            "만약" => 낱말::만약, "아니면" => 낱말::아니면, "동안" => 낱말::동안,
            "출력" => 낱말::출력, "출력값" => 낱말::출력값,
            "주장" => 낱말::주장, "근거" => 낱말::근거, "전이" => 낱말::전이,
            "연결" => 낱말::연결, "판정" => 낱말::판정,
            "양이면" => 낱말::양이면, "중이면" => 낱말::중이면, "음이면" => 낱말::음이면,
            "읽기" => 낱말::읽기, "쓰기" => 낱말::쓰기, "덧쓰기" => 낱말::덧쓰기, "파일존재" => 낱말::파일존재,
            "가져오기" => 낱말::가져오기,
            "글자수" => 낱말::글자수, "포함" => 낱말::포함, "대문자" => 낱말::대문자, "소문자" => 낱말::소문자,
            "글자" => 낱말::글자, "부분" => 낱말::부분, "숫자변환" => 낱말::숫자변환, "문자열변환" => 낱말::문자열변환,
            "추가" => 낱말::추가, "길이" => 낱말::길이, "설정" => 낱말::설정,
            "각각" => 낱말::각각, "입력" => 낱말::입력,
            _ => 낱말::이름(s),
        }
    }
    fn 기호(&mut self) -> Result<낱말, String> {
        let c = self.현재(); self.전진();
        Ok(match c {
            '+' => 낱말::더하기, '-' => 낱말::빼기, '*' => 낱말::곱하기, '/' => 낱말::나누기, '%' => 낱말::나머지기호,
            '=' => if self.현재()=='=' { self.전진(); 낱말::같음 } else { 낱말::대입 },
            '!' => if self.현재()=='=' { self.전진(); 낱말::다름 } else { 낱말::부정 },
            '>' => if self.현재()=='=' { self.전진(); 낱말::크거나같다 } else { 낱말::크다 },
            '<' => if self.현재()=='=' { self.전진(); 낱말::작거나같다 } else { 낱말::작다 },
            '&' => { if self.현재()=='&' { self.전진(); } 낱말::그리고 }
            '|' => { if self.현재()=='|' { self.전진(); } 낱말::또는 }
            '~' => { if self.현재()=='~' { self.전진(); } 낱말::합의 }
            '(' => 낱말::왼괄호, ')' => 낱말::오른괄호,
            '{' => 낱말::왼중괄호, '}' => 낱말::오른중괄호,
            '[' => 낱말::왼대괄호, ']' => 낱말::오른대괄호,
            ',' => 낱말::쉼표, '.' => 낱말::점,
            _ => return Err(format!("알 수 없는 문자: '{}'", c)),
        })
    }
}
