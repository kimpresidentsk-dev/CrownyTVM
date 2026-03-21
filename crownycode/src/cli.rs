// crownycode/src/cli.rs
// CLI 커맨드 파싱 + 설정 구조체

use clap::{Parser, Subcommand};
use serde::Deserialize;

#[derive(Parser)]
#[command(name = "crownycode", about = "CrownyOS 네이티브 AI 코드 엔진")]
pub struct Args {
    #[command(subcommand)]
    pub command: Command,

    /// 설정 파일 경로
    #[arg(long, default_value = "crownycode.toml")]
    pub config: String,

    /// 배너 숨김
    #[arg(long, short)]
    pub quiet: bool,
}

#[derive(Subcommand)]
pub enum Command {
    /// 자연어로 코드 생성
    Gen {
        /// 생성 요청 (자연어)
        input: String,
        /// 대상 언어: python | rust | crowny
        #[arg(long, short)]
        target: Option<String>,
        /// 상세 주석 포함
        #[arg(long, short)]
        verbose: bool,
    },
    /// 새 개념을 Claude에게 학습 요청
    Learn {
        topic: String,
    },
    /// 저장된 코드 패턴(셀) 검색
    Cells {
        query: Option<String>,
    },
    /// 엔진 상태 확인
    Status,
    /// 개발자 프로필 확인
    Profile {
        /// 프로필 ID (기본: default)
        #[arg(long, default_value = "default")]
        dev_id: String,
    },
    /// 오프라인 셀DB 스냅샷 내보내기/가져오기
    Snapshot {
        /// export | import
        action: String,
        /// 스냅샷 파일 경로
        path: String,
    },
    /// CellNet에 기본 의도 패턴 시드
    Seed {
        /// 시드할 의도 수 (최대 50)
        #[arg(long, default_value = "50")]
        count: usize,
    },
}

pub fn parse() -> Args {
    Args::parse()
}

// ── 설정 구조체 ──────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct Config {
    pub engine: EngineConfig,
    pub claude: ClaudeConfig,
    pub codegen: CodegenConfig,
    pub gateway: GatewayConfig,
    #[serde(default)]
    pub runtime: RuntimeConfig,
    #[serde(default)]
    pub snapshot: SnapshotConfig,
}

#[derive(Deserialize, Clone)]
pub struct EngineConfig {
    pub version: String,
    pub default_target: String,
    pub auto_learn: bool,
    pub cell_db_path: String,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct ClaudeConfig {
    pub model: String,
    pub max_tokens: u32,
    pub free_quota: u32,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct CodegenConfig {
    pub verbose_comments: bool,
    pub auto_test: bool,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct GatewayConfig {
    pub enabled: bool,
    pub free_country_codes: Vec<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
pub struct RuntimeConfig {
    pub low_power: bool,
    pub max_parallel_cells: u32,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self { low_power: false, max_parallel_cells: 4 }
    }
}

#[derive(Deserialize, Clone)]
pub struct SnapshotConfig {
    pub auto_every: u32,
    pub path: String,
}

impl Default for SnapshotConfig {
    fn default() -> Self {
        Self { auto_every: 50, path: "data/snapshots".to_string() }
    }
}
