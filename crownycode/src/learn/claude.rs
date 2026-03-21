// crownycode/src/learn/claude.rs
// Claude 학습채널 — 미인지(-2) 패턴 발생 시 Claude API 호출
// 응답을 한선씨IR로 분해 후 셀로직DB에 저장

use crate::error::Result;
use reqwest::Client;
use serde_json::{json, Value};

use crate::cli::ClaudeConfig;
use crate::cell::store::CrownyDb;
use crate::pipeline::ir::{IrTree, IrNode};

pub struct ClaudeLearner {
    config: ClaudeConfig,
    client: Client,
}

impl ClaudeLearner {
    pub fn new(config: ClaudeConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    /// 미인지 입력을 Claude에 보내고, 응답을 IR + 셀DB에 저장
    pub async fn learn_and_ingest(
        &self,
        input: &str,
        db: &CrownyDb,
    ) -> Result<IrTree> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| crate::error::err!("ANTHROPIC_API_KEY 환경변수가 없습니다"))?;

        let system = r#"
당신은 크라우니코드의 학습 채널입니다.
사용자의 자연어 요청을 받아 다음 JSON 형식으로만 응답하세요:
{
  "intent": "snake_case_intent",
  "python_code": "...",
  "rust_code": "...",
  "confidence": 0.0~1.0,
  "description": "한 문장 설명"
}
코드는 실제로 동작하는 완전한 코드여야 합니다.
JSON 외에 어떤 텍스트도 출력하지 마세요.
"#;

        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": self.config.model,
                "max_tokens": self.config.max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": input}]
            }))
            .send()
            .await?;

        let body: Value = response.json().await?;
        let text = body["content"][0]["text"].as_str()
            .ok_or_else(|| crate::error::err!("Claude 응답 파싱 실패"))?;

        let clean = text.trim().trim_start_matches("```json")
            .trim_end_matches("```").trim();
        let parsed: Value = serde_json::from_str(clean)?;

        let intent = parsed["intent"].as_str().unwrap_or("unknown").to_string();
        let python_code = parsed["python_code"].as_str().unwrap_or("").to_string();
        let rust_code = parsed["rust_code"].as_str().unwrap_or("").to_string();
        let confidence = parsed["confidence"].as_f64().unwrap_or(0.7) as f32;

        if !python_code.is_empty() {
            let mut net = db.cell_net_mut();
            net.upsert_pattern(&intent, "python", &python_code, confidence);
            drop(net);
            db.save_net()?;
            println!("  셀 저장: {} [python] 신뢰도 {:.0}%", intent, confidence * 100.0);
        }
        if !rust_code.is_empty() {
            let mut net = db.cell_net_mut();
            net.upsert_pattern(&intent, "rust", &rust_code, confidence);
            drop(net);
            db.save_net()?;
            println!("  셀 저장: {} [rust] 신뢰도 {:.0}%", intent, confidence * 100.0);
        }

        let ir = IrTree {
            intent: intent.clone(),
            sub_intents: vec![],
            nodes: vec![IrNode::RawLogic(python_code.clone())],
            constraints: vec![],
            lang_hint: Some("python".to_string()),
        };

        Ok(ir)
    }

    /// 주제를 직접 학습 (crownycode learn "..." 커맨드)
    pub async fn learn_topic(&self, topic: &str, db: &CrownyDb) -> Result<String> {
        let ir = self.learn_and_ingest(topic, db).await?;
        Ok(ir.intent)
    }
}
