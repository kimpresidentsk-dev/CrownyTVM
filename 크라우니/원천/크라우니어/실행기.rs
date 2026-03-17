// ═══════════════════════════════════════════════════════════════
// 실행기 — 크라우니어 VM
//
// 스택: 셀값 배열 (경량 — 셀 전체가 아닌 값만)
// 메모리: 온톨로지 기억 (셀 기반)
// 모든 연산이 인식상태를 자동 전파
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use crate::기초::셀::{셀값, 셀};
use crate::기초::티옴타음::인식;
use crate::온톨로지::기억::{기억, 레이어};
use super::명령어::명령;

struct 프레임 {
    복귀주소: usize,
    이름표저장: HashMap<String, u64>,
}

pub struct 실행기 {
    명령들: Vec<명령>,
    스택: Vec<셀값>,
    pub 메모리: 기억,
    프레임들: Vec<프레임>,
    주소: usize,
    pub 출력: Vec<String>,
    pub 직접출력: bool,
}

impl 실행기 {
    pub fn 새것(명령들: Vec<명령>) -> Self {
        실행기 {
            명령들,
            스택: Vec::new(),
            메모리: 기억::새것(),
            프레임들: Vec::new(),
            주소: 0,
            출력: Vec::new(),
            직접출력: false,
        }
    }

    fn 넣기(&mut self, v: 셀값) { self.스택.push(v); }
    fn 빼기(&mut self) -> 셀값 { self.스택.pop().unwrap_or(셀값::없음) }

    /// 인식상태 전파: 두 값 연산 시 더 불확실한 쪽
    fn 인식전파(가: &셀값, 나: &셀값) -> 인식 {
        인식::약한합(가.참인가(), 나.참인가())
    }

    pub fn 실행(&mut self) -> Result<셀값, String> {
        let 명령수 = self.명령들.len();

        while self.주소 < 명령수 {
            let 명령 = self.명령들[self.주소].clone();
            self.주소 += 1;

            match 명령 {
                // ═══ 스택 ═══
                명령::넣기(v) => self.넣기(v),
                명령::빼기 => { self.빼기(); }
                명령::복사 => {
                    if let Some(탑) = self.스택.last() { self.스택.push(탑.clone()); }
                }
                명령::바꾸기 => {
                    let n = self.스택.len();
                    if n >= 2 { self.스택.swap(n-1, n-2); }
                }

                // ═══ 변수 ═══
                명령::저장(이름) => {
                    let 값 = self.빼기();
                    self.메모리.이름쓰기(&이름, 값);
                }
                명령::새저장(이름) => {
                    let 값 = self.빼기();
                    self.메모리.새이름쓰기(&이름, 값);
                }
                명령::불러(이름) => {
                    match self.메모리.이름읽기(&이름) {
                        Some(v) => self.넣기(v),
                        None => return Err(format!("미정의: {}", 이름)),
                    }
                }

                // ═══ 산술 (인식 자동 전파) ═══
                명령::더하기 => {
                    let b = self.빼기(); let a = self.빼기();
                    let r = match (&a, &b) {
                        (셀값::정수(x), 셀값::정수(y)) => 셀값::정수(x + y),
                        (셀값::실수(x), 셀값::실수(y)) => 셀값::실수(x + y),
                        (셀값::정수(x), 셀값::실수(y)) => 셀값::실수(*x as f64 + y),
                        (셀값::실수(x), 셀값::정수(y)) => 셀값::실수(x + *y as f64),
                        (셀값::문자열(x), 셀값::문자열(y)) => 셀값::문자열(format!("{}{}", x, y)),
                        (셀값::문자열(x), _) => 셀값::문자열(format!("{}{}", x, b.문자열로())),
                        _ => 셀값::정수(a.정수로() + b.정수로()),
                    };
                    self.넣기(r);
                }
                명령::빼기연산 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(match (&a, &b) {
                        (셀값::실수(x), 셀값::실수(y)) => 셀값::실수(x - y),
                        _ => 셀값::정수(a.정수로() - b.정수로()),
                    });
                }
                명령::곱하기 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(match (&a, &b) {
                        (셀값::실수(x), 셀값::실수(y)) => 셀값::실수(x * y),
                        _ => 셀값::정수(a.정수로() * b.정수로()),
                    });
                }
                명령::나누기 => {
                    let b = self.빼기(); let a = self.빼기();
                    let d = b.정수로();
                    if d == 0 {
                        self.넣기(셀값::문자열("오류:0나눔".into()));
                    } else {
                        self.넣기(셀값::정수(a.정수로() / d));
                    }
                }
                명령::나머지 => {
                    let b = self.빼기(); let a = self.빼기();
                    let d = b.정수로();
                    if d == 0 { self.넣기(셀값::정수(0)); }
                    else { self.넣기(셀값::정수(a.정수로() % d)); }
                }

                // ═══ 비교 (3진 결과) ═══
                명령::같은가 => {
                    let b = self.빼기(); let a = self.빼기();
                    let eq = match (&a, &b) {
                        (셀값::정수(x), 셀값::정수(y)) => x == y,
                        (셀값::문자열(x), 셀값::문자열(y)) => x == y,
                        _ => a.문자열로() == b.문자열로(),  // 범용: 문자열로 비교
                    };
                    self.넣기(셀값::정수(if eq { 1 } else { -1 }));
                }
                명령::다른가 => {
                    let b = self.빼기(); let a = self.빼기();
                    let ne = match (&a, &b) {
                        (셀값::정수(x), 셀값::정수(y)) => x != y,
                        (셀값::문자열(x), 셀값::문자열(y)) => x != y,
                        _ => a.문자열로() != b.문자열로(),
                    };
                    self.넣기(셀값::정수(if ne { 1 } else { -1 }));
                }
                명령::큰가 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(셀값::정수(if a.실수로() > b.실수로() { 1 } else { -1 }));
                }
                명령::작은가 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(셀값::정수(if a.실수로() < b.실수로() { 1 } else { -1 }));
                }
                명령::크거나같은가 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(셀값::정수(if a.실수로() >= b.실수로() { 1 } else { -1 }));
                }
                명령::작거나같은가 => {
                    let b = self.빼기(); let a = self.빼기();
                    self.넣기(셀값::정수(if a.실수로() <= b.실수로() { 1 } else { -1 }));
                }

                // ═══ 3진 논리 ═══
                명령::삼진부정 => {
                    let v = self.빼기().정수로();
                    self.넣기(셀값::정수(-v.signum()));
                }
                명령::삼진그리고 => {
                    let b = self.빼기().정수로().signum();
                    let a = self.빼기().정수로().signum();
                    self.넣기(셀값::정수(a.min(b)));
                }
                명령::삼진또는 => {
                    let b = self.빼기().정수로().signum();
                    let a = self.빼기().정수로().signum();
                    self.넣기(셀값::정수(a.max(b)));
                }
                명령::삼진합의 => {
                    let b = self.빼기().정수로().signum();
                    let a = self.빼기().정수로().signum();
                    self.넣기(셀값::정수(if a == b { a } else { 0 }));
                }
                명령::삼진비교 => {
                    let b = self.빼기(); let a = self.빼기();
                    let av = a.실수로();
                    let bv = b.실수로();
                    self.넣기(셀값::정수(if av > bv { 1 } else if av < bv { -1 } else { 0 }));
                }

                // ═══ 흐름 ═══
                명령::세갈래(양주소, 음주소) => {
                    let v = self.빼기().정수로();
                    if v > 0 { self.주소 = 양주소; }
                    else if v < 0 { self.주소 = 음주소; }
                    // v == 0: 다음으로 진행 (옴)
                }
                명령::이동(주소) => { self.주소 = 주소; }
                명령::조건이동(주소) => {
                    if self.빼기().정수로() > 0 { self.주소 = 주소; }
                }
                명령::함수시작 => { /* 마커 */ }
                명령::호출(인자수) => {
                    let 함수주소 = match self.빼기() {
                        셀값::정수(a) => a as usize,
                        _ => return Err("함수가 아님".into()),
                    };
                    self.프레임들.push(프레임 {
                        복귀주소: self.주소,
                        이름표저장: self.메모리.현재이름표(),
                    });
                    let _ = 인자수; // 인자는 코드젠이 STORE로 처리
                    self.주소 = 함수주소;
                }
                명령::돌아가기 => {
                    if let Some(f) = self.프레임들.pop() {
                        self.주소 = f.복귀주소;
                        self.메모리.이름표복원(f.이름표저장);
                    }
                }
                명령::정지 => break,

                // ═══ 인식 (온톨로지) ═══
                명령::인식전진 => {
                    let 이름 = self.빼기().문자열로();
                    if let Some(셀) = self.메모리.이름셀_mut(&이름) {
                        let 새 = 셀.인식상태().전진();
                        셀.슬롯[crate::기초::셀::슬롯_인식] = 셀값::인식값(새);
                    }
                }
                명령::인식후퇴 => {
                    let 이름 = self.빼기().문자열로();
                    if let Some(셀) = self.메모리.이름셀_mut(&이름) {
                        let 새 = 셀.인식상태().후퇴();
                        셀.슬롯[crate::기초::셀::슬롯_인식] = 셀값::인식값(새);
                    }
                }
                명령::인식반전 => {
                    let 이름 = self.빼기().문자열로();
                    if let Some(셀) = self.메모리.이름셀_mut(&이름) {
                        let 새 = 셀.인식상태().반전();
                        셀.슬롯[crate::기초::셀::슬롯_인식] = 셀값::인식값(새);
                    }
                }
                명령::인식조회 => {
                    let 이름 = self.빼기().문자열로();
                    let 상태 = self.메모리.이름셀(&이름)
                        .map(|c| c.인식상태())
                        .unwrap_or(인식::음);
                    self.넣기(셀값::문자열(format!("{}", 상태)));
                }

                // ═══ 주장 ═══
                명령::주장생성 => {
                    let 인식값 = self.빼기();
                    let 대상 = self.빼기().문자열로();
                    let 술어 = self.빼기().문자열로();
                    let 주체 = self.빼기().문자열로();
                    let 상태 = match 인식값 {
                        셀값::인식값(i) => i,
                        셀값::정수(1) => 인식::티,
                        셀값::정수(0) => 인식::옴,
                        셀값::정수(-1) => 인식::타,
                        _ => 인식::음,
                    };
                    let id = self.메모리.주장추가(&주체, &술어, &대상, 상태, 레이어::코어);
                    self.넣기(셀값::셀참조(id));
                }
                명령::근거추가 => {
                    let 이름 = self.빼기().문자열로();
                    let 증거 = self.메모리.값추가(셀값::문자열("증거".into()));
                    if let Some(셀) = self.메모리.이름셀_mut(&이름) {
                        셀.근거추가(증거);
                    }
                }
                명령::결정점수 => {
                    let 위험 = self.빼기().실수로();
                    let 가능 = self.빼기().실수로();
                    let 적합 = self.빼기().실수로();
                    let 이름 = self.빼기().문자열로();
                    let 점수 = self.메모리.이름셀(&이름)
                        .map(|c| c.결정점수(적합, 가능, 위험))
                        .unwrap_or(0.0);
                    self.넣기(셀값::실수(점수));
                }
                명령::연결(방향) => {
                    let 대상이름 = self.빼기().문자열로();
                    let 원천이름 = self.빼기().문자열로();
                    // 방향: "티", "옴", "타", "음"
                    let 방향 = match 방향.as_str() {
                        "티" | "상위" => 인식::티,
                        "옴" | "현재" => 인식::옴,
                        "타" | "하위" => 인식::타,
                        _ => 인식::음,
                    };
                    if let (Some(원천), Some(대상)) = (
                        self.메모리.이름표.get(&원천이름).copied(),
                        self.메모리.이름표.get(&대상이름).copied()
                    ) {
                        self.메모리.연결(원천, 대상, 방향);
                    }
                }

                // ═══ 체계 ═══
                명령::출력 => {
                    let v = self.빼기();
                    // 인식상태 포함 출력 (셀이 있으면 셀 형식)
                    let s = match &v {
                        셀값::셀참조(id) => {
                            self.메모리.셀찾기(*id).map(|c| format!("{}", c)).unwrap_or(v.문자열로())
                        }
                        _ => {
                            // 이름표에서 셀을 찾아 인식상태 포함 출력
                            format!("[▲ {}]", v.문자열로())
                        }
                    };
                    if self.직접출력 { println!("{}", s); }
                    else { self.출력.push(s); }
                }
                명령::출력값 => {
                    let v = self.빼기();
                    let s = v.문자열로();
                    if self.직접출력 { println!("{}", s); }
                    else { self.출력.push(s); }
                }
                명령::묶음만들기(크기) => {
                    let mut 요소 = Vec::new();
                    for _ in 0..크기 { 요소.push(self.빼기().문자열로()); }
                    요소.reverse();
                    self.넣기(셀값::문자열(format!("[{}]", 요소.join(", "))));
                }
                명령::묶음꺼내기 => {
                    let _인덱스 = self.빼기();
                    let _묶음 = self.빼기();
                    self.넣기(셀값::없음); // TODO: 확장
                }

                // ═══ 파일 I/O ═══
                명령::파일읽기 => {
                    let 경로 = self.빼기().문자열로();
                    match std::fs::read_to_string(&경로) {
                        Ok(내용) => self.넣기(셀값::문자열(내용)),
                        Err(e) => self.넣기(셀값::문자열(format!("오류:{}", e))),
                    }
                }
                명령::파일쓰기 => {
                    let 내용 = self.빼기().문자열로();
                    let 경로 = self.빼기().문자열로();
                    match std::fs::write(&경로, &내용) {
                        Ok(_) => self.넣기(셀값::정수(1)),   // 티(성공)
                        Err(_) => self.넣기(셀값::정수(-1)), // 타(실패)
                    }
                }
                명령::파일덧쓰기 => {
                    let 내용 = self.빼기().문자열로();
                    let 경로 = self.빼기().문자열로();
                    use std::io::Write;
                    match std::fs::OpenOptions::new().append(true).create(true).open(&경로) {
                        Ok(mut f) => {
                            match f.write_all(내용.as_bytes()) {
                                Ok(_) => self.넣기(셀값::정수(1)),
                                Err(_) => self.넣기(셀값::정수(-1)),
                            }
                        }
                        Err(_) => self.넣기(셀값::정수(-1)),
                    }
                }
                명령::파일존재 => {
                    let 경로 = self.빼기().문자열로();
                    let 존재 = std::path::Path::new(&경로).exists();
                    self.넣기(셀값::정수(if 존재 { 1 } else { -1 }));
                }

                // ═══ 문자열 내장 ═══
                명령::문자열글자수 => {
                    let s = self.빼기().문자열로();
                    self.넣기(셀값::정수(s.chars().count() as i64));
                }
                명령::문자열포함 => {
                    let 검색 = self.빼기().문자열로();
                    let 대상 = self.빼기().문자열로();
                    self.넣기(셀값::정수(if 대상.contains(&검색) { 1 } else { -1 }));
                }
                명령::문자열대문자 => {
                    let s = self.빼기().문자열로();
                    self.넣기(셀값::문자열(s.to_uppercase()));
                }
                명령::문자열소문자 => {
                    let s = self.빼기().문자열로();
                    self.넣기(셀값::문자열(s.to_lowercase()));
                }

                // ═══ 입력 ═══
                명령::사용자입력 => {
                    let 프롬프트 = self.빼기().문자열로();
                    if self.직접출력 {
                        eprint!("{}", 프롬프트);
                        let _ = std::io::Write::flush(&mut std::io::stderr());
                    }
                    let mut 줄 = String::new();
                    match std::io::stdin().read_line(&mut 줄) {
                        Ok(0) => self.넣기(셀값::문자열(String::new())),
                        Ok(_) => self.넣기(셀값::문자열(줄.trim().to_string())),
                        Err(_) => self.넣기(셀값::문자열(String::new())),
                    }
                }

                // ═══ 셀프호스팅용: 문자열 ═══
                명령::문자열글자 => {
                    // 스택: [인덱스, 문자열] → 한 글자
                    let 인덱스 = self.빼기().정수로() as usize;
                    let 문자열 = self.빼기().문자열로();
                    let 결과 = 문자열.chars().nth(인덱스)
                        .map(|c| c.to_string())
                        .unwrap_or_default();
                    self.넣기(셀값::문자열(결과));
                }
                명령::문자열부분 => {
                    // 스택: [끝, 시작, 문자열] → 부분문자열
                    let 끝 = self.빼기().정수로() as usize;
                    let 시작 = self.빼기().정수로() as usize;
                    let 문자열 = self.빼기().문자열로();
                    let 글자들: Vec<char> = 문자열.chars().collect();
                    let 끝실제 = 끝.min(글자들.len());
                    let 시작실제 = 시작.min(끝실제);
                    let 결과: String = 글자들[시작실제..끝실제].iter().collect();
                    self.넣기(셀값::문자열(결과));
                }
                명령::숫자변환 => {
                    // 스택: [문자열] → 정수
                    let s = self.빼기().문자열로();
                    match s.trim().parse::<i64>() {
                        Ok(v) => self.넣기(셀값::정수(v)),
                        Err(_) => match s.trim().parse::<f64>() {
                            Ok(v) => self.넣기(셀값::실수(v)),
                            Err(_) => self.넣기(셀값::정수(0)),
                        }
                    }
                }
                명령::문자열변환 => {
                    // 스택: [값] → 문자열
                    let v = self.빼기();
                    self.넣기(셀값::문자열(v.문자열로()));
                }

                // ═══ 배열 ═══
                명령::배열생성(크기) => {
                    let mut 요소 = Vec::new();
                    for _ in 0..크기 { 요소.push(self.빼기()); }
                    요소.reverse();
                    self.넣기(셀값::배열(요소));
                }
                명령::배열읽기 => {
                    // 스택: [인덱스, 배열] → 값
                    let 인덱스 = self.빼기().정수로() as usize;
                    let 배열 = self.빼기();
                    match 배열 {
                        셀값::배열(a) => {
                            self.넣기(a.get(인덱스).cloned().unwrap_or(셀값::없음));
                        }
                        셀값::문자열(s) => {
                            // 문자열도 인덱싱 가능: "abc"[1] → "b"
                            let c = s.chars().nth(인덱스).map(|c| c.to_string()).unwrap_or_default();
                            self.넣기(셀값::문자열(c));
                        }
                        _ => self.넣기(셀값::없음),
                    }
                }
                명령::배열추가 => {
                    // 스택: [값, 배열] → 새배열
                    let 값 = self.빼기();
                    let 배열 = self.빼기();
                    match 배열 {
                        셀값::배열(mut a) => { a.push(값); self.넣기(셀값::배열(a)); }
                        _ => self.넣기(셀값::배열(vec![값])),
                    }
                }
                명령::배열길이 => {
                    // 스택: [배열] → 길이
                    let v = self.빼기();
                    let 길이 = match &v {
                        셀값::배열(a) => a.len() as i64,
                        셀값::문자열(s) => s.chars().count() as i64,
                        _ => 0,
                    };
                    self.넣기(셀값::정수(길이));
                }
                명령::배열설정 => {
                    // 스택: [값, 인덱스, 배열] → 새배열
                    let 값 = self.빼기();
                    let 인덱스 = self.빼기().정수로() as usize;
                    let 배열 = self.빼기();
                    match 배열 {
                        셀값::배열(mut a) => {
                            while a.len() <= 인덱스 { a.push(셀값::없음); }
                            a[인덱스] = 값;
                            self.넣기(셀값::배열(a));
                        }
                        _ => self.넣기(셀값::없음),
                    }
                }

                // ═══ OS 체계 ═══
                명령::디렉토리목록 => {
                    let 경로 = self.빼기().문자열로();
                    let 경로 = if 경로.is_empty() { ".".to_string() } else { 경로 };
                    match std::fs::read_dir(&경로) {
                        Ok(entries) => {
                            let mut 목록: Vec<셀값> = Vec::new();
                            for entry in entries {
                                if let Ok(e) = entry {
                                    목록.push(셀값::문자열(e.file_name().to_string_lossy().into()));
                                }
                            }
                            목록.sort_by(|a, b| a.문자열로().cmp(&b.문자열로()));
                            self.넣기(셀값::배열(목록));
                        }
                        Err(e) => self.넣기(셀값::배열(vec![셀값::문자열(format!("오류: {}", e))])),
                    }
                }
                명령::현재경로 => {
                    let 경로 = std::env::current_dir()
                        .map(|p| p.to_string_lossy().into())
                        .unwrap_or_else(|_| "알수없음".to_string());
                    self.넣기(셀값::문자열(경로));
                }
                명령::경로변경 => {
                    let 경로 = self.빼기().문자열로();
                    let 결과 = std::env::set_current_dir(&경로).is_ok();
                    self.넣기(셀값::정수(if 결과 { 1 } else { -1 }));
                }
                명령::체계명령 => {
                    let 명령문 = self.빼기().문자열로();
                    match std::process::Command::new("sh").arg("-c").arg(&명령문).output() {
                        Ok(출력) => {
                            let s = String::from_utf8_lossy(&출력.stdout).trim().to_string();
                            self.넣기(셀값::문자열(s));
                        }
                        Err(e) => self.넣기(셀값::문자열(format!("오류: {}", e))),
                    }
                }
                명령::문자열나누기 => {
                    let 구분 = self.빼기().문자열로();
                    let 대상 = self.빼기().문자열로();
                    let 조각: Vec<셀값> = 대상.split(&구분)
                        .map(|s| 셀값::문자열(s.to_string()))
                        .collect();
                    self.넣기(셀값::배열(조각));
                }
            }
        }

        Ok(self.스택.last().cloned().unwrap_or(셀값::없음))
    }
}


