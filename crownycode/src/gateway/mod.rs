// crownycode/src/gateway/mod.rs
// 무상 게이트웨이 — 개발도상국 제한적 무상 접근 시스템
// 정책: 기본 코드 생성 무제한 무료
//       Claude API 연동 → 월 100회 무료 (초과 시 소액 과금)
//       커뮤니티 기여 → 추가 쿼터 지급

pub mod quota;
pub mod contribute;


/// 개발도상국 코드 목록 (GDP 기준 무상 게이트웨이 적용)
pub const FREE_COUNTRIES: &[(&str, &str)] = &[
    ("KE", "케냐"),       ("TZ", "탄자니아"),   ("NG", "나이지리아"),
    ("IN", "인도"),       ("BD", "방글라데시"),  ("ET", "에티오피아"),
    ("UG", "우간다"),     ("MZ", "모잠비크"),    ("GH", "가나"),
    ("RW", "르완다"),     ("SN", "세네갈"),      ("CI", "코트디부아르"),
    ("CM", "카메룬"),     ("ZM", "잠비아"),      ("MW", "말라위"),
    ("NP", "네팔"),       ("PK", "파키스탄"),    ("MM", "미얀마"),
    ("KH", "캄보디아"),   ("LA", "라오스"),      ("BO", "볼리비아"),
    ("HT", "아이티"),     ("ZW", "짐바브웨"),    ("MG", "마다가스카르"),
    ("SO", "소말리아"),
];

/// 국가 코드가 무상 게이트웨이 대상인지 확인
pub fn is_free_country(country_code: &str) -> bool {
    FREE_COUNTRIES.iter().any(|(code, _)| *code == country_code)
}

/// 국가 코드로 국가명 조회
pub fn country_name(code: &str) -> Option<&'static str> {
    FREE_COUNTRIES.iter().find(|(c, _)| *c == code).map(|(_, n)| *n)
}
