// crownycode/src/isa729/mod.rs
// ISA729 — 크라우니어 명령 집합 아키텍처
// 균형3진법({-1, 0, +1}) 기반 43개 opcode
// 4상균형3진 원칙: 모든 연산은 확정/미확인/오해/미인지 상태를 직접 인코딩

pub mod regalloc;
pub mod instr;
pub mod codegen;
pub mod vm;
pub mod assembler;

/// ISA729 레지스터 — T0~T8 (9개 균형3진 레지스터)
/// 각 레지스터는 9 trit (= 3^9 = 19683 상태) 보유
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reg {
    T0, T1, T2, T3, T4,
    T5, T6, T7, T8,
    /// 프로그램 카운터
    PC,
    /// 스택 포인터
    SP,
    /// 상태 레지스터 (4상 플래그 저장)
    SR,
}

impl Reg {
    pub fn name(&self) -> &'static str {
        match self {
            Reg::T0 => "T0", Reg::T1 => "T1", Reg::T2 => "T2",
            Reg::T3 => "T3", Reg::T4 => "T4", Reg::T5 => "T5",
            Reg::T6 => "T6", Reg::T7 => "T7", Reg::T8 => "T8",
            Reg::PC => "PC", Reg::SP => "SP", Reg::SR => "SR",
        }
    }
    pub fn is_general(&self) -> bool {
        matches!(self, Reg::T0|Reg::T1|Reg::T2|Reg::T3|Reg::T4|
                       Reg::T5|Reg::T6|Reg::T7|Reg::T8)
    }
}

/// 균형3진 값 — trit 단위 ({-1, 0, +1})
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Trit(pub i8);

impl Trit {
    pub const NEG: Trit = Trit(-1);
    pub const ZRO: Trit = Trit(0);
    pub const POS: Trit = Trit(1);

    pub fn is_valid(&self) -> bool { self.0 >= -1 && self.0 <= 1 }
}

/// 9-trit 워드 (ISA729 기본 데이터 단위)
/// 3^9 = 19683 상태, 약 4.39비트 × 9 = 39.5비트 정보
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TriWord(pub [Trit; 9]);

impl TriWord {
    pub const ZERO: TriWord = TriWord([Trit(0); 9]);

    /// 정수 → TriWord 변환 (balanced ternary encoding)
    pub fn from_int(mut n: i64) -> Self {
        let mut trits = [Trit(0); 9];
        for t in trits.iter_mut() {
            let rem = n.rem_euclid(3);
            let trit = if rem == 0 { 0 } else if rem == 1 { 1 } else { -1 };
            *t = Trit(trit);
            n = (n - trit as i64) / 3;
        }
        TriWord(trits)
    }

    /// TriWord → 정수 변환
    pub fn to_int(self) -> i64 {
        self.0.iter().enumerate()
            .map(|(i, t)| t.0 as i64 * 3_i64.pow(i as u32))
            .sum()
    }

    /// 4상 상태값으로 해석 (+2=확정, 0=미확인, -1=오해, -2=미인지)
    pub fn phase_value(&self) -> i8 {
        let v = self.to_int();
        match v {
            2  =>  2,   // 확정
            0  =>  0,   // 미확인
            -1 => -1,   // 오해
            -2 => -2,   // 미인지
            _  =>  0,   // 기타 → 미확인
        }
    }
}

impl std::fmt::Display for TriWord {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 균형3진 표기: T(+1), Z(0), N(-1)
        let s: String = self.0.iter().rev()
            .map(|t| match t.0 { 1 => 'T', 0 => 'Z', _ => 'N' })
            .collect();
        write!(f, "{s}[{}]", self.to_int())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_triword_zero() {
        assert_eq!(TriWord::ZERO.to_int(), 0);
    }

    #[test]
    fn test_triword_roundtrip() {
        for n in [-13_i64, -4, -1, 0, 1, 4, 13] {
            let w = TriWord::from_int(n);
            assert_eq!(w.to_int(), n, "roundtrip failed for {n}");
        }
    }

    #[test]
    fn test_triword_positive() {
        let w = TriWord::from_int(4);
        // 4 = 1×3 + 1×1 = ternary 11 balanced → [1,1,0,0,0,0,0,0,0]
        assert_eq!(w.to_int(), 4);
    }

    #[test]
    fn test_triword_negative() {
        let w = TriWord::from_int(-4);
        assert_eq!(w.to_int(), -4);
    }

    #[test]
    fn test_phase_values() {
        assert_eq!(TriWord::from_int(2).phase_value(),   2);
        assert_eq!(TriWord::from_int(0).phase_value(),   0);
        assert_eq!(TriWord::from_int(-1).phase_value(), -1);
        assert_eq!(TriWord::from_int(-2).phase_value(), -2);
    }

    #[test]
    fn test_reg_names() {
        assert_eq!(Reg::T0.name(), "T0");
        assert_eq!(Reg::PC.name(), "PC");
        assert_eq!(Reg::SR.name(), "SR");
    }

    #[test]
    fn test_reg_general() {
        assert!(Reg::T0.is_general());
        assert!(!Reg::PC.is_general());
        assert!(!Reg::SP.is_general());
    }
}
