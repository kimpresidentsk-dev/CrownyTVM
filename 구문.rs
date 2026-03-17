use super::낱말::낱말;

#[derive(Debug, Clone)]
pub enum 노드 {
    정수(i64), 실수(f64), 문자열(String), 이름(String),
    삼진(i8), 인식(String),
    이항(Box<노드>, String, Box<노드>),
    단항(String, Box<노드>),
    변수(String, Box<노드>),
    대입(String, Box<노드>),
    만약(Box<노드>, Box<노드>, Option<Box<노드>>),
    판정(Box<노드>, Box<노드>, Box<노드>, Box<노드>),
    동안(Box<노드>, Box<노드>),
    블록(Vec<노드>),
    함수(String, Vec<String>, Box<노드>),
    호출(String, Vec<노드>),
    반환(Box<노드>),
    출력(Box<노드>), 출력값(Box<노드>),
    주장(String, Vec<노드>),
    근거(String, Box<노드>),
    전이(String, String),
    // 파일 I/O
    파일읽기(Box<노드>),                          // 읽기(경로)
    파일쓰기(Box<노드>, Box<노드>),                // 쓰기(경로, 내용)
    파일덧쓰기(Box<노드>, Box<노드>),              // 덧쓰기(경로, 내용)
    파일존재(Box<노드>),                           // 파일존재(경로) → 티/타
    // 모듈
    가져오기(String),                              // 가져오기 "경로"
    // 문자열 함수
    내장함수(String, Vec<노드>),                   // 글자수/포함/대문자/소문자(...)
    // 입력
    입력(Box<노드>),                               // 입력("프롬프트")
    // 배열
    배열(Vec<노드>),                               // [1, 2, 3]
    인덱스(Box<노드>, Box<노드>),                   // 배열[n]
}

pub struct 문법파서 { 낱말들: Vec<낱말>, 위치: usize }

impl 문법파서 {
    pub fn 새것(낱말들: Vec<낱말>) -> Self { 문법파서 { 낱말들, 위치: 0 } }
    fn 현재(&self) -> &낱말 { self.낱말들.get(self.위치).unwrap_or(&낱말::끝) }
    fn 전진(&mut self) -> 낱말 { let t = self.현재().clone(); self.위치 += 1; t }
    fn 기대(&mut self, v: &낱말) -> Result<(), String> {
        if self.현재() == v { self.전진(); Ok(()) }
        else { Err(format!("기대:{:?} 실제:{:?} @{}", v, self.현재(), self.위치)) }
    }
    fn 이름얻기(&mut self) -> Result<String, String> {
        match self.전진() { 낱말::이름(s) => Ok(s), t => Err(format!("이름필요:{:?}", t)) }
    }
    fn 인자목록(&mut self) -> Result<Vec<노드>, String> {
        let mut a = Vec::new();
        while *self.현재() != 낱말::오른괄호 && *self.현재() != 낱말::끝 {
            a.push(self.표현식()?);
            if *self.현재() == 낱말::쉼표 { self.전진(); }
        }
        Ok(a)
    }

    pub fn 분석(&mut self) -> Result<노드, String> {
        let mut s = Vec::new();
        while *self.현재() != 낱말::끝 { s.push(self.문장()?); }
        Ok(노드::블록(s))
    }

    fn 문장(&mut self) -> Result<노드, String> {
        match self.현재().clone() {
            낱말::변수 => { self.전진(); let n=self.이름얻기()?; self.기대(&낱말::대입)?; let v=self.표현식()?; Ok(노드::변수(n, Box::new(v))) }
            낱말::함수 => { self.전진(); let n=self.이름얻기()?;
                self.기대(&낱말::왼괄호)?;
                let mut p=Vec::new();
                while *self.현재()!=낱말::오른괄호 { p.push(self.이름얻기()?); if *self.현재()==낱말::쉼표 { self.전진(); } }
                self.기대(&낱말::오른괄호)?;
                let b=self.블록()?; Ok(노드::함수(n, p, Box::new(b))) }
            낱말::만약 => { self.전진(); self.기대(&낱말::왼괄호)?; let c=self.표현식()?; self.기대(&낱말::오른괄호)?;
                let t=self.블록()?;
                let e=if *self.현재()==낱말::아니면 { self.전진(); Some(Box::new(self.블록()?)) } else { None };
                Ok(노드::만약(Box::new(c), Box::new(t), e)) }
            낱말::판정 => { self.전진(); self.기대(&낱말::왼괄호)?; let c=self.표현식()?; self.기대(&낱말::오른괄호)?;
                self.기대(&낱말::왼중괄호)?;
                let (mut po,mut mi,mut ne)=(노드::블록(vec![]),노드::블록(vec![]),노드::블록(vec![]));
                while *self.현재()!=낱말::오른중괄호 && *self.현재()!=낱말::끝 {
                    match self.현재().clone() {
                        낱말::양이면 => { self.전진(); po=self.블록()?; }
                        낱말::중이면 => { self.전진(); mi=self.블록()?; }
                        낱말::음이면 => { self.전진(); ne=self.블록()?; }
                        _ => return Err(format!("판정내 기대:양/중/음이면 실제:{:?}", self.현재())),
                    }
                }
                self.기대(&낱말::오른중괄호)?;
                Ok(노드::판정(Box::new(c), Box::new(po), Box::new(mi), Box::new(ne))) }
            낱말::동안 => { self.전진(); self.기대(&낱말::왼괄호)?; let c=self.표현식()?; self.기대(&낱말::오른괄호)?;
                let b=self.블록()?; Ok(노드::동안(Box::new(c), Box::new(b))) }
            낱말::반환 => { self.전진(); Ok(노드::반환(Box::new(self.표현식()?))) }
            낱말::출력 => { self.전진(); self.기대(&낱말::왼괄호)?; let v=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::출력(Box::new(v))) }
            낱말::출력값 => { self.전진(); self.기대(&낱말::왼괄호)?; let v=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::출력값(Box::new(v))) }
            낱말::주장 => { self.전진(); let n=self.이름얻기()?; self.기대(&낱말::대입)?; self.기대(&낱말::왼괄호)?;
                let a=self.인자목록()?; self.기대(&낱말::오른괄호)?; Ok(노드::주장(n, a)) }
            낱말::근거 => { self.전진(); self.기대(&낱말::왼괄호)?; let n=self.이름얻기()?; self.기대(&낱말::쉼표)?;
                let e=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::근거(n, Box::new(e))) }
            낱말::전이 => { self.전진(); self.기대(&낱말::왼괄호)?; let n=self.이름얻기()?; self.기대(&낱말::쉼표)?;
                let d=self.이름얻기()?; self.기대(&낱말::오른괄호)?; Ok(노드::전이(n, d)) }
            // 파일 I/O
            낱말::읽기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::파일읽기(Box::new(p))) }
            낱말::쓰기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::쉼표)?;
                let c=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::파일쓰기(Box::new(p), Box::new(c))) }
            낱말::덧쓰기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::쉼표)?;
                let c=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::파일덧쓰기(Box::new(p), Box::new(c))) }
            낱말::파일존재 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::파일존재(Box::new(p))) }
            // 모듈
            낱말::가져오기 => { self.전진(); match self.전진() {
                낱말::문자열(s) => Ok(노드::가져오기(s)),
                t => Err(format!("가져오기 뒤 문자열 필요:{:?}", t)),
            }}
            // 이름 + 대입/호출/인덱싱
            낱말::이름(_) => {
                let n=self.이름얻기()?;
                if *self.현재()==낱말::대입 { self.전진(); let v=self.표현식()?; Ok(노드::대입(n, Box::new(v))) }
                else if *self.현재()==낱말::왼괄호 { self.전진(); let a=self.인자목록()?; self.기대(&낱말::오른괄호)?; Ok(노드::호출(n, a)) }
                else if *self.현재()==낱말::왼대괄호 {
                    // 이름[인덱스] 또는 이름[인덱스] = 값
                    self.전진(); let idx=self.표현식()?; self.기대(&낱말::오른대괄호)?;
                    if *self.현재()==낱말::대입 {
                        self.전진(); let v=self.표현식()?;
                        // 배열[n] = v → 설정(배열, n, v) → 배열에 재대입
                        Ok(노드::대입(n.clone(), Box::new(노드::내장함수("설정".into(), vec![노드::이름(n), idx, v]))))
                    } else {
                        Ok(노드::인덱스(Box::new(노드::이름(n)), Box::new(idx)))
                    }
                }
                else { Ok(노드::이름(n)) }
            }
            _ => self.표현식(),
        }
    }

    fn 블록(&mut self) -> Result<노드, String> {
        self.기대(&낱말::왼중괄호)?;
        let mut s=Vec::new();
        while *self.현재()!=낱말::오른중괄호 && *self.현재()!=낱말::끝 { s.push(self.문장()?); }
        self.기대(&낱말::오른중괄호)?; Ok(노드::블록(s))
    }

    fn 표현식(&mut self) -> Result<노드, String> { self.논리() }
    fn 논리(&mut self) -> Result<노드, String> {
        let mut l=self.비교()?;
        loop { let op=match self.현재() { 낱말::그리고=>"&&", 낱말::또는=>"||", 낱말::합의=>"~~", _=>break };
            self.전진(); let r=self.비교()?; l=노드::이항(Box::new(l), op.into(), Box::new(r)); } Ok(l)
    }
    fn 비교(&mut self) -> Result<노드, String> {
        let mut l=self.덧셈()?;
        loop { let op=match self.현재() { 낱말::같음=>"==", 낱말::다름=>"!=", 낱말::크다=>">", 낱말::작다=>"<", 낱말::크거나같다=>">=", 낱말::작거나같다=>"<=", _=>break };
            self.전진(); let r=self.덧셈()?; l=노드::이항(Box::new(l), op.into(), Box::new(r)); } Ok(l)
    }
    fn 덧셈(&mut self) -> Result<노드, String> {
        let mut l=self.곱셈()?;
        loop { let op=match self.현재() { 낱말::더하기=>"+", 낱말::빼기=>"-", _=>break };
            self.전진(); let r=self.곱셈()?; l=노드::이항(Box::new(l), op.into(), Box::new(r)); } Ok(l)
    }
    fn 곱셈(&mut self) -> Result<노드, String> {
        let mut l=self.단항()?;
        loop { let op=match self.현재() { 낱말::곱하기=>"*", 낱말::나누기=>"/", 낱말::나머지기호=>"%", _=>break };
            self.전진(); let r=self.단항()?; l=노드::이항(Box::new(l), op.into(), Box::new(r)); } Ok(l)
    }
    fn 단항(&mut self) -> Result<노드, String> {
        if *self.현재()==낱말::부정 { self.전진(); return Ok(노드::단항("!".into(), Box::new(self.원자()?))); }
        // 단항 마이너스: -x → 0 - x
        if *self.현재()==낱말::빼기 { self.전진(); let v=self.원자()?; return Ok(노드::이항(Box::new(노드::정수(0)), "-".into(), Box::new(v))); }
        self.원자()
    }
    fn 원자(&mut self) -> Result<노드, String> {
        match self.현재().clone() {
            낱말::정수(v) => { self.전진(); Ok(노드::정수(v)) }
            낱말::실수(v) => { self.전진(); Ok(노드::실수(v)) }
            낱말::문자열(s) => { self.전진(); Ok(노드::문자열(s)) }
            낱말::티 => { self.전진(); Ok(노드::삼진(1)) }
            낱말::옴 => { self.전진(); Ok(노드::삼진(0)) }
            낱말::타 => { self.전진(); Ok(노드::삼진(-1)) }
            낱말::확정 => { self.전진(); Ok(노드::인식("확정".into())) }
            낱말::미확인 => { self.전진(); Ok(노드::인식("미확인".into())) }
            낱말::오해 => { self.전진(); Ok(노드::인식("오해".into())) }
            낱말::미인지 => { self.전진(); Ok(노드::인식("미인지".into())) }
            낱말::이름(_) => { let n=self.이름얻기()?;
                if *self.현재()==낱말::왼괄호 { self.전진(); let a=self.인자목록()?; self.기대(&낱말::오른괄호)?;
                    let mut 결과 = 노드::호출(n,a);
                    // 호출 뒤 [인덱스] 체인
                    while *self.현재()==낱말::왼대괄호 { self.전진(); let i=self.표현식()?; self.기대(&낱말::오른대괄호)?;
                        결과 = 노드::인덱스(Box::new(결과), Box::new(i)); }
                    Ok(결과) }
                else if *self.현재()==낱말::왼대괄호 { // 이름[인덱스]
                    let mut 결과 = 노드::이름(n);
                    while *self.현재()==낱말::왼대괄호 { self.전진(); let i=self.표현식()?; self.기대(&낱말::오른대괄호)?;
                        결과 = 노드::인덱스(Box::new(결과), Box::new(i)); }
                    Ok(결과) }
                else { Ok(노드::이름(n)) } }
            // 배열 리터럴 [1, 2, 3]
            낱말::왼대괄호 => { self.전진();
                let mut 요소 = Vec::new();
                while *self.현재()!=낱말::오른대괄호 && *self.현재()!=낱말::끝 {
                    요소.push(self.표현식()?);
                    if *self.현재()==낱말::쉼표 { self.전진(); }
                }
                self.기대(&낱말::오른대괄호)?; Ok(노드::배열(요소)) }
            // 파일 I/O (표현식 위치)
            낱말::읽기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::파일읽기(Box::new(p))) }
            낱말::쓰기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::쉼표)?;
                let c=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::파일쓰기(Box::new(p), Box::new(c))) }
            낱말::덧쓰기 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::쉼표)?;
                let c=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(노드::파일덧쓰기(Box::new(p), Box::new(c))) }
            낱말::파일존재 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::파일존재(Box::new(p))) }
            // 내장함수 (표현식 위치)
            낱말::글자수 | 낱말::대문자 | 낱말::소문자 | 낱말::포함
            | 낱말::글자 | 낱말::부분 | 낱말::숫자변환 | 낱말::문자열변환
            | 낱말::추가 | 낱말::길이 | 낱말::설정 => {
                let 이름 = match self.전진() {
                    낱말::글자수 => "글자수", 낱말::대문자 => "대문자", 낱말::소문자 => "소문자", 낱말::포함 => "포함",
                    낱말::글자 => "글자", 낱말::부분 => "부분", 낱말::숫자변환 => "숫자변환", 낱말::문자열변환 => "문자열변환",
                    낱말::추가 => "추가", 낱말::길이 => "길이", 낱말::설정 => "설정", _ => unreachable!(),
                };
                self.기대(&낱말::왼괄호)?; let a=self.인자목록()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::내장함수(이름.into(), a)) }
            낱말::입력 => { self.전진(); self.기대(&낱말::왼괄호)?; let p=self.표현식()?; self.기대(&낱말::오른괄호)?;
                Ok(노드::입력(Box::new(p))) }
            낱말::왼괄호 => { self.전진(); let e=self.표현식()?; self.기대(&낱말::오른괄호)?; Ok(e) }
            t => Err(format!("예상치못한:{:?} @{}", t, self.위치)),
        }
    }
}
