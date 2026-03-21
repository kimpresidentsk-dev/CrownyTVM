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

        println!("{}", "지원 언어:".bold());
        println!("  출력: Python, Rust, JavaScript/TypeScript");
        println!("  입력: 한국어, English, Kiswahili, हिंदी, Português-BR");
        println!();

        let cell_count = self.db.cell_net().len();
        println!("{} 현재 {}개 의도 패턴이 설치되어 있습니다.", "상태:".bright_cyan(), cell_count);
        if cell_count == 0 {
            println!("  {} crownycode seed --count 51", "시드 설치:".yellow());
        }

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
fn add_explanations(code: &str, _lang: &str) -> String {
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

/// 코드 줄 패턴별 설명 생성
fn explain_line(line: &str) -> Option<&'static str> {
    let l = line.to_lowercase();
    // Python
    if l.contains("import ") || (l.contains("from ") && l.contains("import")) { return Some("라이브러리 가져오기"); }
    if l.contains("def ") { return Some("함수 정의"); }
    if l.contains("class ") && !l.contains("// class") { return Some("클래스 정의"); }
    if l.starts_with("return ") || l.starts_with("    return") { return Some("결과 반환"); }
    if l.contains("if __name__") { return Some("직접 실행 시에만 동작"); }
    if l.contains("for ") && l.contains(" in ") { return Some("반복문"); }
    if l.contains("while ") && !l.contains("//") { return Some("조건 반복"); }
    if l.contains(".append(") { return Some("목록에 추가"); }
    if l.contains("print(") || l.contains("println!") { return Some("화면 출력"); }
    // Rust
    if l.starts_with("use ") { return Some("라이브러리 가져오기"); }
    if l.starts_with("fn ") || l.contains("pub fn ") || l.contains("async fn ") { return Some("함수 정의"); }
    if l.starts_with("struct ") || l.contains("pub struct ") { return Some("구조체 정의"); }
    if l.contains("impl ") { return Some("구현 블록"); }
    if l.contains("let ") && l.contains("= ") { return Some("변수 선언"); }
    if l.contains(".unwrap()") { return Some("값 추출 (실패 시 중단)"); }
    if l.contains(".await") { return Some("비동기 대기"); }
    if l.contains("match ") { return Some("패턴 매칭"); }
    if l.contains("Vec<") { return Some("동적 배열"); }
    if l.contains("HashMap") { return Some("키-값 맵"); }
    if l.contains("Option<") { return Some("있을 수도 없을 수도 있는 값"); }
    if l.contains("Result<") { return Some("성공 또는 실패"); }
    if l.contains("#[tokio::main]") { return Some("비동기 메인 함수"); }
    if l.contains("#[test]") { return Some("테스트 함수"); }
    if l.contains("#[derive(") { return Some("자동 구현 매크로"); }
    if l.contains("TcpListener") || l.contains("bind(") { return Some("서버 포트 열기"); }
    if l.contains(".listen(") || l.contains(".incoming()") { return Some("연결 대기"); }
    if l.contains(".write_all(") || l.contains(".send(") { return Some("데이터 전송"); }
    if l.contains(".read(") { return Some("데이터 읽기"); }
    if l.contains("Router::new()") { return Some("URL 라우터 생성"); }
    if l.contains(".route(") { return Some("경로 등록"); }
    // JavaScript
    if l.contains("require(") { return Some("모듈 가져오기"); }
    if l.contains("module.exports") { return Some("모듈 내보내기"); }
    if l.contains("express()") { return Some("Express 앱 생성"); }
    if l.contains(".listen(") { return Some("서버 시작"); }
    if l.contains("console.log(") { return Some("콘솔 출력"); }
    if l.contains("async function") { return Some("비동기 함수 정의"); }
    if l.starts_with("function ") { return Some("함수 정의"); }
    if l.contains("const ") && l.contains(" = ") { return Some("상수 선언"); }
    if l.starts_with("let ") && l.contains(" = ") { return Some("변수 선언"); }
    if l.contains(".json(") { return Some("JSON 응답"); }
    None
}
