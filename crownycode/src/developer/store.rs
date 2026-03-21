// crownycode/src/developer/store.rs
// 개발자 프로필 저장소 — CellStore와 같은 DB 파일 공유

use anyhow::Result;
use rusqlite::{Connection, params};
use chrono::Utc;
use super::profile::{DeveloperProfile, LearnedIntent};
use super::level::DevLevel;

pub struct DevStore<'a> {
    conn: &'a Connection,
}

impl<'a> DevStore<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// 스키마 초기화 (CellStore::init_schema 이후 호출)
    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS developers (
                dev_id                  TEXT PRIMARY KEY,
                name                    TEXT NOT NULL,
                level                   TEXT NOT NULL DEFAULT 'Seed',
                total_requests          INTEGER NOT NULL DEFAULT 0,
                successful_generations  INTEGER NOT NULL DEFAULT 0,
                contributions           INTEGER NOT NULL DEFAULT 0,
                preferred_lang          TEXT,
                country_code            TEXT,
                first_seen              TEXT NOT NULL,
                last_active             TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS developer_intents (
                dev_id      TEXT NOT NULL,
                intent      TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'known',
                confidence  REAL NOT NULL DEFAULT 0.5,
                use_count   INTEGER NOT NULL DEFAULT 1,
                learned_at  TEXT NOT NULL,
                PRIMARY KEY (dev_id, intent),
                FOREIGN KEY (dev_id) REFERENCES developers(dev_id)
            );

            CREATE INDEX IF NOT EXISTS idx_dev_intents_dev ON developer_intents(dev_id);
            CREATE INDEX IF NOT EXISTS idx_dev_intents_status ON developer_intents(status);
        ")?;
        Ok(())
    }

    // ── 개발자 CRUD ───────────────────────────────────────────

    pub fn upsert_developer(&self, profile: &DeveloperProfile) -> Result<()> {
        self.conn.execute(
            "INSERT INTO developers
               (dev_id, name, level, total_requests, successful_generations,
                contributions, preferred_lang, country_code, first_seen, last_active)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
             ON CONFLICT(dev_id) DO UPDATE SET
               name=excluded.name, level=excluded.level,
               total_requests=excluded.total_requests,
               successful_generations=excluded.successful_generations,
               contributions=excluded.contributions,
               preferred_lang=excluded.preferred_lang,
               country_code=excluded.country_code,
               last_active=excluded.last_active",
            params![
                profile.dev_id, profile.name,
                format!("{:?}", profile.level),
                profile.total_requests, profile.successful_generations,
                profile.contributions,
                profile.preferred_lang, profile.country_code,
                profile.first_seen.to_rfc3339(),
                profile.last_active.to_rfc3339(),
            ],
        )?;

        // 인텐트 동기화
        for intent in &profile.known_intents {
            self.upsert_intent(&profile.dev_id, &intent.intent, "known",
                intent.confidence, intent.use_count)?;
        }
        for intent in &profile.uncertain_intents {
            self.upsert_intent(&profile.dev_id, intent, "uncertain", 0.4, 0)?;
        }
        for intent in &profile.misunderstood_intents {
            self.upsert_intent(&profile.dev_id, intent, "misunderstood", 0.0, 0)?;
        }
        Ok(())
    }

    fn upsert_intent(&self, dev_id: &str, intent: &str,
        status: &str, confidence: f32, use_count: u32) -> Result<()>
    {
        self.conn.execute(
            "INSERT INTO developer_intents (dev_id, intent, status, confidence, use_count, learned_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(dev_id, intent) DO UPDATE SET
               status=excluded.status, confidence=excluded.confidence,
               use_count=developer_intents.use_count + excluded.use_count",
            params![dev_id, intent, status, confidence, use_count, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn load_developer(&self, dev_id: &str) -> Result<Option<DeveloperProfile>> {
        let row = self.conn.query_row(
            "SELECT dev_id, name, level, total_requests, successful_generations,
                    contributions, preferred_lang, country_code, first_seen, last_active
             FROM developers WHERE dev_id = ?1",
            params![dev_id],
            |r| Ok((
                r.get::<_,String>(0)?, r.get::<_,String>(1)?,
                r.get::<_,String>(2)?, r.get::<_,u32>(3)?,
                r.get::<_,u32>(4)?, r.get::<_,u32>(5)?,
                r.get::<_,Option<String>>(6)?, r.get::<_,Option<String>>(7)?,
                r.get::<_,String>(8)?, r.get::<_,String>(9)?,
            )),
        );

        let Ok((dev_id, name, level_str, total_req, succ_gen,
                contribs, pref_lang, country, first_seen, last_active)) = row
        else { return Ok(None); };

        // 인텐트 로드
        let mut stmt = self.conn.prepare(
            "SELECT intent, status, confidence, use_count, learned_at
             FROM developer_intents WHERE dev_id = ?1"
        )?;
        let intents: Vec<(String,String,f32,u32,String)> = stmt.query_map(
            params![dev_id],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))
        )?.filter_map(|r| r.ok()).collect();

        let mut known = vec![];
        let mut uncertain = vec![];
        let mut misunderstood = vec![];

        for (intent, status, confidence, use_count, learned_at) in intents {
            match status.as_str() {
                "known" => known.push(LearnedIntent {
                    intent,
                    confidence,
                    use_count,
                    learned_at: learned_at.parse().unwrap_or_else(|_| Utc::now()),
                }),
                "uncertain"     => uncertain.push(intent),
                "misunderstood" => misunderstood.push(intent),
                _ => {}
            }
        }

        let level = parse_level(&level_str);

        Ok(Some(DeveloperProfile {
            dev_id,
            name,
            level,
            known_intents: known,
            uncertain_intents: uncertain,
            misunderstood_intents: misunderstood,
            total_requests: total_req,
            successful_generations: succ_gen,
            contributions: contribs,
            first_seen: first_seen.parse().unwrap_or_else(|_| Utc::now()),
            last_active: last_active.parse().unwrap_or_else(|_| Utc::now()),
            preferred_lang: pref_lang,
            country_code: country,
        }))
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

    /// 요청 완료 기록 — total_requests++, 성공 시 successful_generations++
    pub fn record_request(&self, dev_id: &str, success: bool) -> Result<()> {
        if success {
            self.conn.execute(
                "UPDATE developers SET total_requests=total_requests+1,
                 successful_generations=successful_generations+1,
                 last_active=?1 WHERE dev_id=?2",
                params![Utc::now().to_rfc3339(), dev_id],
            )?;
        } else {
            self.conn.execute(
                "UPDATE developers SET total_requests=total_requests+1,
                 last_active=?1 WHERE dev_id=?2",
                params![Utc::now().to_rfc3339(), dev_id],
            )?;
        }
        Ok(())
    }

    /// 전체 개발자 수
    pub fn developer_count(&self) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM developers", [], |r| r.get(0)
        )?)
    }

    /// 전체 학습 인텐트 수 (모든 개발자 합산)
    pub fn total_learned_intents(&self) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM developer_intents WHERE status='known'",
            [], |r| r.get(0)
        )?)
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
