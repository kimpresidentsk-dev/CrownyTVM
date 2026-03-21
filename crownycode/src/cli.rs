// crownycode/src/cli.rs
// CLI 커맨드 파싱 + 설정 구조체

pub struct Args {
    pub command: Command,
    pub config: String,
    pub quiet: bool,
}

pub enum Command {
    /// 자연어로 코드 생성
    Gen {
        input: String,
        target: Option<String>,
        verbose: bool,
        output: Option<String>,
        explain: bool,
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
        dev_id: String,
    },
    /// 오프라인 셀DB 스냅샷 내보내기/가져오기
    Snapshot {
        action: String,
        path: String,
    },
    /// CellNet에 기본 의도 패턴 시드
    Seed {
        count: usize,
    },
    /// 사용 가능한 의도 목록 표시
    Intents {
        lang: Option<String>,
    },
    /// 대화형 튜토리얼
    Tutorial,
    /// 커뮤니티 패턴 공유용 내보내기
    Share {
        output: String,
    },
}

pub fn parse() -> Args {
    let args: Vec<String> = std::env::args().collect();

    let mut config = "crownycode.toml".to_string();
    let mut quiet = false;

    // Extract global flags
    let mut filtered = Vec::new();
    let mut i = 1; // skip binary name
    while i < args.len() {
        match args[i].as_str() {
            "--config" => {
                if i + 1 < args.len() {
                    config = args[i + 1].clone();
                    i += 2;
                } else {
                    eprintln!("오류: --config 뒤에 경로가 필요합니다");
                    std::process::exit(1);
                }
            }
            "--quiet" | "-q" => {
                quiet = true;
                i += 1;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            _ => {
                filtered.push(args[i].clone());
                i += 1;
            }
        }
    }

    if filtered.is_empty() {
        print_help();
        std::process::exit(1);
    }

    let command = match filtered[0].as_str() {
        "gen" => {
            if filtered.len() < 2 {
                eprintln!("{}", crate::i18n::msg("err_gen_input"));
                std::process::exit(1);
            }
            let mut target = None;
            let mut verbose = false;
            let mut output = None;
            let mut explain = false;
            let mut input_parts = Vec::new();
            let mut j = 1;
            while j < filtered.len() {
                match filtered[j].as_str() {
                    "--target" | "-t" => {
                        if j + 1 < filtered.len() {
                            target = Some(filtered[j + 1].clone());
                            j += 2;
                        } else {
                            eprintln!("오류: --target 뒤에 언어가 필요합니다");
                            std::process::exit(1);
                        }
                    }
                    "--output" | "-o" => {
                        if j + 1 < filtered.len() {
                            output = Some(filtered[j + 1].clone());
                            j += 2;
                        } else {
                            eprintln!("오류: --output 뒤에 파일 경로가 필요합니다");
                            std::process::exit(1);
                        }
                    }
                    "--verbose" | "-v" => {
                        verbose = true;
                        j += 1;
                    }
                    "--explain" | "-e" => {
                        explain = true;
                        j += 1;
                    }
                    _ => {
                        input_parts.push(filtered[j].clone());
                        j += 1;
                    }
                }
            }
            Command::Gen {
                input: input_parts.join(" "),
                target,
                verbose,
                output,
                explain,
            }
        }
        "learn" => {
            if filtered.len() < 2 {
                eprintln!("오류: learn 명령에는 주제가 필요합니다");
                std::process::exit(1);
            }
            Command::Learn { topic: filtered[1..].join(" ") }
        }
        "cells" => {
            let query = if filtered.len() > 1 {
                Some(filtered[1..].join(" "))
            } else {
                None
            };
            Command::Cells { query }
        }
        "status" => Command::Status,
        "profile" => {
            let mut dev_id = "default".to_string();
            let mut j = 1;
            while j < filtered.len() {
                if filtered[j] == "--dev-id" || filtered[j] == "--dev_id" {
                    if j + 1 < filtered.len() {
                        dev_id = filtered[j + 1].clone();
                        j += 2;
                    } else {
                        j += 1;
                    }
                } else {
                    j += 1;
                }
            }
            Command::Profile { dev_id }
        }
        "snapshot" => {
            if filtered.len() < 3 {
                eprintln!("오류: snapshot <export|import> <경로>");
                std::process::exit(1);
            }
            Command::Snapshot {
                action: filtered[1].clone(),
                path: filtered[2].clone(),
            }
        }
        "intents" => {
            let lang = if filtered.len() > 1 {
                Some(filtered[1].clone())
            } else {
                None
            };
            Command::Intents { lang }
        }
        "tutorial" => Command::Tutorial,
        "share" => {
            if filtered.len() < 2 {
                eprintln!("{}: share <output_path>", crate::i18n::msg("err_no_command"));
                std::process::exit(1);
            }
            Command::Share { output: filtered[1].clone() }
        }
        "seed" => {
            let mut count = 50usize;
            let mut j = 1;
            while j < filtered.len() {
                if filtered[j] == "--count" {
                    if j + 1 < filtered.len() {
                        count = filtered[j + 1].parse().unwrap_or(50);
                        j += 2;
                    } else {
                        j += 1;
                    }
                } else {
                    j += 1;
                }
            }
            Command::Seed { count }
        }
        other => {
            eprintln!("{}: {other}", crate::i18n::msg("err_unknown_cmd"));
            print_help();
            std::process::exit(1);
        }
    };

    Args { command, config, quiet }
}

fn print_help() {
    use crate::i18n::msg;
    eprintln!("{} — {}", msg("banner_name"), msg("banner_desc"));
    eprintln!();
    eprintln!("{}", msg("help_usage"));
    eprintln!();
    eprintln!("{}", msg("help_commands"));
    eprintln!("  {}", msg("help_gen"));
    eprintln!("  {}", msg("help_intents"));
    eprintln!("  {}", msg("help_tutorial"));
    eprintln!("  {}", msg("help_status"));
    eprintln!("  {}", msg("help_share"));
    eprintln!("  snapshot <export|import> <path>");
    eprintln!("  seed [--count <N>]");
    eprintln!();
    eprintln!("{}", msg("help_options"));
    eprintln!("  {}", msg("help_config"));
    eprintln!("  {}", msg("help_quiet"));
    eprintln!("  {}", msg("help_help"));
}

// ── 설정 구조체 ──────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Clone)]
pub struct Config {
    pub engine: EngineConfig,
    pub claude: ClaudeConfig,
    pub codegen: CodegenConfig,
    pub gateway: GatewayConfig,
    pub runtime: RuntimeConfig,
    pub snapshot: SnapshotConfig,
}

#[derive(Clone)]
pub struct EngineConfig {
    pub version: String,
    pub default_target: String,
    pub auto_learn: bool,
    pub cell_db_path: String,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct ClaudeConfig {
    pub model: String,
    pub max_tokens: u32,
    pub free_quota: u32,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct CodegenConfig {
    pub verbose_comments: bool,
    pub auto_test: bool,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct GatewayConfig {
    pub enabled: bool,
    pub free_country_codes: Vec<String>,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct RuntimeConfig {
    pub low_power: bool,
    pub max_parallel_cells: u32,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self { low_power: false, max_parallel_cells: 4 }
    }
}

#[derive(Clone)]
pub struct SnapshotConfig {
    pub auto_every: u32,
    pub path: String,
}

impl Default for SnapshotConfig {
    fn default() -> Self {
        Self { auto_every: 50, path: "data/snapshots".to_string() }
    }
}
