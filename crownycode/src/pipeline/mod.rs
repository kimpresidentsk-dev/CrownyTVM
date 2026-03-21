// crownycode/src/pipeline/mod.rs
// ═══════════════════════════════════════════════════════════════
// Engine — CrownyCore 기반 파이프라인 (Step 3 재구축)
// ═══════════════════════════════════════════════════════════════
//
// 이전: 자연어 → KPS → IR → 4상판별 → codegen (선형)
// 지금: 자연어 → KPS → IR → [CrownyCore: 분할→추론→병합] → codegen
//
// 핵심 변경: IR이 곧바로 codegen으로 가지 않는다.
// CrownyCore::think()를 거치면서 확정 셀은 즉시 통과,
// 미확인 셀만 추가 연산, 미인지 셀만 Claude 호출.

pub mod kps;
pub mod ir;
pub mod codegen;

use crate::error::Result;
use crate::color::Colorize;
use crate::i18n::msg;

use crate::cli::Config;
use crate::cell::store::CrownyDb;
use crate::developer::store::DevStore;
use crate::developer::profile::{DeveloperProfile, StepPriority};
use crate::phase::judge::Phase;
#[cfg(feature = "claude")]
use crate::learn::claude::ClaudeLearner;
use crate::crownycore::{CrownyCore, CelAction};

pub struct Engine {
    config: Config,
    db: CrownyDb,
}

impl Engine {
    pub fn new(config: Config, db: CrownyDb) -> Self {
        let dev_store = DevStore::new(db.db_path());
        let _ = dev_store.init_schema();
        Self { config, db }
    }

    /// 코드 생성 — CrownyCore::think() 기반 (async, claude feature)
    #[cfg(feature = "claude")]
    pub async fn generate(&self, input: &str, target: Option<&str>, verbose: bool, output: Option<&str>, explain: bool) -> Result<()> {
        let target = target.unwrap_or(&self.config.engine.default_target).to_string();

        let dev_store = DevStore::new(self.db.db_path());
        let profile = dev_store.get_or_create_default()?;
        let level_params = profile.level.codegen_params();

        println!("{} {}  {}", "입력:".dimmed(), input,
            format!("[{}]", profile.level.label_ko()).bright_cyan());
        println!();

        // ── 1. KPS 파싱 (기존 재사용) ──
        print!("{}", "  [1/5] KPS 파싱...".dimmed());
        let kps_nodes = kps::parse(input)?;
        println!(" {}", "완료".green());

        // ── 2. 한선씨 IR 변환 (기존 재사용) ──
        print!("{}", "  [2/5] 한선씨 IR 변환...".dimmed());
        let mut ir_tree = ir::build(&kps_nodes)?;
        let raw_compound = ir::split_compound_intents(input);
        if raw_compound.len() > 1 {
            ir_tree.sub_intents = raw_compound;
        }
        println!(" {}", "완료".green());

        // ── 2b. 확정 패턴 직접 인출 (O(1) 최적경로) ──
        let lookup_intents = if ir_tree.sub_intents.len() > 1 {
            ir_tree.sub_intents.clone()
        } else {
            vec![ir_tree.intent.clone()]
        };

        let direct_hits: Vec<(String, String, f32)> = {
            let net = self.db.cell_net();
            lookup_intents.iter().filter_map(|intent| {
                net.find_by_intent(intent).and_then(|cell| {
                    if cell.trit_state == crate::cell::TritState::Confirmed {
                        cell.pattern_for(&target).map(|p| (
                            intent.clone(),
                            p.code.clone(),
                            cell.energy,
                        ))
                    } else {
                        None
                    }
                })
            }).collect()
        };

        if !direct_hits.is_empty() && direct_hits.len() == lookup_intents.len() {
            let is_compound = direct_hits.len() > 1;
            let _avg_energy = direct_hits.iter().map(|(_, _, e)| e).sum::<f32>()
                / direct_hits.len() as f32;

            for (intent, _, energy) in &direct_hits {
                println!("  {}  {} [확정 +2] energy:{:.2}",
                    msg("instant_hit").green().bold(), intent.bold(), energy);
            }
            println!("  {}  셀:{} 즉시통과:{} 추가연산:0 절약률:100%",
                msg("stats").dimmed(),
                direct_hits.len(), direct_hits.len());

            let combined_code = if is_compound {
                let mut parts = Vec::new();
                parts.push(format!("// 복합 요청: {} 의도 결합", direct_hits.len()));
                parts.push(format!("// 원문: {}", input));
                parts.push(String::new());
                for (i, (intent, code, _)) in direct_hits.iter().enumerate() {
                    parts.push(format!("// ═══ [{}/{}] {} ═══", i + 1, direct_hits.len(), intent));
                    parts.push(code.clone());
                    parts.push(String::new());
                }
                parts.join("\n")
            } else {
                direct_hits[0].1.clone()
            };

            // Apply parameterization from natural language input
            let combined_code = crate::template::parameterize_code(&combined_code, input);

            let display_code = if explain {
                add_explanations(&combined_code, &target)
            } else {
                combined_code.clone()
            };

            println!("\n{}\n{}\n{}",
                "─".repeat(60).dimmed(), &display_code, "─".repeat(60).dimmed());

            let warnings = validate_syntax(&combined_code, &target);
            if !warnings.is_empty() {
                for w in &warnings {
                    println!("  {} {}", msg("warning").yellow(), w);
                }
            }

            if let Some(path) = output {
                std::fs::write(path, &combined_code)?;
                println!("  {} {}", msg("saved_to").green(), path);
            }

            for (intent, _, energy) in &direct_hits {
                self.db.cell_net_mut().record_usage(intent);
                let mut prof = profile.clone();
                prof.learn_intent(intent, *energy);
                dev_store.upsert_developer(&prof)?;
            }
            dev_store.record_request("default", true)?;

            self.maybe_auto_snapshot()?;
            return Ok(());
        }

        // ── 3. 크라우니코어: 분할→추론→병합 ──
        print!("{}", "  [3/5] 크라우니코어 사고...".dimmed());
        let core = CrownyCore::new();
        let auto_learn = self.config.engine.auto_learn && !self.config.runtime.low_power;
        let think_result = {
            let net = self.db.cell_net();
            core.think(&ir_tree, &net, auto_learn)?
        };
        println!(" {}", "완료".green());

        // ── 연산 절약 통계 출력 ──
        let stats = &think_result.stats;
        println!("  {}  셀:{} 즉시통과:{} 추가연산:{} 절약률:{:.0}%",
            msg("stats").dimmed(),
            stats.total_cells.to_string().bright_cyan(),
            stats.instant_cells.to_string().green(),
            stats.computed_cells.to_string().yellow(),
            stats.savings_ratio * 100.0,
        );

        if verbose {
            for cel in &think_result.cell_results {
                let icon = match &cel.action {
                    CelAction::InstantRetrieve   => "⚡".green(),
                    CelAction::GenerateWithTests => "🔧".yellow(),
                    CelAction::Clarify(_)        => "❓".red(),
                    CelAction::NeedsLearning     => "📚".bright_yellow(),
                    CelAction::FallbackGenerate  => "↩".dimmed(),
                };
                println!("    {} {} [{}] energy:{:.2}",
                    icon, cel.sub_intent.bold(),
                    cel.trit_state.label_ko(), cel.energy);
            }
        }

        // ── 4. 명확화 질문 처리 (오해 셀) ──
        if !think_result.clarifications.is_empty() {
            println!("{}", "\n  의도 충돌 감지:".yellow().bold());
            for q in &think_result.clarifications {
                println!("  → {}", q.yellow());
            }
            let mut prof = profile.clone();
            prof.mark_misunderstood(&ir_tree.intent);
            dev_store.upsert_developer(&prof)?;

            if think_result.stats.instant_cells == 0
                && think_result.stats.computed_cells == 0
                && think_result.stats.unknown_cells == 0
            {
                self.db.cell_net_mut().record_usage(&ir_tree.intent);
                dev_store.record_request("default", false)?;
                return Ok(());
            }
        }

        // ── 미인지 셀의 Claude 학습 처리 ──
        let has_learning_needs = think_result.cell_results.iter()
            .any(|c| c.action == CelAction::NeedsLearning);

        let final_ir = if has_learning_needs && auto_learn {
            print!("{}", "  [3b/5] Claude 학습채널...".bright_yellow());
            let learner = ClaudeLearner::new(self.config.claude.clone());
            match learner.learn_and_ingest(input, &self.db).await {
                Ok(learned_ir) => {
                    println!(" {}", "학습 완료".green());
                    let mut prof = profile.clone();
                    prof.learn_intent(&ir_tree.intent, 0.7);
                    dev_store.upsert_developer(&prof)?;
                    learned_ir
                }
                Err(e) => {
                    println!(" {} ({})", "실패".red(), e);
                    think_result.merged_ir
                }
            }
        } else {
            if has_learning_needs && self.config.runtime.low_power {
                println!("{}", "  low_power 모드: API 비활성. snapshot import로 패턴 추가 가능".dimmed());
            }
            think_result.merged_ir
        };

        // ── 5. 코드 생성 (기존 재사용) ──
        print!("{}", "  [4/5] 코드 생성...".dimmed());
        let phase_meta = confidence_to_phase(think_result.confidence);
        let opts = codegen::GenOptions {
            verbose_comments: verbose || level_params.verbose_comments,
            include_tests: level_params.include_tests
                || think_result.stats.computed_cells > 0,
            phase_meta: phase_meta.clone(),
        };
        let code = codegen::generate(&final_ir, &target, &opts)?;
        // Apply parameterization from natural language input
        let code = crate::template::parameterize_code(&code, input);
        println!(" {}", "완료".green());

        let display_code = if explain {
            add_explanations(&code, &target)
        } else {
            code.clone()
        };
        println!("\n{}\n{}\n{}", "─".repeat(60).dimmed(), display_code, "─".repeat(60).dimmed());

        let warnings = validate_syntax(&code, &target);
        if !warnings.is_empty() {
            for w in &warnings {
                println!("  {} {}", msg("warning").yellow(), w);
            }
        }

        if let Some(path) = output {
            std::fs::write(path, &code)?;
            println!("  {} {}", msg("saved_to").green(), path);
        }

        // ── 5b. CellNet에 패턴 저장 ──
        print!("{}", "  [5/5] 셀 저장...".dimmed());
        {
            let mut net = self.db.cell_net_mut();
            net.upsert_pattern(&ir_tree.intent, &target, &code, think_result.confidence);
            drop(net);
            self.db.save_net()?;
        }
        println!(" {}", "완료".green());

        // ── 개발자 성장 기록 ──
        let success = think_result.confidence > 0.0;
        self.db.cell_net_mut().record_usage(&ir_tree.intent);
        dev_store.record_request("default", success)?;

        if success {
            let mut prof = profile.clone();
            if think_result.confidence >= 0.75 {
                prof.learn_intent(&ir_tree.intent, think_result.confidence);
            } else if think_result.confidence >= 0.40 {
                prof.mark_uncertain(&ir_tree.intent);
            }
            dev_store.upsert_developer(&prof)?;
        }

        self.maybe_auto_snapshot()?;
        Ok(())
    }

    /// 코드 생성 — 동기 버전 (no-claude feature)
    #[cfg(not(feature = "claude"))]
    pub fn generate_sync(&self, input: &str, target: Option<&str>, verbose: bool, output: Option<&str>, explain: bool) -> Result<()> {
        let target = target.unwrap_or(&self.config.engine.default_target).to_string();

        let dev_store = DevStore::new(self.db.db_path());
        let profile = dev_store.get_or_create_default()?;
        let level_params = profile.level.codegen_params();

        println!("{} {}  {}", "입력:".dimmed(), input,
            format!("[{}]", profile.level.label_ko()).bright_cyan());
        println!();

        print!("{}", "  [1/4] KPS 파싱...".dimmed());
        let kps_nodes = kps::parse(input)?;
        println!(" {}", "완료".green());

        print!("{}", "  [2/4] 한선씨 IR 변환...".dimmed());
        let mut ir_tree = ir::build(&kps_nodes)?;
        let raw_compound = ir::split_compound_intents(input);
        if raw_compound.len() > 1 {
            ir_tree.sub_intents = raw_compound;
        }
        println!(" {}", "완료".green());

        // 확정 패턴 직접 인출
        let lookup_intents = if ir_tree.sub_intents.len() > 1 {
            ir_tree.sub_intents.clone()
        } else {
            vec![ir_tree.intent.clone()]
        };

        let direct_hits: Vec<(String, String, f32)> = {
            let net = self.db.cell_net();
            lookup_intents.iter().filter_map(|intent| {
                net.find_by_intent(intent).and_then(|cell| {
                    if cell.trit_state == crate::cell::TritState::Confirmed {
                        cell.pattern_for(&target).map(|p| (
                            intent.clone(),
                            p.code.clone(),
                            cell.energy,
                        ))
                    } else {
                        None
                    }
                })
            }).collect()
        };

        if !direct_hits.is_empty() && direct_hits.len() == lookup_intents.len() {
            let combined_code = if direct_hits.len() > 1 {
                let mut parts = Vec::new();
                for (i, (intent, code, _)) in direct_hits.iter().enumerate() {
                    parts.push(format!("// ═══ [{}/{}] {} ═══", i + 1, direct_hits.len(), intent));
                    parts.push(code.clone());
                }
                parts.join("\n")
            } else {
                direct_hits[0].1.clone()
            };
            // Apply parameterization from natural language input
            let combined_code = crate::template::parameterize_code(&combined_code, input);
            let display_code = if explain {
                add_explanations(&combined_code, &target)
            } else {
                combined_code.clone()
            };
            println!("\n{}\n{}\n{}", "─".repeat(60).dimmed(), &display_code, "─".repeat(60).dimmed());

            let warnings = validate_syntax(&combined_code, &target);
            if !warnings.is_empty() {
                for w in &warnings {
                    println!("  {} {}", msg("warning").yellow(), w);
                }
            }

            if let Some(path) = output {
                std::fs::write(path, &combined_code)?;
                println!("  {} {}", msg("saved_to").green(), path);
            }
            return Ok(());
        }

        // CrownyCore
        print!("{}", "  [3/4] 크라우니코어 사고...".dimmed());
        let core = CrownyCore::new();
        let think_result = {
            let net = self.db.cell_net();
            core.think(&ir_tree, &net, false)?
        };
        println!(" {}", "완료".green());

        let stats = &think_result.stats;
        println!("  {}  셀:{} 즉시통과:{} 추가연산:{} 절약률:{:.0}%",
            msg("stats").dimmed(),
            stats.total_cells.to_string().bright_cyan(),
            stats.instant_cells.to_string().green(),
            stats.computed_cells.to_string().yellow(),
            stats.savings_ratio * 100.0,
        );

        if !think_result.clarifications.is_empty() {
            println!("{}", "\n  의도 충돌 감지:".yellow().bold());
            for q in &think_result.clarifications {
                println!("  → {}", q.yellow());
            }
        }

        print!("{}", "  [4/4] 코드 생성...".dimmed());
        let phase_meta = confidence_to_phase(think_result.confidence);
        let opts = codegen::GenOptions {
            verbose_comments: verbose || level_params.verbose_comments,
            include_tests: level_params.include_tests || think_result.stats.computed_cells > 0,
            phase_meta: phase_meta.clone(),
        };
        let code = codegen::generate(&think_result.merged_ir, &target, &opts)?;
        // Apply parameterization from natural language input
        let code = crate::template::parameterize_code(&code, input);
        println!(" {}", "완료".green());

        let display_code = if explain {
            add_explanations(&code, &target)
        } else {
            code.clone()
        };
        println!("\n{}\n{}\n{}", "─".repeat(60).dimmed(), display_code, "─".repeat(60).dimmed());

        let warnings = validate_syntax(&code, &target);
        if !warnings.is_empty() {
            for w in &warnings {
                println!("  {} {}", msg("warning").yellow(), w);
            }
        }

        if let Some(path) = output {
            std::fs::write(path, &code)?;
            println!("  {} {}", msg("saved_to").green(), path);
        }

        // 저장
        {
            let mut net = self.db.cell_net_mut();
            net.upsert_pattern(&ir_tree.intent, &target, &code, think_result.confidence);
            drop(net);
            self.db.save_net()?;
        }

        self.maybe_auto_snapshot()?;
        Ok(())
    }

    // ── 나머지 메서드: 기존과 동일 ──────────────────────────

    #[cfg(feature = "claude")]
    pub async fn learn(&self, topic: &str) -> Result<()> {
        if self.config.runtime.low_power {
            println!("{}", "low_power 모드에서는 learn을 사용할 수 없습니다.".yellow());
            return Ok(());
        }
        println!("{} {}", "학습:".dimmed(), topic.bold());
        let learner = ClaudeLearner::new(self.config.claude.clone());
        let id = learner.learn_topic(topic, &self.db).await?;
        println!("{} {}", msg("saved_to").green(), id.dimmed());
        Ok(())
    }

    pub fn search_cells(&self, query: Option<&str>) -> Result<()> {
        let net = self.db.cell_net();
        let cells = net.search(query.unwrap_or(""));
        if cells.is_empty() { println!("{}", msg("no_cells").dimmed()); return Ok(()); }
        println!("{}", format!("셀 {}개:", cells.len()).bold());
        for c in &cells {
            let id_str = c.id.to_string();
            let lang = c.best_pattern().map(|p| p.target_lang.as_str()).unwrap_or("?");
            println!("  {} {} [신뢰:{:.2}] [사용:{}]  {}",
                id_str[..8.min(id_str.len())].dimmed(), c.intent.bold(),
                c.energy, c.activation_count, lang.bright_cyan());
        }
        Ok(())
    }

    pub fn show_profile(&self, dev_id: &str) -> Result<()> {
        let dev_store = DevStore::new(self.db.db_path());
        let profile = dev_store.load_developer(dev_id)?
            .unwrap_or_else(|| DeveloperProfile::new(dev_id, "개발자"));

        println!("{}", "── 개발자 프로필 ──".bold());
        println!("  레벨: {} ({})", profile.level.label_ko().bold(), profile.level.label_en());
        println!("  학습: {}개  성공률: {:.0}%",
            profile.known_intents.len(), profile.success_rate() * 100.0);
        if let Some(n) = profile.level.cells_to_next(profile.known_intents.len() as u32) {
            println!("  다음 레벨까지: {}개", n.to_string().yellow());
        }
        if !profile.misunderstood_intents.is_empty() {
            println!("  오해: {}", profile.misunderstood_intents.join(", ").red());
        }
        for step in profile.next_steps().iter().take(3) {
            let icon = match step.priority {
                StepPriority::Critical    => "!".red(),
                StepPriority::Recommended => "*".yellow(),
                StepPriority::Optional    => "·".dimmed(),
            };
            println!("  {} {}", icon, step.intent.bold());
        }
        if profile.is_free_gateway() {
            println!("  {}", "무상 게이트웨이 적용".bright_green());
        }
        Ok(())
    }

    pub fn status(&self) -> Result<()> {
        let count = self.db.cell_net().len() as i64;
        let ds = DevStore::new(self.db.db_path());
        let devs = ds.developer_count().unwrap_or(0);
        let learned = ds.total_learned_intents().unwrap_or(0);
        println!("{}", "크라우니코드 상태".bold());
        println!("  버전: {}  셀: {}  개발자: {}  인텐트: {}",
            self.config.engine.version.bright_cyan(),
            count.to_string().bright_cyan(), devs, learned);
        println!("  자동학습: {}  저전력: {}  엔진: {}",
            if self.config.engine.auto_learn { "ON".green() } else { "OFF".red() },
            if self.config.runtime.low_power { "ON".yellow() } else { "OFF".dimmed() },
            "크라우니코어 v1".bright_cyan());
        Ok(())
    }

    pub fn export_snapshot(&self, path: &str) -> Result<()> {
        crate::offline::snapshot::export(&self.db, path)?;
        println!("{} {}", "스냅샷 저장:".green(), path);
        Ok(())
    }

    pub fn import_snapshot(&self, path: &str) -> Result<()> {
        let n = crate::offline::snapshot::import(&self.db, path)?;
        println!("{} {}개 셀 복원", "임포트:".green(), n);
        Ok(())
    }

    pub fn share_patterns(&self, path: &str) -> Result<()> {
        crate::offline::snapshot::export(&self.db, path)?;
        let net = self.db.cell_net();
        println!("{} {} ({} intents)",
            msg("saved_to").green(), path, net.len());
        println!();
        println!("{}", msg("share_hint").dimmed());
        println!("  {} crownycode snapshot import {}", "$".dimmed(), path);
        Ok(())
    }

    pub fn show_intents(&self, lang_filter: Option<&str>) -> Result<()> {
        let net = self.db.cell_net();
        let mut intents: Vec<(&str, f32, Vec<&str>)> = Vec::new();

        for (_, cell) in net.iter() {
            let langs: Vec<&str> = cell.patterns.iter()
                .map(|p| p.target_lang.as_str())
                .collect();

            if let Some(filter) = lang_filter {
                if !langs.iter().any(|l| l.contains(filter)) {
                    continue;
                }
            }
            intents.push((&cell.intent, cell.energy, langs));
        }

        intents.sort_by(|a, b| a.0.cmp(b.0));

        println!("{}", format!("사용 가능한 의도 {}개:", intents.len()).bold());
        println!();

        // Group by category
        let categories: &[(&str, &[&str])] = &[
            ("웹/네트워크", &["http_server", "rest_api", "websocket_server", "tcp_server", "web_scraper", "url_router"]),
            ("알고리즘", &["sort_function", "binary_search"]),
            ("파일", &["file_reader", "file_writer"]),
            ("파서", &["json_parser", "csv_parser", "html_parser", "xml_parser", "regex_matcher"]),
            ("DB/캐시", &["database_client", "sql_query", "cache_client", "redis_client", "orm_model"]),
            ("CLI/설정", &["cli_tool", "argument_parser", "config_loader"]),
            ("인증/보안", &["auth_handler", "jwt_handler", "encryption", "hashing"]),
            ("비동기/작업", &["queue_worker", "task_scheduler", "cron_job"]),
            ("로깅", &["logger", "metrics_collector"]),
            ("데이터", &["data_processor", "serializer", "deserializer", "compression"]),
            ("미들웨어", &["middleware", "rate_limiter", "validator"]),
            ("출력", &["email_sender", "image_processor", "pdf_generator"]),
            ("테스트", &["unit_test", "integration_test"]),
            ("패턴", &["template_engine", "state_machine", "event_emitter", "observer_pattern", "factory_pattern", "singleton_pattern", "builder_pattern"]),
        ];

        for (cat_name, cat_intents) in categories {
            let found: Vec<_> = intents.iter()
                .filter(|(name, _, _)| cat_intents.contains(name))
                .collect();
            if found.is_empty() { continue; }

            println!("  {} {}", "─".dimmed(), cat_name.bold());
            for (name, energy, langs) in &found {
                let lang_str = langs.join(", ");
                let state = if *energy >= 0.75 { "확정".green() } else { "미확인".yellow() };
                println!("    {} {} [{}] ({})", "·".dimmed(), name, state, lang_str.dimmed());
            }
        }

        // Show uncategorized
        let all_categorized: Vec<&str> = categories.iter()
            .flat_map(|(_, cat_intents)| cat_intents.iter().copied())
            .collect();
        let uncategorized: Vec<_> = intents.iter()
            .filter(|(name, _, _)| !all_categorized.contains(name))
            .collect();
        if !uncategorized.is_empty() {
            println!("  {} {}", "─".dimmed(), "기타".bold());
            for (name, _, langs) in &uncategorized {
                println!("    {} {} ({})", "·".dimmed(), name, langs.join(", ").dimmed());
            }
        }

        println!();
        println!("{}", "사용법: crownycode gen \"<의도 설명>\" -t <python|rust>".dimmed());
        Ok(())
    }

    /// 코드 파일 읽기 + 줄별 설명 (read 명령)
    pub fn read_and_explain(&self, file_path: &str) -> Result<()> {
        let code = std::fs::read_to_string(file_path)
            .map_err(|e| crate::error::err!("파일 읽기 실패: {}: {}", file_path, e))?;

        let lang = detect_lang_from_ext(file_path);

        println!("{} {} ({}, {} 줄)",
            "분석:".bold().bright_cyan(), file_path, lang, code.lines().count());
        println!();

        // File summary
        let summary = analyze_code(&code, lang);
        println!("{}", "요약:".bold());
        for item in &summary {
            println!("  {} {}", "·".dimmed(), item);
        }
        println!();

        // Line-by-line explanation
        println!("{}", "코드:".bold());
        for (i, line) in code.lines().enumerate() {
            let num = format!("{:4}", i + 1).dimmed();
            let explanation = explain_line(line.trim());
            if let Some(exp) = explanation {
                println!("{} {} {} {}", num, line, "//".dimmed(), exp.dimmed());
            } else {
                println!("{} {}", num, line);
            }
        }

        Ok(())
    }

    /// 프로젝트 스캐폴딩 (scaffold 명령)
    pub fn scaffold(&self, template: &str, name: Option<&str>, target: Option<&str>) -> Result<()> {
        let project_name = name.unwrap_or("my_project");
        let lang = target.unwrap_or(&self.config.engine.default_target);

        // Determine which intents to combine for this template
        let intents: Vec<&str> = match template {
            "rest-api" | "rest" | "api" => vec!["rest_api", "config_loader", "logger", "health_check", "cors_middleware", "env_config"],
            "cli" | "cli-tool" => vec!["cli_tool", "argument_parser", "config_loader", "logger", "color_output"],
            "web-server" | "web" => vec!["http_server", "static_file_server", "cors_middleware", "logger", "health_check"],
            "crud" | "crud-api" => vec!["rest_api", "database_client", "validator", "pagination", "health_check"],
            "auth-api" => vec!["rest_api", "auth_handler", "jwt_handler", "password_hasher", "session_manager", "cors_middleware"],
            "microservice" => vec!["rest_api", "health_check", "logger", "metrics_collector", "env_config", "circuit_breaker"],
            "data-pipeline" | "etl" => vec!["etl_pipeline", "csv_parser", "json_parser", "database_client", "logger"],
            "websocket" | "chat" => vec!["websocket_chat", "auth_handler", "logger", "redis_client"],
            _ => {
                println!("{}", "사용 가능한 템플릿:".bold());
                println!("  rest-api      REST API 서버 (라우팅, 설정, 로깅, CORS)");
                println!("  cli           CLI 도구 (인자 파서, 설정, 색상 출력)");
                println!("  web-server    웹 서버 (정적 파일, CORS, 로깅)");
                println!("  crud          CRUD API (REST + DB + 검증 + 페이지네이션)");
                println!("  auth-api      인증 API (JWT, 비밀번호 해싱, 세션)");
                println!("  microservice  마이크로서비스 (헬스체크, 메트릭, 서킷브레이커)");
                println!("  data-pipeline 데이터 파이프라인 (ETL, CSV, JSON, DB)");
                println!("  websocket     웹소켓 채팅 (인증, Redis)");
                return Ok(());
            }
        };

        // Create project directory
        std::fs::create_dir_all(project_name)?;

        println!("{} {} ({})", "프로젝트 생성:".bold().bright_cyan(), project_name, template);
        println!();

        // Generate main file
        let net = self.db.cell_net();
        let mut main_parts = Vec::new();
        main_parts.push(format!("// {} — Generated by CrownyCode", project_name));
        main_parts.push(format!("// Template: {}", template));
        main_parts.push(String::new());

        for intent in &intents {
            if let Some(cell) = net.find_by_intent(intent) {
                if let Some(pattern) = cell.pattern_for(lang) {
                    main_parts.push(format!("// ── {} ──", intent));
                    main_parts.push(pattern.code.clone());
                    main_parts.push(String::new());
                }
            }
        }
        drop(net);

        let ext = match lang {
            "python" | "py" => "py",
            "rust" | "rs" => "rs",
            "javascript" | "js" => "js",
            _ => "txt",
        };

        let main_file = format!("{}/main.{}", project_name, ext);
        let main_code = main_parts.join("\n");
        std::fs::write(&main_file, &main_code)?;
        println!("  {} {} ({} 줄)", "생성:".green(), main_file, main_code.lines().count());

        // Generate dependency file
        let deps_file = match lang {
            "python" | "py" => {
                let deps = generate_python_requirements(&intents);
                let path = format!("{}/requirements.txt", project_name);
                std::fs::write(&path, &deps)?;
                Some(path)
            }
            "rust" | "rs" => {
                let deps = generate_cargo_toml(project_name, &intents);
                let path = format!("{}/Cargo.toml", project_name);
                std::fs::write(&path, &deps)?;
                Some(path)
            }
            "javascript" | "js" => {
                let deps = generate_package_json(project_name, &intents);
                let path = format!("{}/package.json", project_name);
                std::fs::write(&path, &deps)?;
                Some(path)
            }
            _ => None,
        };
        if let Some(ref path) = deps_file {
            println!("  {} {}", "생성:".green(), path);
        }

        // Generate README
        let readme = format!("# {}\n\nGenerated by CrownyCode (template: {})\n\n## Run\n\n```bash\n{}\n```\n",
            project_name, template,
            match lang {
                "python" | "py" => "pip install -r requirements.txt\npython main.py".to_string(),
                "rust" | "rs" => "cargo run".to_string(),
                "javascript" | "js" => "npm install\nnode main.js".to_string(),
                _ => "see main file".to_string(),
            });
        let readme_path = format!("{}/README.md", project_name);
        std::fs::write(&readme_path, &readme)?;
        println!("  {} {}", "생성:".green(), readme_path);

        println!();
        println!("{}", format!("cd {} && {}", project_name, match lang {
            "python" | "py" => "python main.py",
            "rust" | "rs" => "cargo run",
            "javascript" | "js" => "node main.js",
            _ => "cat main.*",
        }).dimmed());

        Ok(())
    }

    pub fn run_tutorial(&self) -> Result<()> {
        println!("{}", "═══ 크라우니코드 튜토리얼 ═══".bold().bright_cyan());
        println!();
        println!("CrownyCode는 자연어로 코드를 생성합니다.");
        println!("5개 언어를 지원합니다: 한국어, English, Kiswahili, हिंदी, Português");
        println!();

        println!("{}", "단계 1: 기본 코드 생성".bold());
        println!("  {} crownycode gen \"HTTP 서버 만들어줘\" -t rust", "$".dimmed());
        println!("  {} crownycode gen \"create a sort function\" -t python", "$".dimmed());
        println!("  {} crownycode gen \"tengeneza seva ya wavuti\" -t rust", "$".dimmed());
        println!();

        println!("{}", "단계 2: 파일로 저장".bold());
        println!("  {} crownycode gen \"REST API\" -t python -o api.py", "$".dimmed());
        println!();

        println!("{}", "단계 3: 코드 설명 보기".bold());
        println!("  {} crownycode gen \"HTTP 서버\" -t rust --explain", "$".dimmed());
        println!();

        println!("{}", "단계 4: 복합 요청".bold());
        println!("  {} crownycode gen \"사용자 입력을 받아서 DB에 저장하는 API\" -t rust", "$".dimmed());
        println!("  → validator + database_client + rest_api 3개 의도가 자동 결합됩니다");
        println!();

        println!("{}", "단계 5: 사용 가능한 의도 확인".bold());
        println!("  {} crownycode intents", "$".dimmed());
        println!("  → 51개 의도가 카테고리별로 표시됩니다");
        println!();

        println!("{}", "단계 6: JavaScript/TypeScript".bold());
        println!("  {} crownycode gen \"REST API\" -t javascript", "$".dimmed());
        println!("  {} crownycode gen \"JSON parser\" -t js", "$".dimmed());
        println!();

        println!("{}", "단계 7: REPL 모드".bold());
        println!("  {} crownycode repl", "$".dimmed());
        println!("  → 대화형 코드 생성, /modify로 수정, /teach로 학습");
        println!();

        println!("{}", "단계 8: 패턴 학습".bold());
        println!("  {} crownycode teach redis_pubsub server.py", "$".dimmed());
        println!("  → 파일에서 새로운 패턴을 학습시킵니다");
        println!();

        println!("{}", "단계 9: 코드 파일 분석".bold());
        println!("  {} crownycode read main.py", "$".dimmed());
        println!("  → 파일을 줄별로 분석하고 설명합니다");
        println!();

        println!("{}", "단계 10: 프로젝트 스캐폴딩".bold());
        println!("  {} crownycode scaffold rest-api -n my_api -t python", "$".dimmed());
        println!("  {} crownycode new cli -n my_tool -t rust", "$".dimmed());
        println!("  → 템플릿: rest-api, cli, web-server, crud, auth-api, microservice, data-pipeline, websocket");
        println!();

        println!("{}", "지원 언어:".bold());
        println!("  출력: Python, Rust, JavaScript/TypeScript");
        println!("  입력: 한국어, English, Kiswahili, हिंदी, Português-BR");
        println!();

        let cell_count = self.db.cell_net().len();
        println!("{} 현재 {}개 의도 패턴이 설치되어 있습니다.", "상태:".bright_cyan(), cell_count);
        if cell_count == 0 {
            println!("  {} crownycode seed --count 200", "시드 설치:".yellow());
        }

        Ok(())
    }

    pub fn run_repl(&self) -> Result<()> {
        use std::io::{stdin, stdout, Write, BufRead};

        println!("{}", "크라우니코드 REPL — 대화형 코드 생성".bold().bright_cyan());
        println!("{}", "명령: /target <lang>, /explain, /save <path>, /modify <instruction>, /quit".dimmed());
        println!();

        let mut current_target = self.config.engine.default_target.clone();
        let mut current_code = String::new();
        let mut explain_mode = false;

        loop {
            print!("{} ", format!("crowny({})", current_target).green());
            stdout().flush()?;

            let mut input = String::new();
            if stdin().lock().read_line(&mut input).is_err() || input.is_empty() {
                break;
            }
            let input = input.trim();
            if input.is_empty() { continue; }

            // REPL commands
            if input.starts_with('/') {
                let parts: Vec<&str> = input.splitn(2, ' ').collect();
                match parts[0] {
                    "/quit" | "/exit" | "/q" => {
                        println!("{}", "안녕히!".dimmed());
                        break;
                    }
                    "/target" | "/t" => {
                        if parts.len() > 1 {
                            current_target = parts[1].to_string();
                            println!("  {} {}", "타겟:".bright_cyan(), current_target);
                        } else {
                            println!("  현재 타겟: {}", current_target.bright_cyan());
                        }
                    }
                    "/explain" | "/e" => {
                        explain_mode = !explain_mode;
                        println!("  설명 모드: {}", if explain_mode { "ON".green() } else { "OFF".dimmed() });
                    }
                    "/save" | "/s" => {
                        if parts.len() > 1 && !current_code.is_empty() {
                            match std::fs::write(parts[1], &current_code) {
                                Ok(_) => println!("  {} {}", msg("saved_to").green(), parts[1]),
                                Err(e) => println!("  {} {}", "오류:".red(), e),
                            }
                        } else if current_code.is_empty() {
                            println!("  {}", "저장할 코드가 없습니다. 먼저 생성하세요.".yellow());
                        } else {
                            println!("  사용법: /save <파일경로>");
                        }
                    }
                    "/modify" | "/m" => {
                        if parts.len() > 1 && !current_code.is_empty() {
                            let instruction = parts[1];
                            current_code = apply_modification(&current_code, instruction, &current_target);
                            println!("{}", "─".repeat(50).dimmed());
                            if explain_mode {
                                println!("{}", add_explanations(&current_code, &current_target));
                            } else {
                                println!("{}", &current_code);
                            }
                            println!("{}", "─".repeat(50).dimmed());
                        } else {
                            println!("  사용법: /modify <수정 지시> (예: /modify 포트를 3000으로)");
                        }
                    }
                    "/code" | "/c" => {
                        if !current_code.is_empty() {
                            println!("{}", "─".repeat(50).dimmed());
                            println!("{}", &current_code);
                            println!("{}", "─".repeat(50).dimmed());
                        } else {
                            println!("  {}", "생성된 코드가 없습니다.".dimmed());
                        }
                    }
                    "/teach" => {
                        if parts.len() > 1 && !current_code.is_empty() {
                            let intent = parts[1].replace(' ', "_").to_lowercase();
                            self.db.cell_net_mut().upsert_pattern(&intent, &current_target, &current_code, 0.85);
                            let _ = self.db.save_net();
                            println!("  {} '{}' 패턴으로 저장됨 ({})", "학습:".bright_cyan(), intent, current_target);
                        } else {
                            println!("  사용법: /teach <의도이름> (예: /teach redis_pubsub)");
                        }
                    }
                    "/intents" | "/i" => {
                        let net = self.db.cell_net();
                        println!("  {} 의도 {}개 저장됨", "상태:".dimmed(), net.len());
                    }
                    "/help" | "/h" => {
                        println!("  /target <lang>   — 출력 언어 변경 (python, rust, js)");
                        println!("  /explain         — 설명 모드 토글");
                        println!("  /save <path>     — 현재 코드를 파일로 저장");
                        println!("  /modify <지시>   — 현재 코드 수정 (포트 변경, 에러 처리 등)");
                        println!("  /code            — 현재 코드 다시 보기");
                        println!("  /teach <intent>  — 현재 코드를 새 패턴으로 학습");
                        println!("  /intents         — 저장된 의도 수");
                        println!("  /quit            — 종료");
                    }
                    other => {
                        println!("  {} /help 로 명령 확인", format!("알 수 없는 명령: {}", other).yellow());
                    }
                }
                continue;
            }

            // Generate code from natural language input
            let lookup_intents = ir::split_compound_intents(input);
            let direct_hits: Vec<(String, String, f32)> = {
                let net = self.db.cell_net();
                lookup_intents.iter().filter_map(|intent| {
                    net.find_by_intent(intent).and_then(|cell| {
                        if cell.trit_state == crate::cell::TritState::Confirmed {
                            cell.pattern_for(&current_target).map(|p| (
                                intent.clone(), p.code.clone(), cell.energy,
                            ))
                        } else {
                            None
                        }
                    })
                }).collect()
            };

            // Also try single intent normalization
            let single_intent = {
                let kps_nodes = kps::parse(input)?;
                let ir = ir::build(&kps_nodes)?;
                ir.intent.clone()
            };

            let code = if !direct_hits.is_empty() {
                let combined = if direct_hits.len() > 1 {
                    let mut parts = vec![format!("// 복합: {}", input)];
                    for (i, (intent, code, _)) in direct_hits.iter().enumerate() {
                        parts.push(format!("// ═══ [{}/{}] {} ═══", i + 1, direct_hits.len(), intent));
                        parts.push(code.clone());
                        parts.push(String::new());
                    }
                    parts.join("\n")
                } else {
                    direct_hits[0].1.clone()
                };
                for (intent, _, energy) in &direct_hits {
                    println!("  {} {} [energy:{:.2}]", msg("instant_hit").green(), intent.bold(), energy);
                }
                combined
            } else {
                // Try single intent direct hit
                let hit = {
                    let net = self.db.cell_net();
                    net.find_by_intent(&single_intent).and_then(|cell| {
                        if cell.trit_state == crate::cell::TritState::Confirmed {
                            cell.pattern_for(&current_target).map(|p| p.code.clone())
                        } else {
                            None
                        }
                    })
                };
                if let Some(code) = hit {
                    println!("  {} {} [확정]", msg("instant_hit").green(), single_intent.bold());
                    code
                } else {
                    println!("  {} '{}'", "미인지:".yellow(), single_intent);
                    println!("  {}", "힌트: /teach <intent> 로 직접 패턴을 등록할 수 있습니다".dimmed());
                    continue;
                }
            };

            // Apply parameterization
            current_code = crate::template::parameterize_code(&code, input);

            println!("{}", "─".repeat(50).dimmed());
            if explain_mode {
                println!("{}", add_explanations(&current_code, &current_target));
            } else {
                println!("{}", &current_code);
            }
            println!("{}", "─".repeat(50).dimmed());
        }

        Ok(())
    }

    pub fn teach_pattern(&self, intent: &str, file_path: &str, target: Option<&str>) -> Result<()> {
        let code = std::fs::read_to_string(file_path)
            .map_err(|e| crate::error::err!("파일 읽기 실패: {}: {}", file_path, e))?;

        // Detect language from file extension if not specified
        let lang = target.unwrap_or_else(|| {
            if file_path.ends_with(".py") { "python" }
            else if file_path.ends_with(".rs") { "rust" }
            else if file_path.ends_with(".js") || file_path.ends_with(".ts") { "javascript" }
            else { "rust" }
        });

        self.db.cell_net_mut().upsert_pattern(intent, lang, &code, 0.85);
        self.db.save_net()?;

        println!("  {} '{}' [{}] — {} 줄",
            "학습 완료:".green().bold(),
            intent.bold(),
            lang.bright_cyan(),
            code.lines().count());
        Ok(())
    }

    fn maybe_auto_snapshot(&self) -> Result<()> {
        let every = self.config.snapshot.auto_every;
        if every == 0 { return Ok(()); }
        let count = self.db.cell_net().len() as i64;
        if count > 0 && count % every as i64 == 0 {
            std::fs::create_dir_all(&self.config.snapshot.path)?;
            let path = format!("{}/snap_{count}.bin", self.config.snapshot.path);
            self.export_snapshot(&path)?;
        }
        Ok(())
    }
}

/// Apply a modification instruction to existing code
fn apply_modification(code: &str, instruction: &str, lang: &str) -> String {
    let lower = instruction.to_lowercase();
    let mut result = code.to_string();

    // Port change: "포트를 3000으로", "change port to 3000", "port 3000"
    if lower.contains("포트") || lower.contains("port") || lower.contains("bandari") {
        if let Some(port) = extract_number(&lower) {
            result = result.replace("8080", &port.to_string());
            result = result.replace("3000", &port.to_string());
            result = result.replace("9000", &port.to_string());
            result = result.replace("8765", &port.to_string());
        }
    }

    // Add error handling: "에러 핸들링", "error handling", "handle errors"
    if lower.contains("에러") || lower.contains("error") || lower.contains("오류") {
        match lang {
            "python" | "py" => {
                result = wrap_python_try_except(&result);
            }
            "rust" | "rs" => {
                result = result.replace(".unwrap()", "?");
            }
            "javascript" | "js" => {
                result = wrap_js_try_catch(&result);
            }
            _ => {}
        }
    }

    // Add logging: "로깅 추가", "add logging"
    if lower.contains("로깅") || lower.contains("logging") || lower.contains("로그") || lower.contains("log") {
        match lang {
            "python" | "py" => {
                if !result.contains("import logging") {
                    result = format!("import logging\nlogging.basicConfig(level=logging.INFO)\nlogger = logging.getLogger(__name__)\n\n{}", result);
                }
            }
            "rust" | "rs" => {
                if !result.contains("eprintln!") {
                    result = result.replace("fn main() {", "fn main() {\n    eprintln!(\"[INFO] 서버 시작\");");
                }
            }
            "javascript" | "js" => {
                if !result.contains("console.log") {
                    result = result.replace("app.listen", "console.log('Server starting...');\napp.listen");
                }
            }
            _ => {}
        }
    }

    // Async conversion: "비동기로", "make async"
    if lower.contains("비동기") || lower.contains("async") {
        match lang {
            "python" | "py" => {
                result = result.replace("def ", "async def ");
                if !result.contains("import asyncio") {
                    result = format!("import asyncio\n\n{}", result);
                }
            }
            "javascript" | "js" => {
                result = result.replace("function ", "async function ");
            }
            _ => {}
        }
    }

    result
}

fn extract_number(s: &str) -> Option<u64> {
    s.split_whitespace()
        .filter_map(|w| w.parse::<u64>().ok())
        .next()
}

fn wrap_python_try_except(code: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push("try:".to_string());
    for line in code.lines() {
        lines.push(format!("    {}", line));
    }
    lines.push("except Exception as e:".to_string());
    lines.push("    print(f\"오류: {e}\")".to_string());
    lines.join("\n")
}

fn wrap_js_try_catch(code: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push("try {".to_string());
    for line in code.lines() {
        lines.push(format!("  {}", line));
    }
    lines.push("} catch (error) {".to_string());
    lines.push("  console.error('Error:', error.message);".to_string());
    lines.push("}".to_string());
    lines.join("\n")
}

/// 생성된 코드의 기본 구문 검증
fn validate_syntax(code: &str, lang: &str) -> Vec<String> {
    let mut warnings = Vec::new();

    // Check balanced delimiters
    let mut braces = 0i32;
    let mut parens = 0i32;
    let mut brackets = 0i32;
    for ch in code.chars() {
        match ch {
            '{' => braces += 1, '}' => braces -= 1,
            '(' => parens += 1, ')' => parens -= 1,
            '[' => brackets += 1, ']' => brackets -= 1,
            _ => {}
        }
    }
    if braces != 0 { warnings.push(format!("Brace imbalance: {}", if braces > 0 { "extra {" } else { "extra }" })); }
    if parens != 0 { warnings.push(format!("Paren imbalance: {}", if parens > 0 { "extra (" } else { "extra )" })); }
    if brackets != 0 { warnings.push(format!("Bracket imbalance: {}", if brackets > 0 { "extra [" } else { "extra ]" })); }

    // Language-specific checks
    match lang {
        "python" | "py" => {
            if code.contains("def ") && !code.contains(':') {
                warnings.push("Python function missing colon (:)".to_string());
            }
        }
        "rust" | "rs" => {
            if code.contains("fn ") && !code.contains('{') {
                warnings.push("Rust function missing brace".to_string());
            }
        }
        "javascript" | "js" => {
            if code.contains("function ") && !code.contains('{') {
                warnings.push("JS function missing brace".to_string());
            }
        }
        _ => {}
    }

    warnings
}

/// confidence → Phase 변환 (codegen 호환)
fn confidence_to_phase(confidence: f32) -> Phase {
    match confidence {
        c if c >= 0.75 => Phase::Confirmed,
        c if c >= 0.40 => Phase::Uncertain,
        c if c >= 0.15 => Phase::Misunderstood,
        _              => Phase::Unknown,
    }
}

/// 코드에 줄별 설명 추가 (--explain 모드)
pub fn add_explanations(code: &str, _lang: &str) -> String {
    let mut result = Vec::new();
    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            result.push(line.to_string());
            continue;
        }
        let explanation = explain_line(trimmed);
        if let Some(exp) = explanation {
            result.push(format!("{}  // <- {}", line, exp));
        } else {
            result.push(line.to_string());
        }
    }
    result.join("\n")
}

/// Localized explanation helper — picks string by user language
fn localized_explanation(ko: &'static str, en: &'static str, sw: &'static str, hi: &'static str) -> &'static str {
    match crate::i18n::detect_lang() {
        "ko" => ko,
        "sw" => sw,
        "hi" => hi,
        _ => en,
    }
}

/// 코드 줄 패턴별 설명 생성 (다국어)
fn explain_line(line: &str) -> Option<&'static str> {
    let l = line.to_lowercase();
    // Python
    if l.contains("import ") || (l.contains("from ") && l.contains("import")) {
        return Some(localized_explanation("라이브러리 가져오기", "import library", "ingiza maktaba", "लाइब्रेरी आयात"));
    }
    if l.contains("def ") {
        return Some(localized_explanation("함수 정의", "function definition", "ufafanuzi wa kazi", "फ़ंक्शन परिभाषा"));
    }
    if l.contains("class ") && !l.contains("// class") {
        return Some(localized_explanation("클래스 정의", "class definition", "ufafanuzi wa darasa", "क्लास परिभाषा"));
    }
    if l.starts_with("return ") || l.starts_with("    return") {
        return Some(localized_explanation("결과 반환", "return result", "rudisha matokeo", "परिणाम वापसी"));
    }
    if l.contains("if __name__") {
        return Some(localized_explanation("직접 실행 시에만 동작", "run only when executed directly", "endesha tu inapotekelezwa moja kwa moja", "सीधे चलाने पर ही काम करे"));
    }
    if l.contains("for ") && l.contains(" in ") {
        return Some(localized_explanation("반복문", "loop", "kitanzi", "लूप"));
    }
    if l.contains("while ") && !l.contains("//") {
        return Some(localized_explanation("조건 반복", "loop", "kitanzi", "लूप"));
    }
    if l.contains(".append(") {
        return Some(localized_explanation("목록에 추가", "add to list", "ongeza kwenye orodha", "सूची में जोड़ें"));
    }
    if l.contains("print(") || l.contains("println!") {
        return Some(localized_explanation("화면 출력", "print output", "chapisha matokeo", "आउटपुट प्रिंट"));
    }
    // Rust
    if l.starts_with("use ") {
        return Some(localized_explanation("라이브러리 가져오기", "import library", "ingiza maktaba", "लाइब्रेरी आयात"));
    }
    if l.starts_with("fn ") || l.contains("pub fn ") || l.contains("async fn ") {
        return Some(localized_explanation("함수 정의", "function definition", "ufafanuzi wa kazi", "फ़ंक्शन परिभाषा"));
    }
    if l.starts_with("struct ") || l.contains("pub struct ") {
        return Some(localized_explanation("구조체 정의", "struct definition", "ufafanuzi wa darasa", "स्ट्रक्ट परिभाषा"));
    }
    if l.contains("impl ") {
        return Some(localized_explanation("구현 블록", "implementation block", "kizuizi cha utekelezaji", "इम्प्लीमेंटेशन ब्लॉक"));
    }
    if l.contains("let ") && l.contains("= ") {
        return Some(localized_explanation("변수 선언", "variable declaration", "tamko la kigezo", "वेरिएबल घोषणा"));
    }
    if l.contains(".unwrap()") {
        return Some(localized_explanation("값 추출 (실패 시 중단)", "unwrap value (panic on failure)", "toa thamani (simama ikishindwa)", "वैल्यू निकालें (विफल होने पर रुकें)"));
    }
    if l.contains(".await") {
        return Some(localized_explanation("비동기 대기", "async operation", "operesheni ya async", "एसिंक ऑपरेशन"));
    }
    if l.contains("match ") {
        return Some(localized_explanation("패턴 매칭", "condition", "sharti", "शर्त"));
    }
    if l.contains("Vec<") {
        return Some(localized_explanation("동적 배열", "dynamic array", "safu inayobadilika", "डायनेमिक एरे"));
    }
    if l.contains("HashMap") {
        return Some(localized_explanation("키-값 맵", "key-value map", "ramani ya ufunguo-thamani", "की-वैल्यू मैप"));
    }
    if l.contains("Option<") {
        return Some(localized_explanation("있을 수도 없을 수도 있는 값", "optional value", "thamani ya hiari", "वैकल्पिक वैल्यू"));
    }
    if l.contains("Result<") {
        return Some(localized_explanation("성공 또는 실패", "error handling", "kushughulikia makosa", "एरर हैंडलिंग"));
    }
    if l.contains("#[tokio::main]") {
        return Some(localized_explanation("비동기 메인 함수", "async main function", "kazi kuu ya async", "एसिंक मेन फ़ंक्शन"));
    }
    if l.contains("#[test]") {
        return Some(localized_explanation("테스트 함수", "test function", "kazi ya jaribio", "टेस्ट फ़ंक्शन"));
    }
    if l.contains("#[derive(") {
        return Some(localized_explanation("자동 구현 매크로", "derive macro", "makro ya kupata", "डेराइव मैक्रो"));
    }
    if l.contains("TcpListener") || l.contains("bind(") {
        return Some(localized_explanation("서버 포트 열기", "open server port", "fungua bandari ya seva", "सर्वर पोर्ट खोलें"));
    }
    if l.contains(".listen(") || l.contains(".incoming()") {
        return Some(localized_explanation("연결 대기", "wait for connections", "subiri miunganisho", "कनेक्शन की प्रतीक्षा"));
    }
    if l.contains(".write_all(") || l.contains(".send(") {
        return Some(localized_explanation("데이터 전송", "send data", "tuma data", "डेटा भेजें"));
    }
    if l.contains(".read(") {
        return Some(localized_explanation("데이터 읽기", "read data", "soma data", "डेटा पढ़ें"));
    }
    if l.contains("Router::new()") {
        return Some(localized_explanation("URL 라우터 생성", "create URL router", "unda kipanga njia cha URL", "URL राउटर बनाएं"));
    }
    if l.contains(".route(") {
        return Some(localized_explanation("경로 등록", "register route", "sajili njia", "रूट रजिस्टर करें"));
    }
    // JavaScript
    if l.contains("require(") {
        return Some(localized_explanation("모듈 가져오기", "import library", "ingiza maktaba", "लाइब्रेरी आयात"));
    }
    if l.contains("module.exports") {
        return Some(localized_explanation("모듈 내보내기", "export module", "hamisha moduli", "मॉड्यूल निर्यात"));
    }
    if l.contains("express()") {
        return Some(localized_explanation("Express 앱 생성", "create Express app", "unda programu ya Express", "Express ऐप बनाएं"));
    }
    if l.contains("console.log(") {
        return Some(localized_explanation("콘솔 출력", "print output", "chapisha matokeo", "आउटपुट प्रिंट"));
    }
    if l.contains("async function") {
        return Some(localized_explanation("비동기 함수 정의", "async operation", "operesheni ya async", "एसिंक ऑपरेशन"));
    }
    if l.starts_with("function ") {
        return Some(localized_explanation("함수 정의", "function definition", "ufafanuzi wa kazi", "फ़ंक्शन परिभाषा"));
    }
    if l.contains("const ") && l.contains(" = ") {
        return Some(localized_explanation("상수 선언", "variable declaration", "tamko la kigezo", "वेरिएबल घोषणा"));
    }
    if l.starts_with("let ") && l.contains(" = ") {
        return Some(localized_explanation("변수 선언", "variable declaration", "tamko la kigezo", "वेरिएबल घोषणा"));
    }
    if l.contains(".json(") {
        return Some(localized_explanation("JSON 응답", "JSON response", "jibu la JSON", "JSON रिस्पॉन्स"));
    }
    // Error handling patterns
    if l.contains("try:") || l.contains("try {") || l.contains("try!") {
        return Some(localized_explanation("에러 처리", "error handling", "kushughulikia makosa", "एरर हैंडलिंग"));
    }
    if l.contains("except ") || l.contains("catch ") || l.contains("Err(") {
        return Some(localized_explanation("에러 처리", "error handling", "kushughulikia makosa", "एरर हैंडलिंग"));
    }
    // if/else conditions
    if l.starts_with("if ") || l.starts_with("} else") || l.starts_with("elif ") {
        return Some(localized_explanation("조건문", "condition", "sharti", "शर्त"));
    }
    None
}

/// 파일 확장자로 언어 감지
fn detect_lang_from_ext(path: &str) -> &'static str {
    if path.ends_with(".py") { "python" }
    else if path.ends_with(".rs") { "rust" }
    else if path.ends_with(".js") || path.ends_with(".ts") { "javascript" }
    else if path.ends_with(".go") { "go" }
    else if path.ends_with(".java") { "java" }
    else if path.ends_with(".c") || path.ends_with(".h") { "c" }
    else if path.ends_with(".cpp") || path.ends_with(".hpp") { "cpp" }
    else { "unknown" }
}

/// 코드 파일 요약 분석
fn analyze_code(code: &str, lang: &str) -> Vec<String> {
    let mut summary = Vec::new();
    let lines = code.lines().count();
    summary.push(format!("{} 줄", lines));

    match lang {
        "python" => {
            let imports = code.lines().filter(|l| l.trim().starts_with("import ") || l.trim().starts_with("from ")).count();
            let functions = code.lines().filter(|l| l.trim().starts_with("def ") || l.trim().starts_with("async def ")).count();
            let classes = code.lines().filter(|l| l.trim().starts_with("class ")).count();
            if imports > 0 { summary.push(format!("import {}개", imports)); }
            if functions > 0 { summary.push(format!("함수 {}개", functions)); }
            if classes > 0 { summary.push(format!("클래스 {}개", classes)); }
        }
        "rust" => {
            let uses = code.lines().filter(|l| l.trim().starts_with("use ")).count();
            let fns = code.lines().filter(|l| l.contains("fn ") && !l.trim().starts_with("//")).count();
            let structs = code.lines().filter(|l| l.contains("struct ") && !l.trim().starts_with("//")).count();
            let impls = code.lines().filter(|l| l.trim().starts_with("impl ")).count();
            if uses > 0 { summary.push(format!("use {}개", uses)); }
            if fns > 0 { summary.push(format!("함수 {}개", fns)); }
            if structs > 0 { summary.push(format!("구조체 {}개", structs)); }
            if impls > 0 { summary.push(format!("impl {}개", impls)); }
        }
        "javascript" => {
            let imports = code.lines().filter(|l| l.trim().starts_with("import ") || l.contains("require(")).count();
            let fns = code.lines().filter(|l| l.contains("function ") || l.contains("=> {") || l.contains("=>")).count();
            let classes = code.lines().filter(|l| l.trim().starts_with("class ")).count();
            if imports > 0 { summary.push(format!("import {}개", imports)); }
            if fns > 0 { summary.push(format!("함수/화살표 {}개", fns)); }
            if classes > 0 { summary.push(format!("클래스 {}개", classes)); }
        }
        _ => {}
    }

    // Detect patterns
    if code.contains("async") { summary.push("비동기 코드".to_string()); }
    if code.contains("#[test]") || code.contains("def test_") || code.contains("describe(") { summary.push("테스트 포함".to_string()); }
    if code.contains("TODO") || code.contains("FIXME") { summary.push("TODO/FIXME 있음".to_string()); }

    summary
}

fn generate_python_requirements(intents: &[&str]) -> String {
    let mut deps = Vec::new();
    for intent in intents {
        match *intent {
            "rest_api" | "health_check" | "cors_middleware" | "pagination" | "api_versioning" => deps.push("fastapi>=0.100.0"),
            "http_server" | "static_file_server" => deps.push("uvicorn>=0.23.0"),
            "database_client" | "postgresql_client" => deps.push("asyncpg>=0.28.0"),
            "mongodb_client" => deps.push("pymongo>=4.5.0"),
            "redis_client" | "cache_client" => deps.push("redis>=5.0.0"),
            "jwt_handler" | "auth_handler" => deps.push("pyjwt>=2.8.0"),
            "password_hasher" => deps.push("bcrypt>=4.0.0"),
            "graphql_server" => deps.push("ariadne>=0.20.0"),
            "grpc_server" => deps.push("grpcio>=1.58.0"),
            "websocket_chat" | "websocket_server" => deps.push("websockets>=12.0"),
            "mqtt_client" => deps.push("paho-mqtt>=1.6.0"),
            "csv_parser" | "json_parser" | "yaml_parser" => {}
            "validator" => deps.push("pydantic>=2.4.0"),
            "etl_pipeline" | "data_processor" => deps.push("pandas>=2.1.0"),
            "logger" | "env_config" | "config_loader" => {}
            _ => {}
        }
    }
    deps.sort();
    deps.dedup();
    deps.join("\n") + "\n"
}

fn generate_cargo_toml(name: &str, intents: &[&str]) -> String {
    let mut deps = Vec::new();
    for intent in intents {
        match *intent {
            "rest_api" | "http_server" | "health_check" | "cors_middleware" | "static_file_server" =>
                { deps.push("axum = \"0.7\""); deps.push("tokio = { version = \"1\", features = [\"full\"] }"); }
            "database_client" | "postgresql_client" => deps.push("sqlx = { version = \"0.7\", features = [\"runtime-tokio\", \"postgres\"] }"),
            "mongodb_client" => deps.push("mongodb = \"2\""),
            "redis_client" | "cache_client" => deps.push("redis = \"0.23\""),
            "jwt_handler" => deps.push("jsonwebtoken = \"9\""),
            "password_hasher" => deps.push("bcrypt = \"0.15\""),
            "serializer" | "deserializer" | "json_parser" | "config_loader" =>
                { deps.push("serde = { version = \"1\", features = [\"derive\"] }"); deps.push("serde_json = \"1\""); }
            "logger" => deps.push("tracing = \"0.1\""),
            "env_config" => deps.push("dotenvy = \"0.15\""),
            "graphql_server" => deps.push("async-graphql = \"6\""),
            "grpc_server" => deps.push("tonic = \"0.10\""),
            "websocket_chat" | "websocket_server" => deps.push("tokio-tungstenite = \"0.20\""),
            _ => {}
        }
    }
    deps.sort();
    deps.dedup();

    format!("[package]\nname = \"{}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\n{}\n",
        name.replace('-', "_"), deps.join("\n"))
}

fn generate_package_json(name: &str, intents: &[&str]) -> String {
    let mut deps = Vec::new();
    for intent in intents {
        match *intent {
            "rest_api" | "http_server" | "health_check" | "static_file_server" => deps.push("\"express\": \"^4.18.0\""),
            "cors_middleware" => { deps.push("\"express\": \"^4.18.0\""); deps.push("\"cors\": \"^2.8.5\""); }
            "database_client" | "postgresql_client" => deps.push("\"pg\": \"^8.11.0\""),
            "mongodb_client" => deps.push("\"mongodb\": \"^6.1.0\""),
            "redis_client" | "cache_client" => deps.push("\"redis\": \"^4.6.0\""),
            "jwt_handler" | "auth_handler" => deps.push("\"jsonwebtoken\": \"^9.0.0\""),
            "password_hasher" => deps.push("\"bcrypt\": \"^5.1.0\""),
            "websocket_chat" | "websocket_server" => deps.push("\"ws\": \"^8.14.0\""),
            "env_config" => deps.push("\"dotenv\": \"^16.3.0\""),
            "logger" => deps.push("\"winston\": \"^3.11.0\""),
            _ => {}
        }
    }
    deps.sort();
    deps.dedup();

    format!("{{\n  \"name\": \"{}\",\n  \"version\": \"0.1.0\",\n  \"main\": \"main.js\",\n  \"dependencies\": {{\n    {}\n  }}\n}}\n",
        name, deps.join(",\n    "))
}
