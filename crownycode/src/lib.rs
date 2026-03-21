// crownycode/src/lib.rs
// 통합 테스트에서 crownycode::* 경로로 접근하기 위한 라이브러리 진입점

pub mod cli;
pub mod pipeline;
#[allow(dead_code)]
pub mod phase;
pub mod cell;
pub mod learn;
pub mod developer;
pub mod offline;
#[allow(dead_code)]
pub mod gateway;
#[allow(dead_code)]
pub mod isa729;
pub mod crownycore;
#[allow(dead_code)]
pub mod os;
pub mod seed;
