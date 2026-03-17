// ═══════════════════════════════════════════════════════════════
// 셀 — 온톨로지적 DB 단위 (27슬롯)
//
// 셀 하나 = DB 레코드 하나
// 27개(3³) 기본값 슬롯
// 4개가 티옴타음 연결 인덱스:
//   ◆음 = 시냅스 (이 셀이 어디와 연결될지 결정하는 포인터)
//   ▲티 = 상위 레이어 방향 연결 인덱스
//   ●옴 = 현재 레이어 내 연결 인덱스
//   ▼타 = 하위 레이어 방향 연결 인덱스
//
// 저장: 생성 순서대로 순차적 (위치 기반 아님, 시간 기반)
// 레이어는 미리 존재하지 않음. 셀들의 연결로 창발적으로 나타남
//
// RTF1 Claim 매핑:
//   슬롯 0: 주체(subject)
//   슬롯 1: 술어(predicate)
//   슬롯 2: 대상(object)
//   슬롯 3: 인식상태
//   슬롯 4: 신뢰값 (-13~+13)
//   슬롯 5: 증거수
//   슬롯 6~8: 증거 셀 참조 (최대 3개)
//   슬롯 9~11: 예비
//   슬롯 12: 생성시각 (유닉스 초)
//   슬롯 13~15: 메타 (카테고리, 도메인, 레이어)
//   슬롯 16~22: 사용자 데이터 (7개 자유 슬롯)
//   슬롯 23: ◆음 연결 (시냅스)
//   슬롯 24: ▲티 연결 (상위)
//   슬롯 25: ●옴 연결 (현재)
//   슬롯 26: ▼타 연결 (하위)
// ═══════════════════════════════════════════════════════════════

use std::fmt;
use super::삼진수::트릿단어;
use super::티옴타음::인식;

pub const 셀크기: usize = 27;

// 슬롯 인덱스 상수
pub const 슬롯_주체: usize = 0;
pub const 슬롯_술어: usize = 1;
pub const 슬롯_대상: usize = 2;
pub const 슬롯_인식: usize = 3;
pub const 슬롯_신뢰: usize = 4;
pub const 슬롯_증거수: usize = 5;
pub const 슬롯_증거1: usize = 6;
pub const 슬롯_증거2: usize = 7;
pub const 슬롯_증거3: usize = 8;
pub const 슬롯_생성시각: usize = 12;
pub const 슬롯_카테고리: usize = 13;
pub const 슬롯_도메인: usize = 14;
pub const 슬롯_레이어: usize = 15;
pub const 슬롯_데이터시작: usize = 16;
pub const 슬롯_데이터끝: usize = 22;
pub const 슬롯_음: usize = 23;  // ◆ 시냅스 (연결 포인터)
pub const 슬롯_티: usize = 24;  // ▲ 상위 연결
pub const 슬롯_옴: usize = 25;  // ● 현재 연결
pub const 슬롯_타: usize = 26;  // ▼ 하위 연결

/// 셀값 — 슬롯 하나에 들어가는 값
#[derive(Debug, Clone, PartialEq)]
pub enum 셀값 {
    없음,
    정수(i64),
    실수(f64),
    문자열(String),
    삼진(트릿단어),
    셀참조(u64),       // 다른 셀의 ID
    인식값(인식),
    배열(Vec<셀값>),    // 동적 배열
}

impl 셀값 {
    pub fn 정수로(&self) -> i64 {
        match self {
            셀값::정수(v) => *v,
            셀값::실수(v) => *v as i64,
            셀값::삼진(tw) => tw.십진(),
            셀값::셀참조(id) => *id as i64,
            _ => 0,
        }
    }

    pub fn 실수로(&self) -> f64 {
        match self {
            셀값::실수(v) => *v,
            셀값::정수(v) => *v as f64,
            셀값::삼진(tw) => tw.십진() as f64,
            _ => 0.0,
        }
    }

    pub fn 문자열로(&self) -> String {
        match self {
            셀값::없음 => "없음".into(),
            셀값::정수(v) => v.to_string(),
            셀값::실수(v) => format!("{}", v),
            셀값::문자열(s) => s.clone(),
            셀값::삼진(tw) => format!("{}", tw),
            셀값::셀참조(id) => format!("@{}", id),
            셀값::인식값(i) => format!("{}", i),
            셀값::배열(a) => {
                let 내용: Vec<String> = a.iter().map(|v| v.문자열로()).collect();
                format!("[{}]", 내용.join(", "))
            }
        }
    }

    pub fn 참인가(&self) -> 인식 {
        match self {
            셀값::정수(v) => if *v > 0 { 인식::티 } else if *v < 0 { 인식::타 } else { 인식::옴 },
            셀값::없음 => 인식::음,
            셀값::인식값(i) => *i,
            셀값::배열(a) => if a.is_empty() { 인식::타 } else { 인식::티 },
            _ => 인식::티,
        }
    }
}

impl fmt::Display for 셀값 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.문자열로())
    }
}

/// 셀 — 27슬롯 온톨로지 DB 레코드
#[derive(Debug, Clone)]
pub struct 셀 {
    pub id: u64,
    pub 슬롯: [셀값; 셀크기],
}

impl 셀 {
    /// 빈 셀 생성
    pub fn 빈것(id: u64) -> Self {
        셀 {
            id,
            슬롯: std::array::from_fn(|_| 셀값::없음),
        }
    }

    /// 주장(Claim) 셀 생성 — RTF1 핵심 구조
    pub fn 주장(id: u64, 주체: &str, 술어: &str, 대상: &str, 인식상태: 인식) -> Self {
        let mut 셀 = 셀::빈것(id);
        셀.슬롯[슬롯_주체] = 셀값::문자열(주체.into());
        셀.슬롯[슬롯_술어] = 셀값::문자열(술어.into());
        셀.슬롯[슬롯_대상] = 셀값::문자열(대상.into());
        셀.슬롯[슬롯_인식] = 셀값::인식값(인식상태);
        셀.슬롯[슬롯_신뢰] = 셀값::정수(match 인식상태 {
            인식::티 => 13, 인식::옴 => 0, 인식::타 => -13, 인식::음 => 0,
        });
        셀.슬롯[슬롯_증거수] = 셀값::정수(0);
        셀.슬롯[슬롯_생성시각] = 셀값::정수(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default().as_secs() as i64
        );
        셀
    }

    /// 값 셀 — 단순 데이터 저장용
    pub fn 값(id: u64, 데이터: 셀값) -> Self {
        let mut 셀 = 셀::빈것(id);
        셀.슬롯[슬롯_데이터시작] = 데이터;
        셀.슬롯[슬롯_인식] = 셀값::인식값(인식::티);
        셀.슬롯[슬롯_신뢰] = 셀값::정수(13);
        셀
    }

    // ═══ 접근자 ═══

    pub fn 인식상태(&self) -> 인식 {
        match &self.슬롯[슬롯_인식] {
            셀값::인식값(i) => *i,
            _ => 인식::음,
        }
    }

    pub fn 신뢰값(&self) -> i64 { self.슬롯[슬롯_신뢰].정수로() }
    pub fn 증거수(&self) -> i64 { self.슬롯[슬롯_증거수].정수로() }

    pub fn 주체(&self) -> String { self.슬롯[슬롯_주체].문자열로() }
    pub fn 술어(&self) -> String { self.슬롯[슬롯_술어].문자열로() }
    pub fn 대상(&self) -> String { self.슬롯[슬롯_대상].문자열로() }

    /// 사용자 데이터 (슬롯 16~22)
    pub fn 데이터(&self) -> &셀값 { &self.슬롯[슬롯_데이터시작] }
    pub fn 데이터쓰기(&mut self, 값: 셀값) { self.슬롯[슬롯_데이터시작] = 값; }

    // ═══ 티옴타음 연결 ═══

    pub fn 음연결(&self) -> u64 { self.슬롯[슬롯_음].정수로() as u64 }
    pub fn 티연결(&self) -> u64 { self.슬롯[슬롯_티].정수로() as u64 }
    pub fn 옴연결(&self) -> u64 { self.슬롯[슬롯_옴].정수로() as u64 }
    pub fn 타연결(&self) -> u64 { self.슬롯[슬롯_타].정수로() as u64 }

    pub fn 음연결쓰기(&mut self, id: u64) { self.슬롯[슬롯_음] = 셀값::셀참조(id); }
    pub fn 티연결쓰기(&mut self, id: u64) { self.슬롯[슬롯_티] = 셀값::셀참조(id); }
    pub fn 옴연결쓰기(&mut self, id: u64) { self.슬롯[슬롯_옴] = 셀값::셀참조(id); }
    pub fn 타연결쓰기(&mut self, id: u64) { self.슬롯[슬롯_타] = 셀값::셀참조(id); }

    // ═══ 인식 조작 ═══

    /// 근거 추가 → 인식상태 전진
    pub fn 근거추가(&mut self, 증거셀: u64) {
        let 현재 = self.증거수();
        if 현재 < 13 {
            self.슬롯[슬롯_증거수] = 셀값::정수(현재 + 1);
            // 증거 슬롯에 저장 (최대 3개 직접 참조)
            let 증거슬롯 = match 현재 {
                0 => Some(슬롯_증거1),
                1 => Some(슬롯_증거2),
                2 => Some(슬롯_증거3),
                _ => None,
            };
            if let Some(슬롯) = 증거슬롯 {
                self.슬롯[슬롯] = 셀값::셀참조(증거셀);
            }
        }
        // 충분한 증거 → 전진
        let 새인식 = self.인식상태().전진();
        self.슬롯[슬롯_인식] = 셀값::인식값(새인식);
        self.슬롯[슬롯_신뢰] = 셀값::정수(match 새인식 {
            인식::티 => 13, 인식::옴 => (현재 + 1).min(13), 인식::타 => -13, 인식::음 => 0,
        });
    }

    /// 의사결정 점수: Goal_Fit × Evidence_Quality × State_Reliability × Action_Feasibility × Risk_Penalty
    pub fn 결정점수(&self, 목표적합도: f64, 행동가능성: f64, 위험계수: f64) -> f64 {
        let 증거품질 = (self.증거수() as f64 / 5.0).min(1.0).max(0.1);
        let 상태신뢰 = self.인식상태().신뢰도();
        목표적합도 * 증거품질 * 상태신뢰 * 행동가능성 * (1.0 - 위험계수)
    }
}

impl fmt::Display for 셀 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let 인식 = self.인식상태();
        let 값 = if self.주체() != "없음" {
            format!("({} {} {})", self.주체(), self.술어(), self.대상())
        } else {
            self.데이터().문자열로()
        };
        write!(f, "[{} 신뢰:{}/13 증거:{} {}]", 인식, self.신뢰값(), self.증거수(), 값)
    }
}

#[cfg(test)]
mod 시험 {
    use super::*;

    #[test]
    fn 주장_생성() {
        let c = 셀::주장(1, "BTC", "추세", "상승", 인식::옴);
        assert_eq!(c.주체(), "BTC");
        assert_eq!(c.술어(), "추세");
        assert_eq!(c.대상(), "상승");
        assert_eq!(c.인식상태(), 인식::옴);
        assert_eq!(c.신뢰값(), 0);
    }

    #[test]
    fn 근거추가_전이() {
        let mut c = 셀::주장(1, "X", "이다", "Y", 인식::옴);
        assert_eq!(c.인식상태(), 인식::옴);
        c.근거추가(100);
        assert_eq!(c.인식상태(), 인식::티); // 옴→티
        assert_eq!(c.증거수(), 1);
    }

    #[test]
    fn 티옴타음_연결() {
        let mut c = 셀::빈것(1);
        c.티연결쓰기(10);
        c.옴연결쓰기(20);
        c.타연결쓰기(30);
        c.음연결쓰기(40);
        assert_eq!(c.티연결(), 10);
        assert_eq!(c.옴연결(), 20);
        assert_eq!(c.타연결(), 30);
        assert_eq!(c.음연결(), 40);
    }

    #[test]
    fn 결정점수() {
        let c = 셀::주장(1, "X", "이다", "Y", 인식::티);
        let 점수 = c.결정점수(0.9, 0.8, 0.1);
        assert!(점수 > 0.0, "확정 주장의 결정점수가 양수여야 함: {}", 점수);
    }
}
