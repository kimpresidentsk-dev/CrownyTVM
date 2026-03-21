// src/config_parser.rs
// 자체 TOML 파서 (toml crate 대체)
// crownycode.toml 전용 — flat key=value 테이블 + string 배열만 지원

use crate::error::{Result, bail};
use crate::cli::{Config, EngineConfig, ClaudeConfig, CodegenConfig, GatewayConfig, RuntimeConfig, SnapshotConfig};

pub fn parse_config(content: &str) -> Result<Config> {
    let mut current_table = String::new();
    let mut values: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        // Skip comments and empty lines
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // Table header
        if line.starts_with('[') && line.ends_with(']') {
            current_table = line[1..line.len() - 1].to_string();
            continue;
        }
        // Key = value
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim();
            let val = line[eq_pos + 1..].trim();
            // Strip inline comments (but not inside strings)
            let val = strip_inline_comment(val);
            let full_key = if current_table.is_empty() {
                key.to_string()
            } else {
                format!("{}.{}", current_table, key)
            };
            values.insert(full_key, val.to_string());
        }
    }

    Ok(Config {
        engine: EngineConfig {
            version: get_string(&values, "engine.version")?,
            default_target: get_string(&values, "engine.default_target")?,
            auto_learn: get_bool(&values, "engine.auto_learn")?,
            cell_db_path: get_string(&values, "engine.cell_db_path")?,
        },
        claude: ClaudeConfig {
            model: get_string(&values, "claude.model")?,
            max_tokens: get_u32(&values, "claude.max_tokens")?,
            free_quota: get_u32(&values, "claude.free_quota")?,
        },
        codegen: CodegenConfig {
            verbose_comments: get_bool(&values, "codegen.verbose_comments")?,
            auto_test: get_bool(&values, "codegen.auto_test")?,
        },
        gateway: GatewayConfig {
            enabled: get_bool(&values, "gateway.enabled")?,
            free_country_codes: get_string_array(&values, "gateway.free_country_codes")?,
        },
        runtime: values.get("runtime.low_power").map(|_| RuntimeConfig {
            low_power: get_bool(&values, "runtime.low_power").unwrap_or(false),
            max_parallel_cells: get_u32(&values, "runtime.max_parallel_cells").unwrap_or(4),
        }).unwrap_or_default(),
        snapshot: values.get("snapshot.auto_every").map(|_| SnapshotConfig {
            auto_every: get_u32(&values, "snapshot.auto_every").unwrap_or(50),
            path: get_string(&values, "snapshot.path").unwrap_or_else(|_| "data/snapshots".to_string()),
        }).unwrap_or_default(),
    })
}

fn strip_inline_comment(val: &str) -> &str {
    // If value starts with a quote, find the closing quote first
    if let Some(stripped) = val.strip_prefix('"') {
        if let Some(end) = stripped.find('"') {
            return &val[..end + 2];
        }
    }
    // If value starts with '[', find the closing ']'
    if val.starts_with('[') {
        if let Some(end) = val.find(']') {
            return &val[..end + 1];
        }
    }
    // Otherwise strip from '#'
    if let Some(pos) = val.find('#') {
        val[..pos].trim()
    } else {
        val
    }
}

fn get_string(values: &std::collections::HashMap<String, String>, key: &str) -> Result<String> {
    let val = values.get(key)
        .ok_or_else(|| crate::error::err!("설정 키 없음: {key}"))?;
    // Strip quotes
    let val = val.trim();
    if val.starts_with('"') && val.ends_with('"') {
        Ok(val[1..val.len() - 1].to_string())
    } else {
        Ok(val.to_string())
    }
}

fn get_bool(values: &std::collections::HashMap<String, String>, key: &str) -> Result<bool> {
    let val = values.get(key)
        .ok_or_else(|| crate::error::err!("설정 키 없음: {key}"))?;
    match val.trim() {
        "true" => Ok(true),
        "false" => Ok(false),
        other => bail!("bool 파싱 실패: {key} = {other}"),
    }
}

fn get_u32(values: &std::collections::HashMap<String, String>, key: &str) -> Result<u32> {
    let val = values.get(key)
        .ok_or_else(|| crate::error::err!("설정 키 없음: {key}"))?;
    val.trim().parse::<u32>()
        .map_err(|e| crate::error::err!("u32 파싱 실패: {key} = {val}: {e}"))
}

fn get_string_array(values: &std::collections::HashMap<String, String>, key: &str) -> Result<Vec<String>> {
    let val = values.get(key)
        .ok_or_else(|| crate::error::err!("설정 키 없음: {key}"))?;
    let val = val.trim();
    if !val.starts_with('[') || !val.ends_with(']') {
        bail!("배열 파싱 실패: {key} = {val}");
    }
    let inner = &val[1..val.len() - 1];
    let items: Vec<String> = inner.split(',')
        .map(|s| {
            let s = s.trim();
            if s.starts_with('"') && s.ends_with('"') {
                s[1..s.len() - 1].to_string()
            } else {
                s.to_string()
            }
        })
        .filter(|s| !s.is_empty())
        .collect();
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_crownycode_toml() {
        let content = include_str!("../crownycode.toml");
        let config = parse_config(content).unwrap();
        assert_eq!(config.engine.version, "0.1.0");
        assert_eq!(config.engine.default_target, "python");
        assert!(config.engine.auto_learn);
        assert_eq!(config.engine.cell_db_path, "data/cells.db");
        assert_eq!(config.claude.max_tokens, 2048);
        assert_eq!(config.claude.free_quota, 100);
        assert!(config.codegen.verbose_comments);
        assert!(config.codegen.auto_test);
        assert!(!config.gateway.enabled);
        assert!(config.gateway.free_country_codes.contains(&"KE".to_string()));
        assert!(!config.runtime.low_power);
        assert_eq!(config.runtime.max_parallel_cells, 4);
        assert_eq!(config.snapshot.auto_every, 50);
    }
}
