#![allow(dead_code)]
// crownycode/src/developer/level.rs
// 개발자 레벨 시스템
// 레벨은 학습 셀 수 + 성공 생성 수 + 직접 기여 수로 결정

/// 개발자 레벨
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "claude", derive(serde::Serialize, serde::Deserialize))]
pub enum DevLevel {
    /// 씨앗 — 코딩 경험 없음 (0~9 학습셀)
    Seed,
    /// 새싹 — 기초 개념 학습 중 (10~29)
    Sprout,
    /// 탐험가 — 다양한 패턴 시도 (30~74)
    Explorer,
    /// 장인 — 자주 쓰는 패턴 숙달 (75~149)
    Craftsman,
    /// 건축가 — 복잡한 시스템 설계 가능 (150~299)
    Architect,
    /// 창조자 — 새 패턴을 커뮤니티에 기여 (300+)
    Creator,
}

impl DevLevel {
    /// 학습셀 수 → 레벨
    pub fn from_cell_count(n: u32) -> Self {
        match n {
            0..=9   => Self::Seed,
            10..=29 => Self::Sprout,
            30..=74 => Self::Explorer,
            75..=149 => Self::Craftsman,
            150..=299 => Self::Architect,
            _ => Self::Creator,
        }
    }

    pub fn label_ko(&self) -> &'static str {
        match self {
            Self::Seed       => "씨앗",
            Self::Sprout     => "새싹",
            Self::Explorer   => "탐험가",
            Self::Craftsman  => "장인",
            Self::Architect  => "건축가",
            Self::Creator    => "창조자",
        }
    }

    pub fn label_en(&self) -> &'static str {
        match self {
            Self::Seed       => "Seed",
            Self::Sprout     => "Sprout",
            Self::Explorer   => "Explorer",
            Self::Craftsman  => "Craftsman",
            Self::Architect  => "Architect",
            Self::Creator    => "Creator",
        }
    }

    /// 이 레벨의 코드 생성 파라미터
    pub fn codegen_params(&self) -> CodegenParams {
        match self {
            Self::Seed => CodegenParams {
                verbose_comments: true,
                include_docstring: true,
                include_examples: true,
                include_tests: true,
                simplify_patterns: true,
                max_function_lines: 20,
            },
            Self::Sprout => CodegenParams {
                verbose_comments: true,
                include_docstring: true,
                include_examples: false,
                include_tests: true,
                simplify_patterns: true,
                max_function_lines: 40,
            },
            Self::Explorer => CodegenParams {
                verbose_comments: false,
                include_docstring: true,
                include_examples: false,
                include_tests: true,
                simplify_patterns: false,
                max_function_lines: 80,
            },
            Self::Craftsman => CodegenParams {
                verbose_comments: false,
                include_docstring: false,
                include_examples: false,
                include_tests: false,
                simplify_patterns: false,
                max_function_lines: 150,
            },
            Self::Architect | Self::Creator => CodegenParams {
                verbose_comments: false,
                include_docstring: false,
                include_examples: false,
                include_tests: false,
                simplify_patterns: false,
                max_function_lines: 500,
            },
        }
    }

    /// 다음 레벨까지 필요한 셀 수
    pub fn cells_to_next(&self, current_count: u32) -> Option<u32> {
        let next_threshold: u32 = match self {
            Self::Seed       => 10,
            Self::Sprout     => 30,
            Self::Explorer   => 75,
            Self::Craftsman  => 150,
            Self::Architect  => 300,
            Self::Creator    => return None,
        };
        Some(next_threshold.saturating_sub(current_count))
    }
}

/// 레벨별 코드 생성 파라미터
#[derive(Debug, Clone)]
pub struct CodegenParams {
    /// 인라인 주석 포함
    pub verbose_comments: bool,
    /// 함수 docstring 포함
    pub include_docstring: bool,
    /// 사용 예시 포함
    pub include_examples: bool,
    /// 자동 테스트 포함
    pub include_tests: bool,
    /// 복잡한 패턴 단순화 (초보자용)
    pub simplify_patterns: bool,
    /// 함수 최대 줄 수 (넘으면 분할 권고)
    pub max_function_lines: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_from_count() {
        assert_eq!(DevLevel::from_cell_count(0),   DevLevel::Seed);
        assert_eq!(DevLevel::from_cell_count(9),   DevLevel::Seed);
        assert_eq!(DevLevel::from_cell_count(10),  DevLevel::Sprout);
        assert_eq!(DevLevel::from_cell_count(30),  DevLevel::Explorer);
        assert_eq!(DevLevel::from_cell_count(75),  DevLevel::Craftsman);
        assert_eq!(DevLevel::from_cell_count(150), DevLevel::Architect);
        assert_eq!(DevLevel::from_cell_count(300), DevLevel::Creator);
    }

    #[test]
    fn test_seed_verbose() {
        let p = DevLevel::Seed.codegen_params();
        assert!(p.verbose_comments);
        assert!(p.include_tests);
        assert!(p.simplify_patterns);
    }

    #[test]
    fn test_creator_concise() {
        let p = DevLevel::Creator.codegen_params();
        assert!(!p.verbose_comments);
        assert!(!p.include_tests);
    }

    #[test]
    fn test_cells_to_next() {
        assert_eq!(DevLevel::Seed.cells_to_next(5), Some(5));
        assert_eq!(DevLevel::Creator.cells_to_next(500), None);
    }
}
