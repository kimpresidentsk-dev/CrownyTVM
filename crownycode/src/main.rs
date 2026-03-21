// crownycode/src/main.rs — Phase 3

mod error;
mod serial;
mod cli;
mod pipeline;
#[allow(dead_code)]
mod phase;
mod cell;
#[cfg(feature = "claude")]
mod learn;
mod developer;
mod offline;
#[allow(dead_code)]
mod isa729;
#[allow(dead_code)]
mod gateway;
mod crownycore;
#[allow(dead_code)]
mod os;
mod seed;
mod color;
mod time_util;
mod config_parser;
mod i18n;
mod template;

use error::Result;
use color::Colorize;

#[cfg(feature = "claude")]
#[tokio::main]
async fn main() -> Result<()> {
    let args = cli::parse();
    if !args.quiet { print_banner(); }

    let content = std::fs::read_to_string(&args.config)
        .unwrap_or_else(|_| include_str!("../crownycode.toml").to_string());
    let config = config_parser::parse_config(&content)?;

    let db = cell::store::CrownyDb::open(&config.engine.cell_db_path)?;

    // 자동 시드: CellNet이 비어있으면 첫 실행 시 자동으로 시드
    {
        let net = db.cell_net();
        if net.is_empty() {
            drop(net);
            let mut net = db.cell_net_mut();
            eprintln!("{}", i18n::msg("auto_seed_start").bright_cyan());
            seed::seed(&mut net, 100);
            let _ = net.save(db.net_path());
            drop(net);
            eprintln!("{}", i18n::msg("auto_seed_done").green());
            eprintln!();
        }
    }

    // Seed 명령은 Engine 생성 전에 처리 (db 소유권 이전 전)
    if let cli::Command::Seed { count } = &args.command {
        let mut net = db.cell_net_mut();
        seed::run_seed(&mut net, *count);
        let _ = net.save(db.net_path());
        drop(net);
        return Ok(());
    }

    let engine = pipeline::Engine::new(config, db);

    match args.command {
        cli::Command::Gen { input, target, verbose, output, explain } => {
            engine.generate(&input, target.as_deref(), verbose, output.as_deref(), explain).await?;
        }
        cli::Command::Learn { topic } => {
            engine.learn(&topic).await?;
        }
        cli::Command::Cells { query } => {
            engine.search_cells(query.as_deref())?;
        }
        cli::Command::Intents { lang } => {
            engine.show_intents(lang.as_deref())?;
        }
        cli::Command::Status => {
            engine.status()?;
        }
        cli::Command::Profile { dev_id } => {
            engine.show_profile(&dev_id)?;
        }
        cli::Command::Snapshot { action, path } => {
            match action.as_str() {
                "export" => engine.export_snapshot(&path)?,
                "import" => engine.import_snapshot(&path)?,
                other => eprintln!("알 수 없는 snapshot 액션: {other} (export | import)"),
            }
        }
        cli::Command::Tutorial => {
            engine.run_tutorial()?;
        }
        cli::Command::Share { output } => {
            engine.share_patterns(&output)?;
        }
        cli::Command::Repl => {
            engine.run_repl()?;
        }
        cli::Command::Teach { intent, file, target } => {
            engine.teach_pattern(&intent, &file, target.as_deref())?;
        }
        cli::Command::Read { file } => {
            engine.read_and_explain(&file)?;
        }
        cli::Command::Scaffold { template, name, target } => {
            engine.scaffold(&template, name.as_deref(), target.as_deref())?;
        }
        cli::Command::Seed { .. } => unreachable!(),
    }
    Ok(())
}

#[cfg(not(feature = "claude"))]
fn main() -> Result<()> {
    let args = cli::parse();
    if !args.quiet { print_banner(); }

    let content = std::fs::read_to_string(&args.config)
        .unwrap_or_else(|_| include_str!("../crownycode.toml").to_string());
    let config = config_parser::parse_config(&content)?;

    let db = cell::store::CrownyDb::open(&config.engine.cell_db_path)?;

    // 자동 시드: CellNet이 비어있으면 첫 실행 시 자동으로 시드
    {
        let net = db.cell_net();
        if net.is_empty() {
            drop(net);
            let mut net = db.cell_net_mut();
            eprintln!("{}", i18n::msg("auto_seed_start").bright_cyan());
            seed::seed(&mut net, 100);
            let _ = net.save(db.net_path());
            drop(net);
            eprintln!("{}", i18n::msg("auto_seed_done").green());
            eprintln!();
        }
    }

    // Seed 명령은 Engine 생성 전에 처리 (db 소유권 이전 전)
    if let cli::Command::Seed { count } = &args.command {
        let mut net = db.cell_net_mut();
        seed::run_seed(&mut net, *count);
        let _ = net.save(db.net_path());
        drop(net);
        return Ok(());
    }

    let engine = pipeline::Engine::new(config, db);

    match args.command {
        cli::Command::Gen { input, target, verbose, output, explain } => {
            engine.generate_sync(&input, target.as_deref(), verbose, output.as_deref(), explain)?;
        }
        cli::Command::Learn { .. } => {
            println!("{}", "Claude 기능 비활성: --features claude 로 빌드하세요".yellow());
        }
        cli::Command::Cells { query } => {
            engine.search_cells(query.as_deref())?;
        }
        cli::Command::Intents { lang } => {
            engine.show_intents(lang.as_deref())?;
        }
        cli::Command::Status => {
            engine.status()?;
        }
        cli::Command::Profile { dev_id } => {
            engine.show_profile(&dev_id)?;
        }
        cli::Command::Snapshot { action, path } => {
            match action.as_str() {
                "export" => engine.export_snapshot(&path)?,
                "import" => engine.import_snapshot(&path)?,
                other => eprintln!("알 수 없는 snapshot 액션: {other} (export | import)"),
            }
        }
        cli::Command::Tutorial => {
            engine.run_tutorial()?;
        }
        cli::Command::Share { output } => {
            engine.share_patterns(&output)?;
        }
        cli::Command::Repl => {
            engine.run_repl()?;
        }
        cli::Command::Teach { intent, file, target } => {
            engine.teach_pattern(&intent, &file, target.as_deref())?;
        }
        cli::Command::Read { file } => {
            engine.read_and_explain(&file)?;
        }
        cli::Command::Scaffold { template, name, target } => {
            engine.scaffold(&template, name.as_deref(), target.as_deref())?;
        }
        cli::Command::Seed { .. } => unreachable!(),
    }
    Ok(())
}

fn print_banner() {
    println!("{}", i18n::msg("banner_name").bold().bright_cyan());
    println!("{}", i18n::msg("banner_desc").dimmed());
    println!();
}
