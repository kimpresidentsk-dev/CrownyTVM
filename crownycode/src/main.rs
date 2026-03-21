// crownycode/src/main.rs — Phase 3

mod cli;
mod pipeline;
#[allow(dead_code)]
mod phase;
mod cell;
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

use anyhow::Result;
use colored::*;

#[tokio::main]
async fn main() -> Result<()> {
    let args = cli::parse();
    if !args.quiet { print_banner(); }

    let content = std::fs::read_to_string(&args.config)
        .unwrap_or_else(|_| include_str!("../crownycode.toml").to_string());
    let config: cli::Config = toml::from_str(&content)?;

    let db = cell::store::CrownyDb::open(&config.engine.cell_db_path)?;

    // Seed 명령은 Engine 생성 전에 처리 (db 소유권 이전 전)
    if let cli::Command::Seed { count } = &args.command {
        let mut net = db.cell_net_mut();
        seed::run_seed(&mut net, *count);
        let _ = net.save(&config.engine.cell_db_path.replace(".db", ".cellnet.bin"));
        drop(net);
        return Ok(());
    }

    let engine = pipeline::Engine::new(config, db);

    match args.command {
        cli::Command::Gen { input, target, verbose } => {
            engine.generate(&input, target.as_deref(), verbose).await?;
        }
        cli::Command::Learn { topic } => {
            engine.learn(&topic).await?;
        }
        cli::Command::Cells { query } => {
            engine.search_cells(query.as_deref())?;
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
        cli::Command::Seed { .. } => unreachable!(),
    }
    Ok(())
}

fn print_banner() {
    println!("{}", "크라우니코드 v0.1".bold().bright_cyan());
    println!("{}", "CrownyOS native code engine".dimmed());
    println!();
}
