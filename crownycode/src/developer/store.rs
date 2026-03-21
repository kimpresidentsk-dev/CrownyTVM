// crownycode/src/developer/store.rs
// 개발자 프로필 저장소 — 파일 기반 (rusqlite 제거)

use crate::error::Result;
use crate::time_util;
use super::profile::{DeveloperProfile, LearnedIntent};
use super::level::DevLevel;
use std::collections::HashMap;

pub struct DevStore {
    dir: String,
}

impl DevStore {
    pub fn new(db_path: &str) -> Self {
        // db_path에서 확장자를 제거하고 _devs/ 하위 디렉터리 사용
        let base = db_path.trim_end_matches(".db");
        let dir = format!("{}_devs", base);
        Self { dir }
    }

    /// 스키마 초기화 (디렉터리 생성)
    pub fn init_schema(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        Ok(())
    }

    // ── 개발자 CRUD ───────────────────────────────────────────

    pub fn upsert_developer(&self, profile: &DeveloperProfile) -> Result<()> {
        let path = self.profile_path(&profile.dev_id);
        let data = self.serialize_profile(profile);
        std::fs::write(&path, data)?;
        Ok(())
    }

    pub fn load_developer(&self, dev_id: &str) -> Result<Option<DeveloperProfile>> {
        let path = self.profile_path(dev_id);
        if !std::path::Path::new(&path).exists() {
            return Ok(None);
        }
        let data = std::fs::read_to_string(&path)?;
        Ok(Some(self.deserialize_profile(&data)?))
    }

    /// 현재 세션 기본 개발자 — 없으면 새로 생성
    pub fn get_or_create_default(&self) -> Result<DeveloperProfile> {
        let default_id = "default";
        if let Some(p) = self.load_developer(default_id)? {
            return Ok(p);
        }
        let profile = DeveloperProfile::new(default_id, "개발자");
        self.upsert_developer(&profile)?;
        Ok(profile)
    }

    /// 요청 완료 기록
    pub fn record_request(&self, dev_id: &str, success: bool) -> Result<()> {
        if let Some(mut p) = self.load_developer(dev_id)? {
            p.total_requests += 1;
            if success {
                p.successful_generations += 1;
            }
            p.last_active = time_util::now_rfc3339();
            self.upsert_developer(&p)?;
        }
        Ok(())
    }

    /// 전체 개발자 수
    pub fn developer_count(&self) -> Result<i64> {
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(0); }
        let count = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "dev").unwrap_or(false))
            .count();
        Ok(count as i64)
    }

    /// 전체 학습 인텐트 수 (모든 개발자 합산)
    pub fn total_learned_intents(&self) -> Result<i64> {
        let dir = std::path::Path::new(&self.dir);
        if !dir.exists() { return Ok(0); }
        let mut total = 0i64;
        for entry in std::fs::read_dir(dir)?.filter_map(|e| e.ok()) {
            if entry.path().extension().map(|x| x == "dev").unwrap_or(false) {
                let data = std::fs::read_to_string(entry.path())?;
                if let Ok(p) = self.deserialize_profile(&data) {
                    total += p.known_intents.len() as i64;
                }
            }
        }
        Ok(total)
    }

    // ── 내부 직렬화 (key=value 텍스트 형식) ──────────────────────

    fn profile_path(&self, dev_id: &str) -> String {
        format!("{}/{}.dev", self.dir, dev_id)
    }

    fn serialize_profile(&self, p: &DeveloperProfile) -> String {
        let mut lines = Vec::new();
        lines.push(format!("dev_id={}", p.dev_id));
        lines.push(format!("name={}", p.name));
        lines.push(format!("level={:?}", p.level));
        lines.push(format!("total_requests={}", p.total_requests));
        lines.push(format!("successful_generations={}", p.successful_generations));
        lines.push(format!("contributions={}", p.contributions));
        lines.push(format!("preferred_lang={}", p.preferred_lang.as_deref().unwrap_or("")));
        lines.push(format!("country_code={}", p.country_code.as_deref().unwrap_or("")));
        lines.push(format!("first_seen={}", p.first_seen));
        lines.push(format!("last_active={}", p.last_active));

        // Known intents
        for ki in &p.known_intents {
            lines.push(format!("known_intent={}|{}|{}|{}",
                ki.intent, ki.confidence, ki.use_count, ki.learned_at));
        }
        // Uncertain intents
        for ui in &p.uncertain_intents {
            lines.push(format!("uncertain_intent={}", ui));
        }
        // Misunderstood intents
        for mi in &p.misunderstood_intents {
            lines.push(format!("misunderstood_intent={}", mi));
        }

        lines.join("\n")
    }

    fn deserialize_profile(&self, data: &str) -> Result<DeveloperProfile> {
        let mut vals: HashMap<String, String> = HashMap::new();
        let mut known = Vec::new();
        let mut uncertain = Vec::new();
        let mut misunderstood = Vec::new();

        for line in data.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            if let Some((key, val)) = line.split_once('=') {
                match key {
                    "known_intent" => {
                        let parts: Vec<&str> = val.splitn(4, '|').collect();
                        if parts.len() >= 4 {
                            known.push(LearnedIntent {
                                intent: parts[0].to_string(),
                                confidence: parts[1].parse().unwrap_or(0.5),
                                use_count: parts[2].parse().unwrap_or(1),
                                learned_at: parts[3].to_string(),
                            });
                        }
                    }
                    "uncertain_intent" => uncertain.push(val.to_string()),
                    "misunderstood_intent" => misunderstood.push(val.to_string()),
                    _ => { vals.insert(key.to_string(), val.to_string()); }
                }
            }
        }

        let dev_id = vals.get("dev_id").cloned().unwrap_or_else(|| "unknown".to_string());
        let name = vals.get("name").cloned().unwrap_or_else(|| "unknown".to_string());
        let level = parse_level(vals.get("level").map(|s| s.as_str()).unwrap_or("Seed"));
        let total_requests = vals.get("total_requests").and_then(|v| v.parse().ok()).unwrap_or(0);
        let successful_generations = vals.get("successful_generations").and_then(|v| v.parse().ok()).unwrap_or(0);
        let contributions = vals.get("contributions").and_then(|v| v.parse().ok()).unwrap_or(0);
        let preferred_lang = vals.get("preferred_lang").filter(|v| !v.is_empty()).cloned();
        let country_code = vals.get("country_code").filter(|v| !v.is_empty()).cloned();
        let first_seen = vals.get("first_seen").cloned().unwrap_or_else(time_util::now_rfc3339);
        let last_active = vals.get("last_active").cloned().unwrap_or_else(time_util::now_rfc3339);

        Ok(DeveloperProfile {
            dev_id,
            name,
            level,
            known_intents: known,
            uncertain_intents: uncertain,
            misunderstood_intents: misunderstood,
            total_requests,
            successful_generations,
            contributions,
            first_seen,
            last_active,
            preferred_lang,
            country_code,
        })
    }
}

fn parse_level(s: &str) -> DevLevel {
    match s {
        "Sprout"    => DevLevel::Sprout,
        "Explorer"  => DevLevel::Explorer,
        "Craftsman" => DevLevel::Craftsman,
        "Architect" => DevLevel::Architect,
        "Creator"   => DevLevel::Creator,
        _           => DevLevel::Seed,
    }
}
