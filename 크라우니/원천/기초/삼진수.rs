// ═══════════════════════════════════════════════════════════════
// 삼진수 — 균형3진법 기본 타입
//
// 트릿(Trit):     ▼(-1), ●(0), ▲(+1)
// 트릿단어(TritWord): 27트릿 = 하나의 레지스터/메모리 워드
// ═══════════════════════════════════════════════════════════════

use std::fmt;

/// 트릿: 균형3진법의 최소 단위 {-1, 0, +1}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum 트릿 {
    양,  // +1 (▲, Ti)
    중,  // 0  (●, Om)
    음,  // -1 (▼, Ta)
}

impl 트릿 {
    pub fn 값(&self) -> i8 {
        match self { 트릿::양 => 1, 트릿::중 => 0, 트릿::음 => -1 }
    }

    pub fn 에서(v: i8) -> 트릿 {
        if v > 0 { 트릿::양 } else if v < 0 { 트릿::음 } else { 트릿::중 }
    }

    // 3진 논리 연산
    pub fn 아닌(self) -> 트릿 { 트릿::에서(-self.값()) }
    pub fn 그리고(self, 다른: 트릿) -> 트릿 { 트릿::에서(self.값().min(다른.값())) }
    pub fn 또는(self, 다른: 트릿) -> 트릿 { 트릿::에서(self.값().max(다른.값())) }
    pub fn 합의(self, 다른: 트릿) -> 트릿 {
        // 둘 다 같으면 그것, 다르면 중립
        if self == 다른 { self } else { 트릿::중 }
    }
}

impl fmt::Display for 트릿 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self { 트릿::양 => write!(f, "▲"), 트릿::중 => write!(f, "●"), 트릿::음 => write!(f, "▼") }
    }
}

// ═══ 트릿단어: 27트릿 = 42.8비트 ═══

pub const 단어길이: usize = 27;

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct 트릿단어 {
    pub 트릿들: [트릿; 단어길이],
}

impl 트릿단어 {
    pub fn 영() -> Self {
        트릿단어 { 트릿들: [트릿::중; 단어길이] }
    }

    /// 10진수 → 균형3진수
    pub fn 에서(mut 값: i64) -> Self {
        let mut 트릿들 = [트릿::중; 단어길이];
        let 음수 = 값 < 0;
        if 음수 { 값 = -값; }

        for i in 0..단어길이 {
            let 나머지 = (값 % 3) as i8;
            if 나머지 == 2 {
                트릿들[i] = 트릿::음;
                값 = (값 + 1) / 3;
            } else {
                트릿들[i] = 트릿::에서(나머지);
                값 /= 3;
            }
            if 값 == 0 { break; }
        }

        if 음수 {
            for t in 트릿들.iter_mut() { *t = t.아닌(); }
        }
        트릿단어 { 트릿들 }
    }

    /// 균형3진수 → 10진수
    pub fn 십진(&self) -> i64 {
        let mut 결과: i64 = 0;
        let mut 자릿값: i64 = 1;
        for t in &self.트릿들 {
            결과 += t.값() as i64 * 자릿값;
            자릿값 *= 3;
        }
        결과
    }

    /// 6트릿 = 1 옵코드 번호 (0~728)
    pub fn 옵코드(&self) -> u16 {
        let mut r: i64 = 0;
        let mut p: i64 = 1;
        for i in 0..6 {
            r += self.트릿들[i].값() as i64 * p;
            p *= 3;
        }
        // 균형3진 → 비균형으로 변환 (0~728)
        (r + 364) as u16  // 364 = (729-1)/2
    }

    /// 옵코드 번호 → 6트릿 단어
    pub fn 옵코드에서(번호: u16) -> Self {
        let 값 = 번호 as i64 - 364;
        let mut tw = Self::에서(값);
        // 상위 트릿 초기화 (6트릿만 유효)
        for i in 6..단어길이 { tw.트릿들[i] = 트릿::중; }
        tw
    }

    // 산술
    pub fn 더하기(&self, 다른: &트릿단어) -> 트릿단어 {
        트릿단어::에서(self.십진() + 다른.십진())
    }

    pub fn 빼기(&self, 다른: &트릿단어) -> 트릿단어 {
        트릿단어::에서(self.십진() - 다른.십진())
    }

    pub fn 곱하기(&self, 다른: &트릿단어) -> 트릿단어 {
        트릿단어::에서(self.십진() * 다른.십진())
    }

    pub fn 나누기(&self, 다른: &트릿단어) -> Option<트릿단어> {
        let d = 다른.십진();
        if d == 0 { None } else { Some(트릿단어::에서(self.십진() / d)) }
    }

    // 트릿 단위 논리 연산
    pub fn 아닌(&self) -> 트릿단어 {
        let mut r = self.clone();
        for t in r.트릿들.iter_mut() { *t = t.아닌(); }
        r
    }

    pub fn 비교(&self, 다른: &트릿단어) -> 트릿 {
        let a = self.십진();
        let b = 다른.십진();
        if a > b { 트릿::양 } else if a < b { 트릿::음 } else { 트릿::중 }
    }
}

impl fmt::Debug for 트릿단어 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "TW({})", self.십진())
    }
}

impl fmt::Display for 트릿단어 {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        // 유효 트릿만 표시
        let mut 끝 = 단어길이 - 1;
        while 끝 > 0 && self.트릿들[끝] == 트릿::중 { 끝 -= 1; }
        for i in (0..=끝).rev() { write!(f, "{}", self.트릿들[i])?; }
        write!(f, "({})", self.십진())
    }
}

#[cfg(test)]
mod 시험 {
    use super::*;

    #[test]
    fn 십진_변환() {
        assert_eq!(트릿단어::에서(0).십진(), 0);
        assert_eq!(트릿단어::에서(1).십진(), 1);
        assert_eq!(트릿단어::에서(-1).십진(), -1);
        assert_eq!(트릿단어::에서(13).십진(), 13);
        assert_eq!(트릿단어::에서(-42).십진(), -42);
        assert_eq!(트릿단어::에서(729).십진(), 729);
        assert_eq!(트릿단어::에서(-3645).십진(), -3645); // 3^7+3^6
    }

    #[test]
    fn 산술() {
        let a = 트릿단어::에서(42);
        let b = 트릿단어::에서(13);
        assert_eq!(a.더하기(&b).십진(), 55);
        assert_eq!(a.빼기(&b).십진(), 29);
        assert_eq!(a.곱하기(&b).십진(), 546);
    }

    #[test]
    fn 옵코드_변환() {
        for i in 0..729u16 {
            let tw = 트릿단어::옵코드에서(i);
            assert_eq!(tw.옵코드(), i, "옵코드 {} 왕복 실패", i);
        }
    }

    #[test]
    fn 삼진논리() {
        assert_eq!(트릿::양.그리고(트릿::중), 트릿::중);
        assert_eq!(트릿::양.또는(트릿::음), 트릿::양);
        assert_eq!(트릿::양.아닌(), 트릿::음);
        assert_eq!(트릿::양.합의(트릿::양), 트릿::양);
        assert_eq!(트릿::양.합의(트릿::음), 트릿::중);
    }
}
