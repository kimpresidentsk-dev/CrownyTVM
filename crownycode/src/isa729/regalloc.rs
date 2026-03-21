// crownycode/src/isa729/regalloc.rs
// ISA729 레지스터 할당기
// T0~T8 9개 범용 레지스터를 IR 변수에 매핑
// 심플 선형 스캔 알고리즘 (Phase 5 기준)

use std::collections::HashMap;
use super::Reg;

const GENERAL_REGS: [Reg; 9] = [
    Reg::T0, Reg::T1, Reg::T2, Reg::T3, Reg::T4,
    Reg::T5, Reg::T6, Reg::T7, Reg::T8,
];

pub struct RegAllocator {
    /// 변수 이름 → 레지스터 매핑
    map: HashMap<String, Reg>,
    /// 사용 중인 레지스터 집합
    used: Vec<bool>,
    /// 스필 카운터 (레지스터 부족 시 메모리 사용)
    spill_count: u32,
}

impl Default for RegAllocator {
    fn default() -> Self {
        Self::new()
    }
}

impl RegAllocator {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
            used: vec![false; 9],
            spill_count: 0,
        }
    }

    /// 변수에 레지스터 할당. 없으면 새 레지스터 배정
    pub fn alloc(&mut self, var: &str) -> AllocResult {
        if let Some(&reg) = self.map.get(var) {
            return AllocResult::Reg(reg);
        }

        // 빈 레지스터 찾기
        if let Some(idx) = self.used.iter().position(|&u| !u) {
            self.used[idx] = true;
            let reg = GENERAL_REGS[idx];
            self.map.insert(var.to_string(), reg);
            AllocResult::Reg(reg)
        } else {
            // 레지스터 부족 → 스필
            self.spill_count += 1;
            AllocResult::Spill(self.spill_count)
        }
    }

    /// 변수에 할당된 레지스터 조회
    pub fn get(&self, var: &str) -> Option<Reg> {
        self.map.get(var).copied()
    }

    /// 레지스터 해제
    pub fn free(&mut self, var: &str) {
        if let Some(reg) = self.map.remove(var) {
            if let Some(idx) = GENERAL_REGS.iter().position(|&r| r == reg) {
                self.used[idx] = false;
            }
        }
    }

    /// 모든 할당 초기화 (함수 경계)
    pub fn reset(&mut self) {
        self.map.clear();
        self.used.iter_mut().for_each(|u| *u = false);
    }

    /// 현재 할당 상태 스냅샷
    pub fn snapshot(&self) -> Vec<(String, Reg)> {
        self.map.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }

    pub fn spill_count(&self) -> u32 { self.spill_count }
    pub fn allocated_count(&self) -> usize { self.map.len() }

    /// 임시 변수 자동 명명 (n번째 임시)
    pub fn alloc_temp(&mut self, n: u32) -> AllocResult {
        self.alloc(&format!("__tmp{n}"))
    }
}

/// 레지스터 할당 결과
#[derive(Debug, Clone, PartialEq)]
pub enum AllocResult {
    /// 레지스터에 직접 배정
    Reg(Reg),
    /// 스필 — 메모리 슬롯 번호
    Spill(u32),
}

impl AllocResult {
    pub fn unwrap_reg(&self) -> Reg {
        match self {
            AllocResult::Reg(r) => *r,
            AllocResult::Spill(n) => panic!("레지스터 스필 #{n} — 메모리 접근 필요"),
        }
    }
    pub fn is_spill(&self) -> bool {
        matches!(self, AllocResult::Spill(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alloc_first_reg_is_t0() {
        let mut ra = RegAllocator::new();
        let r = ra.alloc("x");
        assert_eq!(r, AllocResult::Reg(Reg::T0));
    }

    #[test]
    fn test_same_var_same_reg() {
        let mut ra = RegAllocator::new();
        let r1 = ra.alloc("x");
        let r2 = ra.alloc("x");
        assert_eq!(r1, r2);
    }

    #[test]
    fn test_different_vars_different_regs() {
        let mut ra = RegAllocator::new();
        let r1 = ra.alloc("x").unwrap_reg();
        let r2 = ra.alloc("y").unwrap_reg();
        assert_ne!(r1, r2);
    }

    #[test]
    fn test_free_and_reuse() {
        let mut ra = RegAllocator::new();
        let r1 = ra.alloc("x").unwrap_reg();
        ra.free("x");
        let r2 = ra.alloc("z").unwrap_reg();
        assert_eq!(r1, r2, "해제된 레지스터 재사용");
    }

    #[test]
    fn test_all_9_regs_allocatable() {
        let mut ra = RegAllocator::new();
        let mut regs = vec![];
        for i in 0..9 {
            let r = ra.alloc(&format!("var{i}"));
            assert!(!r.is_spill(), "var{i} should not spill");
            regs.push(r);
        }
        assert_eq!(ra.allocated_count(), 9);
    }

    #[test]
    fn test_10th_var_spills() {
        let mut ra = RegAllocator::new();
        for i in 0..9 { ra.alloc(&format!("v{i}")); }
        let r = ra.alloc("overflow");
        assert!(r.is_spill(), "10번째 변수는 스필");
        assert_eq!(ra.spill_count(), 1);
    }

    #[test]
    fn test_reset_clears_all() {
        let mut ra = RegAllocator::new();
        ra.alloc("a"); ra.alloc("b"); ra.alloc("c");
        ra.reset();
        assert_eq!(ra.allocated_count(), 0);
        assert_eq!(ra.alloc("a"), AllocResult::Reg(Reg::T0));
    }

    #[test]
    fn test_alloc_temp() {
        let mut ra = RegAllocator::new();
        let t0 = ra.alloc_temp(0);
        let t1 = ra.alloc_temp(1);
        assert!(!t0.is_spill());
        assert!(!t1.is_spill());
        assert_ne!(t0, t1);
    }
}
