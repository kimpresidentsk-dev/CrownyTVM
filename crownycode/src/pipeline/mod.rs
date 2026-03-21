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

use anyhow::Result;
use colored::*;

use crate::cli::Config;
use crate::cell::store::CrownyDb;
use crate::developer::store::DevStore;
use crate::developer::profile::{DeveloperProfile, StepPriority};
use crate::phase::judge::Phase;
use crate::learn::claude::ClaudeLearner;
use crate::crownycore::{CrownyCore, CelAction};

pub struct Engine {
    config: Config,
    db: CrownyDb,
}

impl Engine {
    pub fn new(config: Config, db: CrownyDb) -> Self {
        let dev_store = DevStore::new(db.connection());
        let _ = dev_store.init_schema();
        Self { config, db }
    }

    /// 코드 생성 — CrownyCore::think() 기반
    ///
    /// 이전 선형 파이프라인:
    ///   KPS → IR → PhaseJudge → codegen
    ///
    /// 새 파이프라인:
    ///   KPS → IR → CrownyCore::think() → codegen
    ///   (think 내부에서 분할→추론→병합이 일어남)
    pub async fn generate(&self, input: &str, target: Option<&str>, verbose: bool) -> Result<()> {
        let target = target.unwrap_or(&self.config.engine.default_target).to_string();

        let dev_store = DevStore::new(self.db.connection());
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
        let ir_tree = ir::build(&kps_nodes)?;
        println!(" {}", "완료".green());

        // ── 2b. 확정 패턴 직접 인출 (O(1) 최적경로) ──
        // 복합 의도: sub_intents가 여러 개이면 각각 CellNet에서 인출
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
            // 모든 의도가 확정 — 즉시 출력
            let is_compound = direct_hits.len() > 1;
            let _avg_energy = direct_hits.iter().map(|(_, _, e)| e).sum::<f32>()
                / direct_hits.len() as f32;

            for (intent, _, energy) in &direct_hits {
                println!("  {}  {} [확정 +2] energy:{:.2}",
                    "즉시인출:".green().bold(), intent.bold(), energy);
            }
            println!("  {}  셀:{} 즉시통과:{} 추가연산:0 절약률:100%",
                "통계:".dimmed(),
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

            println!("\n{}\n{}\n{}",
                "─".repeat(60).dimmed(), &combined_code, "─".repeat(60).dimmed());

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
            "통계:".dimmed(),
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

            // 오해만 있으면 여기서 중단
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
        println!("\n{}\n{}\n{}", "─".repeat(60).dimmed(), code, "─".repeat(60).dimmed());

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

    // ── 나머지 메서드: 기존과 동일 ──────────────────────────

    pub async fn learn(&self, topic: &str) -> Result<()> {
        if self.config.runtime.low_power {
            println!("{}", "low_power 모드에서는 learn을 사용할 수 없습니다.".yellow());
            return Ok(());
        }
        println!("{} {}", "학습:".dimmed(), topic.bold());
        let learner = ClaudeLearner::new(self.config.claude.clone());
        let id = learner.learn_topic(topic, &self.db).await?;
        println!("{} {}", "저장:".green(), id.dimmed());
        Ok(())
    }

    pub fn search_cells(&self, query: Option<&str>) -> Result<()> {
        let net = self.db.cell_net();
        let cells = net.search(query.unwrap_or(""));
        if cells.is_empty() { println!("{}", "저장된 셀 없음".dimmed()); return Ok(()); }
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
        let dev_store = DevStore::new(self.db.connection());
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
        let ds = DevStore::new(self.db.connection());
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

/// confidence → Phase 변환 (codegen 호환)
fn confidence_to_phase(confidence: f32) -> Phase {
    match confidence {
        c if c >= 0.75 => Phase::Confirmed,
        c if c >= 0.40 => Phase::Uncertain,
        c if c >= 0.15 => Phase::Misunderstood,
        _              => Phase::Unknown,
    }
}

// ── 사용법 변경 없음 확인 ──
// 기존: engine.generate("HTTP 서버 만들어줘", Some("rust"), false).await
// 신규: engine.generate("HTTP 서버 만들어줘", Some("rust"), false).await
// → 동일 인터페이스, 내부만 CrownyCore로 교체됨
