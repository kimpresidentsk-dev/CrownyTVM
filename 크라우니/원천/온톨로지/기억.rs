// ═══════════════════════════════════════════════════════════════
// 기억 — 셀 기반 온톨로지 메모리
//
// 모든 셀은 생성 순서대로 순차 저장 (시간 기반)
// 셀 간 연결은 티옴타음 4방향:
//   ◆음: 시냅스 (이 셀이 어디와 연결될지 결정)
//   ▲티: 상위 레이어 방향
//   ●옴: 현재 레이어 내
//   ▼타: 하위 레이어 방향
//
// Layer 0~4 (RTF1):
//   Layer 0: 코어 심플 — 기본 엔티티/관계
//   Layer 1: 도메인 — 분야별 지식
//   Layer 2: 결정 — 의사결정 트리
//   Layer 3: 인식 — 증거/신뢰/상태
//   Layer 4: 메타온톨로지 — 온톨로지 자체에 대한 지식
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use crate::기초::셀::{셀, 셀값, 슬롯_레이어, 슬롯_카테고리};
use crate::기초::티옴타음::인식;

/// 레이어 (RTF1)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum 레이어 {
    코어,       // Layer 0: 기본 엔티티/관계
    도메인,     // Layer 1: 분야별 지식
    결정,       // Layer 2: 의사결정
    인식,       // Layer 3: 증거/신뢰
    메타,       // Layer 4: 메타온톨로지
}

impl 레이어 {
    pub fn 번호(&self) -> i64 {
        match self { 레이어::코어 => 0, 레이어::도메인 => 1, 레이어::결정 => 2, 레이어::인식 => 3, 레이어::메타 => 4 }
    }
}

/// 기억 — 셀 저장소 + 이름표 + 연결 관리
pub struct 기억 {
    셀들: Vec<셀>,
    pub 이름표: HashMap<String, u64>,     // 이름 → 셀 ID
    다음id: u64,
}

impl 기억 {
    pub fn 새것() -> Self {
        기억 { 셀들: Vec::new(), 이름표: HashMap::new(), 다음id: 1 }
    }

    // ═══ 셀 생성 ═══

    fn 새id(&mut self) -> u64 {
        let id = self.다음id;
        self.다음id += 1;
        id
    }

    /// 주장 셀 추가
    pub fn 주장추가(&mut self, 주체: &str, 술어: &str, 대상: &str, 인식상태: 인식, 레이어값: 레이어) -> u64 {
        let id = self.새id();
        let mut 셀 = 셀::주장(id, 주체, 술어, 대상, 인식상태);
        셀.슬롯[슬롯_레이어] = 셀값::정수(레이어값.번호());
        self.셀들.push(셀);
        id
    }

    /// 값 셀 추가 (변수 등)
    pub fn 값추가(&mut self, 데이터: 셀값) -> u64 {
        let id = self.새id();
        let 셀 = 셀::값(id, 데이터);
        self.셀들.push(셀);
        id
    }

    // ═══ 이름표 (변수 바인딩) ═══

    pub fn 이름쓰기(&mut self, 이름: &str, 값: 셀값) -> u64 {
        // 셀참조인 경우: 이름표가 직접 그 셀을 가리킴 (래퍼 생성 안함)
        if let 셀값::셀참조(참조id) = &값 {
            let 참조id = *참조id;
            self.이름표.insert(이름.to_string(), 참조id);
            return 참조id;
        }
        if let Some(&id) = self.이름표.get(이름) {
            // 기존 셀 갱신
            if let Some(셀) = self.셀찾기_mut(id) {
                셀.데이터쓰기(값);
            }
            id
        } else {
            // 새 셀 생성
            let id = self.값추가(값);
            self.이름표.insert(이름.to_string(), id);
            id
        }
    }

    pub fn 이름읽기(&self, 이름: &str) -> Option<셀값> {
        self.이름표.get(이름).and_then(|&id| {
            self.셀찾기(id).map(|c| {
                let 데이터 = c.데이터();
                match 데이터 {
                    셀값::없음 => 셀값::셀참조(id), // 주장셀 등 → 참조 반환
                    _ => 데이터.clone(),
                }
            })
        })
    }

    pub fn 이름셀(&self, 이름: &str) -> Option<&셀> {
        self.이름표.get(이름).and_then(|&id| self.셀찾기(id))
    }

    pub fn 이름셀_mut(&mut self, 이름: &str) -> Option<&mut 셀> {
        if let Some(&id) = self.이름표.get(이름) {
            self.셀찾기_mut(id)
        } else {
            None
        }
    }

    // ═══ 셀 접근 ═══

    pub fn 셀찾기(&self, id: u64) -> Option<&셀> {
        self.셀들.iter().find(|c| c.id == id)
    }

    pub fn 셀찾기_mut(&mut self, id: u64) -> Option<&mut 셀> {
        self.셀들.iter_mut().find(|c| c.id == id)
    }

    pub fn 셀수(&self) -> usize { self.셀들.len() }

    // ═══ 티옴타음 연결 ═══

    /// 두 셀을 연결: 원천 → (방향) → 대상
    pub fn 연결(&mut self, 원천id: u64, 대상id: u64, 방향: 인식) {
        if let Some(원천) = self.셀찾기_mut(원천id) {
            match 방향 {
                인식::티 => 원천.티연결쓰기(대상id),
                인식::옴 => 원천.옴연결쓰기(대상id),
                인식::타 => 원천.타연결쓰기(대상id),
                인식::음 => 원천.음연결쓰기(대상id),
            }
        }
    }

    /// 셀에서 특정 방향의 연결된 셀 따라가기
    pub fn 따라가기(&self, id: u64, 방향: 인식) -> Option<&셀> {
        let 셀 = self.셀찾기(id)?;
        let 대상id = match 방향 {
            인식::티 => 셀.티연결(),
            인식::옴 => 셀.옴연결(),
            인식::타 => 셀.타연결(),
            인식::음 => 셀.음연결(),
        };
        if 대상id == 0 { None } else { self.셀찾기(대상id) }
    }

    // ═══ 쿼리 ═══

    /// 주체로 주장 검색
    pub fn 주장검색(&self, 주체: &str) -> Vec<&셀> {
        self.셀들.iter().filter(|c| c.주체() == 주체).collect()
    }

    /// 레이어별 셀 목록
    pub fn 레이어셀들(&self, 레이어: 레이어) -> Vec<&셀> {
        let 번호 = 레이어.번호();
        self.셀들.iter().filter(|c| c.슬롯[슬롯_레이어].정수로() == 번호).collect()
    }

    /// 인식상태별 셀 목록
    pub fn 인식별셀들(&self, 상태: 인식) -> Vec<&셀> {
        self.셀들.iter().filter(|c| c.인식상태() == 상태).collect()
    }

    // ═══ 스코프 관리 (함수 호출용) ═══

    pub fn 현재이름표(&self) -> HashMap<String, u64> { self.이름표.clone() }

    pub fn 이름표복원(&mut self, 저장: HashMap<String, u64>) { self.이름표 = 저장; }
}

#[cfg(test)]
mod 시험 {
    use super::*;

    #[test]
    fn 기본_저장() {
        let mut 메모리 = 기억::새것();
        let id = 메모리.주장추가("BTC", "추세", "상승", 인식::옴, 레이어::도메인);
        assert_eq!(메모리.셀수(), 1);
        let 셀 = 메모리.셀찾기(id).unwrap();
        assert_eq!(셀.주체(), "BTC");
        assert_eq!(셀.인식상태(), 인식::옴);
    }

    #[test]
    fn 이름표() {
        let mut 메모리 = 기억::새것();
        메모리.이름쓰기("x", 셀값::정수(42));
        assert_eq!(메모리.이름읽기("x").unwrap().정수로(), 42);
        메모리.이름쓰기("x", 셀값::정수(100));
        assert_eq!(메모리.이름읽기("x").unwrap().정수로(), 100);
    }

    #[test]
    fn 연결_따라가기() {
        let mut 메모리 = 기억::새것();
        let a = 메모리.주장추가("A", "상위", "B", 인식::티, 레이어::코어);
        let b = 메모리.주장추가("B", "하위", "A", 인식::티, 레이어::코어);
        메모리.연결(a, b, 인식::티);  // A →▲→ B
        메모리.연결(b, a, 인식::타);  // B →▼→ A
        let 찾은 = 메모리.따라가기(a, 인식::티).unwrap();
        assert_eq!(찾은.주체(), "B");
        let 역 = 메모리.따라가기(b, 인식::타).unwrap();
        assert_eq!(역.주체(), "A");
    }

    #[test]
    fn 레이어_쿼리() {
        let mut 메모리 = 기억::새것();
        메모리.주장추가("X", "이다", "Y", 인식::티, 레이어::코어);
        메모리.주장추가("A", "관련", "B", 인식::옴, 레이어::도메인);
        메모리.주장추가("C", "관련", "D", 인식::티, 레이어::도메인);
        assert_eq!(메모리.레이어셀들(레이어::코어).len(), 1);
        assert_eq!(메모리.레이어셀들(레이어::도메인).len(), 2);
    }
}

impl 기억 {
    /// 변수 선언용: 항상 새 셀 생성 (기존 이름 무시)
    pub fn 새이름쓰기(&mut self, 이름: &str, 값: 셀값) -> u64 {
        if let 셀값::셀참조(참조id) = &값 {
            let 참조id = *참조id;
            self.이름표.insert(이름.to_string(), 참조id);
            return 참조id;
        }
        let id = self.값추가(값);
        self.이름표.insert(이름.to_string(), id);
        id
    }
}
