// crownycode/src/seed.rs
// ═══════════════════════════════════════════════════════════════
// 셀DB 시드 — 50개 기본 의도 패턴 (Python + Rust)
// ═══════════════════════════════════════════════════════════════
//
// 모든 요청이 미인지(-2)로 빠지는 것을 방지하기 위해
// CellNet에 확정(+2) 상태의 기본 패턴을 채운다.
//
// 사용법: crownycode seed --count 50

use colored::*;

use crate::cell::net::CellNet;
use crate::cell::{CrownyCell, Pattern, PatternSource, Relation};

/// 시드 의도 정의
struct SeedIntent {
    name: &'static str,
    python: &'static str,
    rust: &'static str,
    confidence: f32,
    /// 관련 의도 이름 목록
    related: &'static [&'static str],
}

/// CellNet에 시드 데이터를 채운다
///
/// count: 채울 의도 수 (최대 50)
/// 반환: (채운 셀 수, 확정 상태 셀 수)
pub fn seed(net: &mut CellNet, count: usize) -> (usize, usize) {
    let intents = all_intents();
    let limit = count.min(intents.len());
    let mut seeded = 0usize;
    let mut confirmed = 0usize;

    // 1단계: 셀 + 패턴 삽입
    for si in intents.iter().take(limit) {
        // 이미 존재하면 건너뜀
        if net.find_by_intent(si.name).is_some() {
            continue;
        }

        let mut cell = CrownyCell::new(si.name);
        cell.add_pattern(Pattern::new(
            "python",
            si.python,
            si.confidence,
            PatternSource::Generated,
        ));
        cell.add_pattern(Pattern::new(
            "rust",
            si.rust,
            si.confidence,
            PatternSource::Generated,
        ));
        // activate로 usage_bonus 부여 → 에너지 상승
        cell.activate();
        net.insert(cell);
        seeded += 1;
    }

    // 2단계: 관계 엣지 추가
    for si in intents.iter().take(limit) {
        for related in si.related {
            let _ = net.add_edge_by_intent(si.name, related, Relation::Related, 1);
        }
    }

    // 확정 상태 수 카운트
    for si in intents.iter().take(limit) {
        if let Some(cell) = net.find_by_intent(si.name) {
            if cell.trit_state == crate::cell::TritState::Confirmed {
                confirmed += 1;
            }
        }
    }

    (seeded, confirmed)
}

/// 시드 실행 + 결과 출력
pub fn run_seed(net: &mut CellNet, count: usize) {
    let before = net.len();
    println!(
        "{} CellNet 시드 시작 (기존 {}셀, 목표 {}개 의도)",
        "시드:".bold().bright_cyan(),
        before,
        count
    );

    let (seeded, confirmed) = seed(net, count);
    let after = net.len();

    println!(
        "  {} {}개 새 셀 추가 (총 {}셀)",
        "완료:".green(),
        seeded,
        after
    );
    println!(
        "  {} 확정(+2): {}/{}  ({:.0}%)",
        "상태:".dimmed(),
        confirmed.to_string().green(),
        count.min(50),
        if count > 0 {
            confirmed as f64 / count.min(50) as f64 * 100.0
        } else {
            0.0
        }
    );

    // 상태별 분포 출력
    let mut state_counts = [0u32; 4]; // Confirmed, Uncertain, Refuted, Unknown
    for (_, cell) in net.iter() {
        match cell.trit_state {
            crate::cell::TritState::Confirmed => state_counts[0] += 1,
            crate::cell::TritState::Uncertain => state_counts[1] += 1,
            crate::cell::TritState::Refuted => state_counts[2] += 1,
            crate::cell::TritState::Unknown => state_counts[3] += 1,
        }
    }
    println!(
        "  {} 확정:{} 미확인:{} 오해:{} 미인지:{}",
        "분포:".dimmed(),
        state_counts[0].to_string().green(),
        state_counts[1].to_string().yellow(),
        state_counts[2].to_string().red(),
        state_counts[3].to_string().dimmed(),
    );
}

/// 50개 기본 의도 — 실제 동작하는 최소 스니펫 (import/use 포함)
fn all_intents() -> Vec<SeedIntent> {
    vec![
        // ── 웹/네트워크 ────────────────────────────────────────
        SeedIntent {
            name: "http_server",
            python: r##"from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Hello, World!")

server = HTTPServer(("0.0.0.0", 8080), Handler)
server.serve_forever()"##,
            rust: r##"use std::io::prelude::*;
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("0.0.0.0:8080").unwrap();
    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nHello, World!";
        stream.write_all(response.as_bytes()).unwrap();
    }
}"##,
            confidence: 0.92,
            related: &["rest_api", "tcp_server", "websocket_server"],
        },
        SeedIntent {
            name: "rest_api",
            python: r##"from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

items: list[Item] = []

@app.get("/items")
def list_items():
    return items

@app.post("/items")
def create_item(item: Item):
    items.append(item)
    return item"##,
            rust: r##"use axum::{routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
struct Item { name: String, price: f64 }

async fn list_items() -> Json<Vec<Item>> {
    Json(vec![])
}

async fn create_item(Json(item): Json<Item>) -> Json<Item> {
    Json(item)
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/items", get(list_items).post(create_item));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}"##,
            confidence: 0.93,
            related: &["http_server", "json_parser", "url_router"],
        },
        SeedIntent {
            name: "websocket_server",
            python: r##"import asyncio
import websockets

async def handler(websocket):
    async for message in websocket:
        await websocket.send(f"echo: {message}")

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()

asyncio.run(main())"##,
            rust: r##"use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("0.0.0.0:8765").await.unwrap();
    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(async move {
            let mut ws = accept_async(stream).await.unwrap();
            while let Some(Ok(msg)) = ws.next().await {
                if msg.is_text() {
                    let reply = format!("echo: {}", msg.to_text().unwrap());
                    ws.send(reply.into()).await.unwrap();
                }
            }
        });
    }
}"##,
            confidence: 0.88,
            related: &["http_server", "tcp_server", "event_emitter"],
        },
        SeedIntent {
            name: "tcp_server",
            python: r##"import socket

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(("0.0.0.0", 9000))
    server.listen(5)
    while True:
        conn, addr = server.accept()
        data = conn.recv(1024)
        conn.sendall(data)
        conn.close()

main()"##,
            rust: r##"use std::io::prelude::*;
use std::net::TcpListener;

fn main() {
    let listener = TcpListener::bind("0.0.0.0:9000").unwrap();
    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        let mut buf = [0u8; 1024];
        let n = stream.read(&mut buf).unwrap();
        stream.write_all(&buf[..n]).unwrap();
    }
}"##,
            confidence: 0.90,
            related: &["http_server", "websocket_server"],
        },
        SeedIntent {
            name: "web_scraper",
            python: r##"import requests
from bs4 import BeautifulSoup

def scrape(url: str) -> list[str]:
    resp = requests.get(url)
    soup = BeautifulSoup(resp.text, "html.parser")
    return [a.get("href", "") for a in soup.find_all("a")]"##,
            rust: r##"use reqwest::blocking::get;
use scraper::{Html, Selector};

fn scrape(url: &str) -> Vec<String> {
    let body = get(url).unwrap().text().unwrap();
    let doc = Html::parse_document(&body);
    let sel = Selector::parse("a").unwrap();
    doc.select(&sel)
        .filter_map(|el| el.value().attr("href").map(String::from))
        .collect()
}"##,
            confidence: 0.87,
            related: &["html_parser", "url_router"],
        },
        SeedIntent {
            name: "url_router",
            python: r##"from typing import Callable

class Router:
    def __init__(self):
        self.routes: dict[str, Callable] = {}

    def route(self, path: str):
        def decorator(fn: Callable):
            self.routes[path] = fn
            return fn
        return decorator

    def dispatch(self, path: str):
        handler = self.routes.get(path)
        if handler:
            return handler()
        return "404 Not Found""##,
            rust: r##"use std::collections::HashMap;

struct Router {
    routes: HashMap<String, fn() -> String>,
}

impl Router {
    fn new() -> Self { Self { routes: HashMap::new() } }

    fn route(&mut self, path: &str, handler: fn() -> String) {
        self.routes.insert(path.to_string(), handler);
    }

    fn dispatch(&self, path: &str) -> String {
        self.routes.get(path)
            .map(|h| h())
            .unwrap_or_else(|| "404 Not Found".to_string())
    }
}"##,
            confidence: 0.88,
            related: &["http_server", "rest_api", "middleware"],
        },

        // ── 알고리즘 ──────────────────────────────────────────
        SeedIntent {
            name: "sort_function",
            python: r##"def quicksort(arr: list) -> list:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)"##,
            rust: r##"fn quicksort<T: Ord + Clone>(arr: &[T]) -> Vec<T> {
    if arr.len() <= 1 { return arr.to_vec(); }
    let pivot = arr[arr.len() / 2].clone();
    let left: Vec<T> = arr.iter().filter(|x| **x < pivot).cloned().collect();
    let mid: Vec<T> = arr.iter().filter(|x| **x == pivot).cloned().collect();
    let right: Vec<T> = arr.iter().filter(|x| **x > pivot).cloned().collect();
    [quicksort(&left), mid, quicksort(&right)].concat()
}"##,
            confidence: 0.95,
            related: &["binary_search"],
        },
        SeedIntent {
            name: "binary_search",
            python: r##"def binary_search(arr: list, target) -> int:
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1"##,
            rust: r##"fn binary_search<T: Ord>(arr: &[T], target: &T) -> Option<usize> {
    let mut lo = 0usize;
    let mut hi = arr.len();
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        match arr[mid].cmp(target) {
            std::cmp::Ordering::Equal => return Some(mid),
            std::cmp::Ordering::Less => lo = mid + 1,
            std::cmp::Ordering::Greater => hi = mid,
        }
    }
    None
}"##,
            confidence: 0.95,
            related: &["sort_function"],
        },

        // ── 파일 I/O ──────────────────────────────────────────
        SeedIntent {
            name: "file_reader",
            python: r##"from pathlib import Path

def read_file(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")

def read_lines(path: str) -> list[str]:
    return Path(path).read_text(encoding="utf-8").splitlines()"##,
            rust: r##"use std::fs;
use std::io::{self, BufRead};
use std::path::Path;

fn read_file(path: &str) -> io::Result<String> {
    fs::read_to_string(path)
}

fn read_lines(path: &str) -> io::Result<Vec<String>> {
    let file = fs::File::open(path)?;
    io::BufReader::new(file).lines().collect()
}"##,
            confidence: 0.93,
            related: &["file_writer", "csv_parser"],
        },
        SeedIntent {
            name: "file_writer",
            python: r##"from pathlib import Path

def write_file(path: str, content: str):
    Path(path).write_text(content, encoding="utf-8")

def append_file(path: str, content: str):
    with open(path, "a", encoding="utf-8") as f:
        f.write(content)"##,
            rust: r##"use std::fs;
use std::io::{self, Write};

fn write_file(path: &str, content: &str) -> io::Result<()> {
    fs::write(path, content)
}

fn append_file(path: &str, content: &str) -> io::Result<()> {
    let mut f = fs::OpenOptions::new().append(true).create(true).open(path)?;
    f.write_all(content.as_bytes())
}"##,
            confidence: 0.93,
            related: &["file_reader", "logger"],
        },

        // ── 파서 ───────────────────────────────────────────────
        SeedIntent {
            name: "json_parser",
            python: r##"import json

def parse_json(text: str) -> dict:
    return json.loads(text)

def to_json(data: dict, pretty: bool = False) -> str:
    return json.dumps(data, indent=2 if pretty else None, ensure_ascii=False)"##,
            rust: r##"use serde_json::Value;

fn parse_json(text: &str) -> serde_json::Result<Value> {
    serde_json::from_str(text)
}

fn to_json(data: &Value, pretty: bool) -> serde_json::Result<String> {
    if pretty {
        serde_json::to_string_pretty(data)
    } else {
        serde_json::to_string(data)
    }
}"##,
            confidence: 0.94,
            related: &["csv_parser", "xml_parser", "serializer", "deserializer"],
        },
        SeedIntent {
            name: "csv_parser",
            python: r##"import csv
from io import StringIO

def parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(StringIO(text))
    return list(reader)

def to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()"##,
            rust: r##"use std::io::Cursor;
use csv::{ReaderBuilder, WriterBuilder};
use serde::{Deserialize, Serialize};

fn parse_csv<T: for<'de> Deserialize<'de>>(text: &str) -> Result<Vec<T>, csv::Error> {
    let mut rdr = ReaderBuilder::new().from_reader(Cursor::new(text));
    rdr.deserialize().collect()
}

fn to_csv<T: Serialize>(rows: &[T]) -> Result<String, csv::Error> {
    let mut wtr = WriterBuilder::new().from_writer(vec![]);
    for row in rows { wtr.serialize(row)?; }
    String::from_utf8(wtr.into_inner()?).map_err(|e| csv::Error::from(std::io::Error::new(std::io::ErrorKind::InvalidData, e)))
}"##,
            confidence: 0.88,
            related: &["json_parser", "file_reader"],
        },
        SeedIntent {
            name: "html_parser",
            python: r##"from html.parser import HTMLParser

class SimpleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags: list[str] = []

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)

def extract_tags(html: str) -> list[str]:
    parser = SimpleParser()
    parser.feed(html)
    return parser.tags"##,
            rust: r##"use scraper::{Html, Selector};

fn extract_tags(html: &str) -> Vec<String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse("*").unwrap();
    doc.select(&sel)
        .map(|el| el.value().name().to_string())
        .collect()
}"##,
            confidence: 0.87,
            related: &["xml_parser", "web_scraper"],
        },
        SeedIntent {
            name: "xml_parser",
            python: r##"import xml.etree.ElementTree as ET

def parse_xml(text: str) -> ET.Element:
    return ET.fromstring(text)

def find_all(text: str, tag: str) -> list[str]:
    root = ET.fromstring(text)
    return [el.text or "" for el in root.iter(tag)]"##,
            rust: r##"use quick_xml::Reader;
use quick_xml::events::Event;

fn extract_text_by_tag(xml: &str, target_tag: &str) -> Vec<String> {
    let mut reader = Reader::from_str(xml);
    let mut results = Vec::new();
    let mut inside = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.name().as_ref() == target_tag.as_bytes() => inside = true,
            Ok(Event::Text(e)) if inside => results.push(e.unescape().unwrap().to_string()),
            Ok(Event::End(_)) => inside = false,
            Ok(Event::Eof) => break,
            _ => {}
        }
        buf.clear();
    }
    results
}"##,
            confidence: 0.86,
            related: &["html_parser", "json_parser"],
        },
        SeedIntent {
            name: "regex_matcher",
            python: r##"import re

def find_all(pattern: str, text: str) -> list[str]:
    return re.findall(pattern, text)

def replace(pattern: str, repl: str, text: str) -> str:
    return re.sub(pattern, repl, text)

def is_match(pattern: str, text: str) -> bool:
    return bool(re.search(pattern, text))"##,
            rust: r##"use regex::Regex;

fn find_all(pattern: &str, text: &str) -> Vec<String> {
    let re = Regex::new(pattern).unwrap();
    re.find_iter(text).map(|m| m.as_str().to_string()).collect()
}

fn replace(pattern: &str, repl: &str, text: &str) -> String {
    let re = Regex::new(pattern).unwrap();
    re.replace_all(text, repl).to_string()
}

fn is_match(pattern: &str, text: &str) -> bool {
    Regex::new(pattern).map(|re| re.is_match(text)).unwrap_or(false)
}"##,
            confidence: 0.91,
            related: &["validator"],
        },

        // ── DB/캐시 ───────────────────────────────────────────
        SeedIntent {
            name: "database_client",
            python: r##"import sqlite3
from contextlib import contextmanager

@contextmanager
def connect(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def query(db_path: str, sql: str, params=()) -> list[dict]:
    with connect(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]"##,
            rust: r##"use rusqlite::{Connection, Result, params};

fn connect(db_path: &str) -> Result<Connection> {
    Connection::open(db_path)
}

fn query(conn: &Connection, sql: &str) -> Result<Vec<Vec<String>>> {
    let mut stmt = conn.prepare(sql)?;
    let col_count = stmt.column_count();
    let rows = stmt.query_map([], |row| {
        Ok((0..col_count).map(|i| row.get::<_, String>(i).unwrap_or_default()).collect())
    })?.collect::<Result<Vec<Vec<String>>>>()?;
    Ok(rows)
}"##,
            confidence: 0.90,
            related: &["sql_query", "orm_model"],
        },
        SeedIntent {
            name: "sql_query",
            python: r##"import sqlite3

def create_table(conn: sqlite3.Connection, name: str, columns: dict[str, str]):
    cols = ", ".join(f"{k} {v}" for k, v in columns.items())
    conn.execute(f"CREATE TABLE IF NOT EXISTS {name} ({cols})")
    conn.commit()

def insert(conn: sqlite3.Connection, table: str, data: dict):
    keys = ", ".join(data.keys())
    placeholders = ", ".join("?" for _ in data)
    conn.execute(f"INSERT INTO {table} ({keys}) VALUES ({placeholders})", list(data.values()))
    conn.commit()"##,
            rust: r##"use rusqlite::{Connection, Result, params_from_iter};

fn create_table(conn: &Connection, name: &str, columns: &[(&str, &str)]) -> Result<()> {
    let cols: Vec<String> = columns.iter().map(|(k, v)| format!("{k} {v}")).collect();
    conn.execute(&format!("CREATE TABLE IF NOT EXISTS {name} ({})", cols.join(", ")), [])?;
    Ok(())
}

fn insert(conn: &Connection, table: &str, keys: &[&str], values: &[&str]) -> Result<()> {
    let placeholders: Vec<&str> = vec!["?"; values.len()];
    let sql = format!("INSERT INTO {table} ({}) VALUES ({})", keys.join(", "), placeholders.join(", "));
    conn.execute(&sql, params_from_iter(values))?;
    Ok(())
}"##,
            confidence: 0.89,
            related: &["database_client", "orm_model"],
        },
        SeedIntent {
            name: "cache_client",
            python: r##"from functools import lru_cache
from typing import Any

class SimpleCache:
    def __init__(self, maxsize: int = 128):
        self._store: dict[str, Any] = {}
        self._maxsize = maxsize

    def get(self, key: str) -> Any | None:
        return self._store.get(key)

    def set(self, key: str, value: Any):
        if len(self._store) >= self._maxsize:
            oldest = next(iter(self._store))
            del self._store[oldest]
        self._store[key] = value

    def delete(self, key: str):
        self._store.pop(key, None)"##,
            rust: r##"use std::collections::HashMap;

struct SimpleCache<V> {
    store: HashMap<String, V>,
    maxsize: usize,
}

impl<V: Clone> SimpleCache<V> {
    fn new(maxsize: usize) -> Self { Self { store: HashMap::new(), maxsize } }

    fn get(&self, key: &str) -> Option<&V> { self.store.get(key) }

    fn set(&mut self, key: &str, value: V) {
        if self.store.len() >= self.maxsize {
            if let Some(first_key) = self.store.keys().next().cloned() {
                self.store.remove(&first_key);
            }
        }
        self.store.insert(key.to_string(), value);
    }

    fn delete(&mut self, key: &str) { self.store.remove(key); }
}"##,
            confidence: 0.88,
            related: &["redis_client", "database_client"],
        },
        SeedIntent {
            name: "redis_client",
            python: r##"import redis

def connect(host: str = "localhost", port: int = 6379) -> redis.Redis:
    return redis.Redis(host=host, port=port, decode_responses=True)

def cache_set(r: redis.Redis, key: str, value: str, ttl: int = 3600):
    r.set(key, value, ex=ttl)

def cache_get(r: redis.Redis, key: str) -> str | None:
    return r.get(key)"##,
            rust: r##"use redis::{Client, Commands, RedisResult};

fn connect(url: &str) -> RedisResult<redis::Connection> {
    let client = Client::open(url)?;
    client.get_connection()
}

fn cache_set(conn: &mut redis::Connection, key: &str, value: &str, ttl: u64) -> RedisResult<()> {
    conn.set_ex(key, value, ttl)
}

fn cache_get(conn: &mut redis::Connection, key: &str) -> RedisResult<Option<String>> {
    conn.get(key)
}"##,
            confidence: 0.86,
            related: &["cache_client", "database_client"],
        },
        SeedIntent {
            name: "orm_model",
            python: r##"from dataclasses import dataclass, field
from typing import Optional
import sqlite3

@dataclass
class Model:
    id: Optional[int] = None
    table: str = ""

    def save(self, conn: sqlite3.Connection):
        fields = {k: v for k, v in self.__dict__.items() if k not in ("id", "table") and v is not None}
        keys = ", ".join(fields.keys())
        placeholders = ", ".join("?" for _ in fields)
        conn.execute(f"INSERT INTO {self.table} ({keys}) VALUES ({placeholders})", list(fields.values()))
        conn.commit()"##,
            rust: r##"use rusqlite::{Connection, Result, params};

trait Model: Sized {
    fn table_name() -> &'static str;
    fn insert(&self, conn: &Connection) -> Result<i64>;
    fn find_by_id(conn: &Connection, id: i64) -> Result<Option<Self>>;
}

// Example implementation:
struct User { id: Option<i64>, name: String, email: String }

impl Model for User {
    fn table_name() -> &'static str { "users" }
    fn insert(&self, conn: &Connection) -> Result<i64> {
        conn.execute("INSERT INTO users (name, email) VALUES (?1, ?2)", params![self.name, self.email])?;
        Ok(conn.last_insert_rowid())
    }
    fn find_by_id(conn: &Connection, id: i64) -> Result<Option<Self>> {
        conn.query_row("SELECT id, name, email FROM users WHERE id = ?1", params![id], |row| {
            Ok(User { id: Some(row.get(0)?), name: row.get(1)?, email: row.get(2)? })
        }).optional()
    }
}"##,
            confidence: 0.86,
            related: &["database_client", "sql_query"],
        },

        // ── CLI / 설정 ────────────────────────────────────────
        SeedIntent {
            name: "cli_tool",
            python: r##"import argparse

def main():
    parser = argparse.ArgumentParser(description="My CLI tool")
    parser.add_argument("command", choices=["run", "test", "build"])
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--output", "-o", default="out.txt")
    args = parser.parse_args()
    print(f"Running {args.command} (verbose={args.verbose})")

if __name__ == "__main__":
    main()"##,
            rust: r##"use clap::Parser;

#[derive(Parser)]
#[command(name = "mycli", about = "My CLI tool")]
struct Cli {
    #[arg(value_enum)]
    command: Commands,
    #[arg(short, long)]
    verbose: bool,
    #[arg(short, long, default_value = "out.txt")]
    output: String,
}

#[derive(clap::ValueEnum, Clone)]
enum Commands { Run, Test, Build }

fn main() {
    let cli = Cli::parse();
    println!("Running {:?} (verbose={})", cli.command as u8, cli.verbose);
}"##,
            confidence: 0.90,
            related: &["argument_parser", "config_loader"],
        },
        SeedIntent {
            name: "argument_parser",
            python: r##"import sys

def parse_args(args: list[str] = None) -> dict:
    args = args or sys.argv[1:]
    result = {"flags": [], "params": {}, "positional": []}
    i = 0
    while i < len(args):
        if args[i].startswith("--"):
            key = args[i][2:]
            if i + 1 < len(args) and not args[i + 1].startswith("-"):
                result["params"][key] = args[i + 1]
                i += 1
            else:
                result["flags"].append(key)
        else:
            result["positional"].append(args[i])
        i += 1
    return result"##,
            rust: r##"use std::collections::HashMap;
use std::env;

struct ParsedArgs {
    flags: Vec<String>,
    params: HashMap<String, String>,
    positional: Vec<String>,
}

fn parse_args() -> ParsedArgs {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut result = ParsedArgs { flags: vec![], params: HashMap::new(), positional: vec![] };
    let mut i = 0;
    while i < args.len() {
        if args[i].starts_with("--") {
            let key = args[i][2..].to_string();
            if i + 1 < args.len() && !args[i + 1].starts_with('-') {
                result.params.insert(key, args[i + 1].clone());
                i += 1;
            } else {
                result.flags.push(key);
            }
        } else {
            result.positional.push(args[i].clone());
        }
        i += 1;
    }
    result
}"##,
            confidence: 0.89,
            related: &["cli_tool", "config_loader"],
        },
        SeedIntent {
            name: "config_loader",
            python: r##"import json
from pathlib import Path

def load_config(path: str, defaults: dict = None) -> dict:
    defaults = defaults or {}
    config_path = Path(path)
    if config_path.exists():
        with open(config_path) as f:
            loaded = json.load(f)
        return {**defaults, **loaded}
    return defaults

def save_config(path: str, config: dict):
    Path(path).write_text(json.dumps(config, indent=2))"##,
            rust: r##"use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

fn load_config<T: for<'de> Deserialize<'de>>(path: &str) -> Result<T, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?;
    let config: T = serde_json::from_str(&text)?;
    Ok(config)
}

fn save_config<T: Serialize>(path: &str, config: &T) -> Result<(), Box<dyn std::error::Error>> {
    let text = serde_json::to_string_pretty(config)?;
    fs::write(path, text)?;
    Ok(())
}"##,
            confidence: 0.90,
            related: &["json_parser", "file_reader"],
        },

        // ── 인증/보안 ─────────────────────────────────────────
        SeedIntent {
            name: "auth_handler",
            python: r##"import hashlib
import secrets

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return hashed.hex(), salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    computed, _ = hash_password(password, salt)
    return secrets.compare_digest(computed, hashed)"##,
            rust: r##"use sha2::{Sha256, Digest};
use rand::Rng;

fn hash_password(password: &str, salt: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(password.as_bytes());
    hasher.finalize().to_vec()
}

fn verify_password(password: &str, expected_hash: &[u8], salt: &[u8]) -> bool {
    let computed = hash_password(password, salt);
    computed == expected_hash
}

fn generate_salt() -> Vec<u8> {
    let mut rng = rand::thread_rng();
    (0..16).map(|_| rng.gen()).collect()
}"##,
            confidence: 0.89,
            related: &["jwt_handler", "hashing", "encryption"],
        },
        SeedIntent {
            name: "jwt_handler",
            python: r##"import json
import hmac
import hashlib
import base64
import time

def create_token(payload: dict, secret: str, exp_seconds: int = 3600) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload["exp"] = int(time.time()) + exp_seconds
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{header}.{body}.{sig_b64}"

def verify_token(token: str, secret: str) -> dict | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    sig = hmac.new(secret.encode(), f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    if not hmac.compare_digest(parts[2], expected):
        return None
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
    if payload.get("exp", 0) < time.time():
        return None
    return payload"##,
            rust: r##"use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{json, Value};

type HmacSha256 = Hmac<Sha256>;

fn create_token(payload: &Value, secret: &str) -> String {
    let header = URL_SAFE_NO_PAD.encode(r##"{"alg":"HS256","typ":"JWT"}"#);
    let body = URL_SAFE_NO_PAD.encode(payload.to_string());
    let message = format!("{header}.{body}");
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(message.as_bytes());
    let sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    format!("{message}.{sig}")
}"##,
            confidence: 0.86,
            related: &["auth_handler", "encryption"],
        },
        SeedIntent {
            name: "encryption",
            python: r##"from cryptography.fernet import Fernet

def generate_key() -> bytes:
    return Fernet.generate_key()

def encrypt(data: str, key: bytes) -> bytes:
    f = Fernet(key)
    return f.encrypt(data.encode())

def decrypt(token: bytes, key: bytes) -> str:
    f = Fernet(key)
    return f.decrypt(token).decode()"##,
            rust: r##"use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use rand::RngCore;

fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let cipher = Aes256Gcm::new_from_slice(key).unwrap();
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut result = nonce_bytes.to_vec();
    result.extend(cipher.encrypt(nonce, plaintext).unwrap());
    result
}

fn decrypt(ciphertext: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let cipher = Aes256Gcm::new_from_slice(key).unwrap();
    let nonce = Nonce::from_slice(&ciphertext[..12]);
    cipher.decrypt(nonce, &ciphertext[12..]).unwrap()
}"##,
            confidence: 0.85,
            related: &["hashing", "auth_handler"],
        },
        SeedIntent {
            name: "hashing",
            python: r##"import hashlib

def sha256(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()

def md5(data: str) -> str:
    return hashlib.md5(data.encode()).hexdigest()

def file_hash(path: str, algo: str = "sha256") -> str:
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()"##,
            rust: r##"use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::Read;

fn sha256_str(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn file_hash(path: &str) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}"##,
            confidence: 0.91,
            related: &["encryption", "auth_handler"],
        },

        // ── 비동기/작업 ───────────────────────────────────────
        SeedIntent {
            name: "queue_worker",
            python: r##"import queue
import threading

class Worker:
    def __init__(self):
        self.q: queue.Queue = queue.Queue()
        self._running = False

    def enqueue(self, task):
        self.q.put(task)

    def start(self, handler):
        self._running = True
        def run():
            while self._running:
                try:
                    task = self.q.get(timeout=1)
                    handler(task)
                    self.q.task_done()
                except queue.Empty:
                    continue
        threading.Thread(target=run, daemon=True).start()

    def stop(self):
        self._running = False"##,
            rust: r##"use std::sync::mpsc;
use std::thread;

struct Worker<T: Send + 'static> {
    sender: mpsc::Sender<T>,
}

impl<T: Send + 'static> Worker<T> {
    fn new(handler: impl Fn(T) + Send + 'static) -> Self {
        let (sender, receiver) = mpsc::channel::<T>();
        thread::spawn(move || {
            while let Ok(task) = receiver.recv() {
                handler(task);
            }
        });
        Worker { sender }
    }

    fn enqueue(&self, task: T) {
        self.sender.send(task).unwrap();
    }
}"##,
            confidence: 0.87,
            related: &["task_scheduler", "event_emitter"],
        },
        SeedIntent {
            name: "task_scheduler",
            python: r##"import sched
import time
import threading

scheduler = sched.scheduler(time.time, time.sleep)

def schedule_once(delay: float, func, *args):
    scheduler.enter(delay, 1, func, args)

def schedule_periodic(interval: float, func, *args):
    def wrapper():
        func(*args)
        schedule_periodic(interval, func, *args)
    scheduler.enter(interval, 1, wrapper)

def run():
    threading.Thread(target=scheduler.run, daemon=True).start()"##,
            rust: r##"use std::thread;
use std::time::Duration;

fn schedule_once<F: FnOnce() + Send + 'static>(delay: Duration, func: F) {
    thread::spawn(move || {
        thread::sleep(delay);
        func();
    });
}

fn schedule_periodic<F: Fn() + Send + 'static>(interval: Duration, func: F) {
    thread::spawn(move || {
        loop {
            thread::sleep(interval);
            func();
        }
    });
}"##,
            confidence: 0.87,
            related: &["queue_worker", "cron_job"],
        },
        SeedIntent {
            name: "cron_job",
            python: r##"import time
import threading
from datetime import datetime

class CronJob:
    def __init__(self, interval_seconds: int, func):
        self.interval = interval_seconds
        self.func = func
        self._running = False

    def start(self):
        self._running = True
        def loop_fn():
            while self._running:
                self.func()
                time.sleep(self.interval)
        threading.Thread(target=loop_fn, daemon=True).start()

    def stop(self):
        self._running = False"##,
            rust: r##"use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

struct CronJob {
    running: Arc<AtomicBool>,
}

impl CronJob {
    fn start<F: Fn() + Send + 'static>(interval: Duration, func: F) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let flag = running.clone();
        thread::spawn(move || {
            while flag.load(Ordering::Relaxed) {
                func();
                thread::sleep(interval);
            }
        });
        CronJob { running }
    }

    fn stop(&self) { self.running.store(false, Ordering::Relaxed); }
}"##,
            confidence: 0.87,
            related: &["task_scheduler", "queue_worker"],
        },

        // ── 로깅/모니터링 ─────────────────────────────────────
        SeedIntent {
            name: "logger",
            python: r##"import logging
from datetime import datetime

def setup_logger(name: str, level: str = "INFO", log_file: str = None) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level))
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)
    if log_file:
        fh = logging.FileHandler(log_file)
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    return logger"##,
            rust: r##"use std::fs::OpenOptions;
use std::io::Write;
use chrono::Local;

enum Level { Info, Warn, Error, Debug }

struct Logger { name: String, file: Option<String> }

impl Logger {
    fn new(name: &str) -> Self { Self { name: name.to_string(), file: None } }
    fn with_file(mut self, path: &str) -> Self { self.file = Some(path.to_string()); self }

    fn log(&self, level: Level, msg: &str) {
        let lvl = match level { Level::Info => "INFO", Level::Warn => "WARN", Level::Error => "ERROR", Level::Debug => "DEBUG" };
        let line = format!("{} [{}] {}: {}", Local::now().format("%Y-%m-%d %H:%M:%S"), lvl, self.name, msg);
        eprintln!("{line}");
        if let Some(ref path) = self.file {
            if let Ok(mut f) = OpenOptions::new().append(true).create(true).open(path) {
                let _ = writeln!(f, "{line}");
            }
        }
    }
}"##,
            confidence: 0.90,
            related: &["metrics_collector", "file_writer"],
        },
        SeedIntent {
            name: "metrics_collector",
            python: r##"import time
from collections import defaultdict

class Metrics:
    def __init__(self):
        self.counters: dict[str, int] = defaultdict(int)
        self.timers: dict[str, list[float]] = defaultdict(list)

    def increment(self, name: str, value: int = 1):
        self.counters[name] += value

    def time(self, name: str):
        class Timer:
            def __init__(self, metrics, n):
                self.metrics = metrics
                self.name = n
            def __enter__(self):
                self.start = time.time()
                return self
            def __exit__(self, *args):
                self.metrics.timers[self.name].append(time.time() - self.start)
        return Timer(self, name)

    def summary(self) -> dict:
        result = {"counters": dict(self.counters), "timers": {}}
        for k, v in self.timers.items():
            result["timers"][k] = {"count": len(v), "avg_ms": sum(v) / len(v) * 1000 if v else 0}
        return result"##,
            rust: r##"use std::collections::HashMap;
use std::time::Instant;

struct Metrics {
    counters: HashMap<String, u64>,
    timers: HashMap<String, Vec<f64>>,
}

impl Metrics {
    fn new() -> Self { Self { counters: HashMap::new(), timers: HashMap::new() } }

    fn increment(&mut self, name: &str, value: u64) {
        *self.counters.entry(name.to_string()).or_insert(0) += value;
    }

    fn start_timer(&self) -> Instant { Instant::now() }

    fn record_timer(&mut self, name: &str, start: Instant) {
        self.timers.entry(name.to_string()).or_default()
            .push(start.elapsed().as_secs_f64() * 1000.0);
    }

    fn avg_ms(&self, name: &str) -> f64 {
        self.timers.get(name)
            .map(|v| if v.is_empty() { 0.0 } else { v.iter().sum::<f64>() / v.len() as f64 })
            .unwrap_or(0.0)
    }
}"##,
            confidence: 0.87,
            related: &["logger"],
        },

        // ── 데이터 처리 ───────────────────────────────────────
        SeedIntent {
            name: "data_processor",
            python: r##"from typing import Callable, Iterable

def pipeline(*fns: Callable) -> Callable:
    def run(data):
        result = data
        for fn in fns:
            result = fn(result)
        return result
    return run

def map_items(fn: Callable, items: Iterable) -> list:
    return [fn(item) for item in items]

def filter_items(fn: Callable, items: Iterable) -> list:
    return [item for item in items if fn(item)]

def group_by(key_fn: Callable, items: Iterable) -> dict:
    result: dict = {}
    for item in items:
        k = key_fn(item)
        result.setdefault(k, []).append(item)
    return result"##,
            rust: r##"use std::collections::HashMap;

fn pipeline<T>(data: T, fns: &[fn(T) -> T]) -> T {
    fns.iter().fold(data, |acc, f| f(acc))
}

fn group_by<T, K: std::hash::Hash + Eq>(items: Vec<T>, key_fn: impl Fn(&T) -> K) -> HashMap<K, Vec<T>> {
    let mut result: HashMap<K, Vec<T>> = HashMap::new();
    for item in items {
        let key = key_fn(&item);
        result.entry(key).or_default().push(item);
    }
    result
}"##,
            confidence: 0.88,
            related: &["csv_parser", "json_parser"],
        },
        SeedIntent {
            name: "serializer",
            python: r##"import json
from dataclasses import dataclass, asdict

def serialize(obj) -> str:
    if hasattr(obj, "__dict__"):
        return json.dumps(obj.__dict__)
    return json.dumps(obj)

def serialize_list(items: list) -> str:
    return json.dumps([asdict(i) if hasattr(i, "__dataclass_fields__") else i for i in items])"##,
            rust: r##"use serde::Serialize;
use serde_json;

fn serialize<T: Serialize>(obj: &T) -> serde_json::Result<String> {
    serde_json::to_string(obj)
}

fn serialize_pretty<T: Serialize>(obj: &T) -> serde_json::Result<String> {
    serde_json::to_string_pretty(obj)
}

fn serialize_bytes<T: Serialize>(obj: &T) -> serde_json::Result<Vec<u8>> {
    serde_json::to_vec(obj)
}"##,
            confidence: 0.91,
            related: &["deserializer", "json_parser"],
        },
        SeedIntent {
            name: "deserializer",
            python: r##"import json
from typing import Type, TypeVar
from dataclasses import fields

T = TypeVar("T")

def deserialize(text: str, cls: Type[T] = None) -> T | dict:
    data = json.loads(text)
    if cls is None:
        return data
    return cls(**{f.name: data.get(f.name) for f in fields(cls) if f.name in data})"##,
            rust: r##"use serde::de::DeserializeOwned;
use serde_json;

fn deserialize<T: DeserializeOwned>(text: &str) -> serde_json::Result<T> {
    serde_json::from_str(text)
}

fn deserialize_bytes<T: DeserializeOwned>(bytes: &[u8]) -> serde_json::Result<T> {
    serde_json::from_slice(bytes)
}"##,
            confidence: 0.91,
            related: &["serializer", "json_parser"],
        },
        SeedIntent {
            name: "compression",
            python: r##"import gzip
import zlib

def compress_gzip(data: bytes) -> bytes:
    return gzip.compress(data)

def decompress_gzip(data: bytes) -> bytes:
    return gzip.decompress(data)

def compress_zlib(data: bytes) -> bytes:
    return zlib.compress(data)

def decompress_zlib(data: bytes) -> bytes:
    return zlib.decompress(data)"##,
            rust: r##"use flate2::write::{GzEncoder, GzDecoder};
use flate2::Compression;
use std::io::Write;

fn compress_gzip(data: &[u8]) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()
}

fn decompress_gzip(data: &[u8]) -> Vec<u8> {
    let mut decoder = GzDecoder::new(Vec::new());
    decoder.write_all(data).unwrap();
    decoder.finish().unwrap()
}"##,
            confidence: 0.87,
            related: &["file_reader", "file_writer"],
        },

        // ── 미들웨어/웹 ──────────────────────────────────────
        SeedIntent {
            name: "middleware",
            python: r##"from typing import Callable
import time

def logging_middleware(handler: Callable) -> Callable:
    def wrapper(request):
        start = time.time()
        print(f"→ {request.get('method', 'GET')} {request.get('path', '/')}")
        response = handler(request)
        elapsed = (time.time() - start) * 1000
        print(f"← {response.get('status', 200)} ({elapsed:.1f}ms)")
        return response
    return wrapper

def auth_middleware(handler: Callable, secret: str) -> Callable:
    def wrapper(request):
        token = request.get("headers", {}).get("Authorization", "")
        if not token:
            return {"status": 401, "body": "Unauthorized"}
        return handler(request)
    return wrapper"##,
            rust: r##"use std::time::Instant;

type Handler = fn(&Request) -> Response;

struct Request { method: String, path: String, headers: Vec<(String, String)> }
struct Response { status: u16, body: String }

fn logging_middleware(handler: Handler) -> impl Fn(&Request) -> Response {
    move |req: &Request| {
        let start = Instant::now();
        eprintln!("→ {} {}", req.method, req.path);
        let resp = handler(req);
        eprintln!("← {} ({:.1}ms)", resp.status, start.elapsed().as_secs_f64() * 1000.0);
        resp
    }
}"##,
            confidence: 0.87,
            related: &["http_server", "rest_api", "rate_limiter", "auth_handler"],
        },
        SeedIntent {
            name: "rate_limiter",
            python: r##"import time
from collections import defaultdict

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max = max_requests
        self.window = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max:
            return False
        self.requests[key].append(now)
        return True"##,
            rust: r##"use std::collections::HashMap;
use std::time::{Duration, Instant};

struct RateLimiter {
    max_requests: usize,
    window: Duration,
    requests: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    fn new(max_requests: usize, window: Duration) -> Self {
        Self { max_requests, window, requests: HashMap::new() }
    }

    fn allow(&mut self, key: &str) -> bool {
        let now = Instant::now();
        let entry = self.requests.entry(key.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t) < self.window);
        if entry.len() >= self.max_requests { return false; }
        entry.push(now);
        true
    }
}"##,
            confidence: 0.88,
            related: &["middleware", "cache_client"],
        },
        SeedIntent {
            name: "validator",
            python: r##"import re

def validate_email(email: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email))

def validate_url(url: str) -> bool:
    return bool(re.match(r"^https?://[^\s/$.?#].[^\s]*$", url))

def validate_length(value: str, min_len: int = 0, max_len: int = 255) -> bool:
    return min_len <= len(value) <= max_len

def validate_range(value: float, min_val: float, max_val: float) -> bool:
    return min_val <= value <= max_val"##,
            rust: r##"use regex::Regex;

fn validate_email(email: &str) -> bool {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        .map(|re| re.is_match(email)).unwrap_or(false)
}

fn validate_url(url: &str) -> bool {
    Regex::new(r"^https?://[^\s/$.?#].[^\s]*$")
        .map(|re| re.is_match(url)).unwrap_or(false)
}

fn validate_length(value: &str, min: usize, max: usize) -> bool {
    let len = value.len();
    len >= min && len <= max
}

fn validate_range(value: f64, min: f64, max: f64) -> bool {
    value >= min && value <= max
}"##,
            confidence: 0.90,
            related: &["regex_matcher", "auth_handler"],
        },

        // ── 이메일/PDF/이미지 ─────────────────────────────────
        SeedIntent {
            name: "email_sender",
            python: r##"import smtplib
from email.mime.text import MIMEText

def send_email(smtp_host: str, port: int, from_addr: str, to_addr: str,
               subject: str, body: str, password: str):
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    with smtplib.SMTP(smtp_host, port) as server:
        server.starttls()
        server.login(from_addr, password)
        server.send_message(msg)"##,
            rust: r##"use lettre::{Message, SmtpTransport, Transport};
use lettre::transport::smtp::authentication::Credentials;

fn send_email(smtp_host: &str, from: &str, to: &str, subject: &str, body: &str, password: &str) {
    let email = Message::builder()
        .from(from.parse().unwrap())
        .to(to.parse().unwrap())
        .subject(subject)
        .body(body.to_string())
        .unwrap();

    let creds = Credentials::new(from.to_string(), password.to_string());
    let mailer = SmtpTransport::relay(smtp_host).unwrap().credentials(creds).build();
    mailer.send(&email).unwrap();
}"##,
            confidence: 0.85,
            related: &["auth_handler"],
        },
        SeedIntent {
            name: "image_processor",
            python: r##"from PIL import Image

def resize(input_path: str, output_path: str, width: int, height: int):
    img = Image.open(input_path)
    img.thumbnail((width, height))
    img.save(output_path)

def to_grayscale(input_path: str, output_path: str):
    img = Image.open(input_path).convert("L")
    img.save(output_path)

def rotate(input_path: str, output_path: str, degrees: float):
    img = Image.open(input_path).rotate(degrees, expand=True)
    img.save(output_path)"##,
            rust: r##"use image::{open, imageops, DynamicImage};

fn resize(input: &str, output: &str, width: u32, height: u32) {
    let img = open(input).unwrap();
    let resized = img.thumbnail(width, height);
    resized.save(output).unwrap();
}

fn to_grayscale(input: &str, output: &str) {
    let img = open(input).unwrap().grayscale();
    img.save(output).unwrap();
}

fn rotate(input: &str, output: &str, degrees: f32) {
    let img = open(input).unwrap();
    let rotated = img.rotate90();
    rotated.save(output).unwrap();
}"##,
            confidence: 0.85,
            related: &["file_reader", "file_writer"],
        },
        SeedIntent {
            name: "pdf_generator",
            python: r##"from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

def create_pdf(output_path: str, title: str, lines: list[str]):
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, height - 72, title)
    c.setFont("Helvetica", 12)
    y = height - 120
    for line in lines:
        if y < 72:
            c.showPage()
            y = height - 72
        c.drawString(72, y, line)
        y -= 18
    c.save()"##,
            rust: r##"use printpdf::*;
use std::fs::File;
use std::io::BufWriter;

fn create_pdf(output_path: &str, title: &str, lines: &[&str]) {
    let (doc, page1, layer1) = PdfDocument::new(title, Mm(210.0), Mm(297.0), "Layer 1");
    let layer = doc.get_page(page1).get_layer(layer1);
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
    layer.use_text(title, 16.0, Mm(25.0), Mm(270.0), &font);
    let mut y = 250.0;
    for line in lines {
        layer.use_text(*line, 12.0, Mm(25.0), Mm(y), &font);
        y -= 6.0;
    }
    doc.save(&mut BufWriter::new(File::create(output_path).unwrap())).unwrap();
}"##,
            confidence: 0.85,
            related: &["file_writer"],
        },

        // ── 테스트 ────────────────────────────────────────────
        SeedIntent {
            name: "unit_test",
            python: r##"import unittest

class TestExample(unittest.TestCase):
    def setUp(self):
        self.data = [3, 1, 2]

    def test_sort(self):
        self.assertEqual(sorted(self.data), [1, 2, 3])

    def test_len(self):
        self.assertEqual(len(self.data), 3)

    def test_contains(self):
        self.assertIn(1, self.data)

if __name__ == "__main__":
    unittest.main()"##,
            rust: r##"#[cfg(test)]
mod tests {
    #[test]
    fn test_sort() {
        let mut data = vec![3, 1, 2];
        data.sort();
        assert_eq!(data, vec![1, 2, 3]);
    }

    #[test]
    fn test_len() {
        let data = vec![3, 1, 2];
        assert_eq!(data.len(), 3);
    }

    #[test]
    fn test_contains() {
        let data = vec![3, 1, 2];
        assert!(data.contains(&1));
    }
}"##,
            confidence: 0.94,
            related: &["integration_test"],
        },
        SeedIntent {
            name: "integration_test",
            python: r##"import requests
import unittest

class TestAPI(unittest.TestCase):
    BASE_URL = "http://localhost:8080"

    def test_health(self):
        resp = requests.get(f"{self.BASE_URL}/health")
        self.assertEqual(resp.status_code, 200)

    def test_create_and_get(self):
        data = {"name": "test", "value": 42}
        resp = requests.post(f"{self.BASE_URL}/items", json=data)
        self.assertEqual(resp.status_code, 201)
        item_id = resp.json()["id"]
        resp = requests.get(f"{self.BASE_URL}/items/{item_id}")
        self.assertEqual(resp.json()["name"], "test")"##,
            rust: r##"#[cfg(test)]
mod integration_tests {
    use reqwest::blocking::Client;

    #[test]
    #[ignore] // Run with: cargo test -- --ignored
    fn test_health() {
        let client = Client::new();
        let resp = client.get("http://localhost:8080/health").send().unwrap();
        assert_eq!(resp.status(), 200);
    }

    #[test]
    #[ignore]
    fn test_create_and_get() {
        let client = Client::new();
        let resp = client.post("http://localhost:8080/items")
            .json(&serde_json::json!({"name": "test", "value": 42}))
            .send().unwrap();
        assert_eq!(resp.status(), 201);
    }
}"##,
            confidence: 0.88,
            related: &["unit_test", "http_server"],
        },

        // ── 디자인 패턴 ──────────────────────────────────────
        SeedIntent {
            name: "template_engine",
            python: r##"import re

def render(template: str, context: dict) -> str:
    def replacer(match):
        key = match.group(1).strip()
        return str(context.get(key, match.group(0)))
    return re.sub(r"\{\{(.+?)\}\}", replacer, template)"##,
            rust: r##"use std::collections::HashMap;

fn render(template: &str, context: &HashMap<&str, &str>) -> String {
    let mut result = template.to_string();
    for (key, value) in context {
        result = result.replace(&format!("{{{{{}}}}}", key), value);
    }
    result
}"##,
            confidence: 0.89,
            related: &["regex_matcher"],
        },
        SeedIntent {
            name: "state_machine",
            python: r##"from typing import Callable

class StateMachine:
    def __init__(self, initial: str):
        self.state = initial
        self.transitions: dict[tuple[str, str], str] = {}
        self.actions: dict[str, Callable] = {}

    def add_transition(self, from_state: str, event: str, to_state: str):
        self.transitions[(from_state, event)] = to_state

    def on_enter(self, state: str, action: Callable):
        self.actions[state] = action

    def handle(self, event: str) -> bool:
        key = (self.state, event)
        if key in self.transitions:
            self.state = self.transitions[key]
            if self.state in self.actions:
                self.actions[self.state]()
            return True
        return False"##,
            rust: r##"use std::collections::HashMap;

struct StateMachine {
    state: String,
    transitions: HashMap<(String, String), String>,
}

impl StateMachine {
    fn new(initial: &str) -> Self {
        Self { state: initial.to_string(), transitions: HashMap::new() }
    }

    fn add_transition(&mut self, from: &str, event: &str, to: &str) {
        self.transitions.insert((from.to_string(), event.to_string()), to.to_string());
    }

    fn handle(&mut self, event: &str) -> bool {
        let key = (self.state.clone(), event.to_string());
        if let Some(next) = self.transitions.get(&key) {
            self.state = next.clone();
            true
        } else {
            false
        }
    }

    fn current(&self) -> &str { &self.state }
}"##,
            confidence: 0.89,
            related: &["event_emitter", "observer_pattern"],
        },
        SeedIntent {
            name: "event_emitter",
            python: r##"from typing import Callable
from collections import defaultdict

class EventEmitter:
    def __init__(self):
        self._handlers: dict[str, list[Callable]] = defaultdict(list)

    def on(self, event: str, handler: Callable):
        self._handlers[event].append(handler)

    def off(self, event: str, handler: Callable):
        self._handlers[event] = [h for h in self._handlers[event] if h != handler]

    def emit(self, event: str, *args, **kwargs):
        for handler in self._handlers.get(event, []):
            handler(*args, **kwargs)"##,
            rust: r##"use std::collections::HashMap;

type Handler = Box<dyn Fn(&str)>;

struct EventEmitter {
    handlers: HashMap<String, Vec<Handler>>,
}

impl EventEmitter {
    fn new() -> Self { Self { handlers: HashMap::new() } }

    fn on(&mut self, event: &str, handler: impl Fn(&str) + 'static) {
        self.handlers.entry(event.to_string()).or_default().push(Box::new(handler));
    }

    fn emit(&self, event: &str, data: &str) {
        if let Some(handlers) = self.handlers.get(event) {
            for handler in handlers {
                handler(data);
            }
        }
    }
}"##,
            confidence: 0.89,
            related: &["observer_pattern", "state_machine"],
        },
        SeedIntent {
            name: "observer_pattern",
            python: r##"from typing import Protocol

class Observer(Protocol):
    def update(self, event: str, data: dict): ...

class Subject:
    def __init__(self):
        self._observers: list[Observer] = []

    def subscribe(self, observer: Observer):
        self._observers.append(observer)

    def unsubscribe(self, observer: Observer):
        self._observers.remove(observer)

    def notify(self, event: str, data: dict = None):
        for obs in self._observers:
            obs.update(event, data or {})"##,
            rust: r##"trait Observer {
    fn update(&self, event: &str, data: &str);
}

struct Subject {
    observers: Vec<Box<dyn Observer>>,
}

impl Subject {
    fn new() -> Self { Self { observers: vec![] } }

    fn subscribe(&mut self, observer: Box<dyn Observer>) {
        self.observers.push(observer);
    }

    fn notify(&self, event: &str, data: &str) {
        for obs in &self.observers {
            obs.update(event, data);
        }
    }
}"##,
            confidence: 0.89,
            related: &["event_emitter", "state_machine"],
        },
        SeedIntent {
            name: "factory_pattern",
            python: r##"from typing import Protocol

class Shape(Protocol):
    def area(self) -> float: ...

class Circle:
    def __init__(self, radius: float):
        self.radius = radius
    def area(self) -> float:
        return 3.14159 * self.radius ** 2

class Rectangle:
    def __init__(self, w: float, h: float):
        self.w, self.h = w, h
    def area(self) -> float:
        return self.w * self.h

def create_shape(kind: str, **kwargs) -> Shape:
    match kind:
        case "circle": return Circle(kwargs["radius"])
        case "rectangle": return Rectangle(kwargs["w"], kwargs["h"])
        case _: raise ValueError(f"Unknown shape: {kind}")"##,
            rust: r##"trait Shape {
    fn area(&self) -> f64;
}

struct Circle { radius: f64 }
impl Shape for Circle { fn area(&self) -> f64 { std::f64::consts::PI * self.radius * self.radius } }

struct Rectangle { w: f64, h: f64 }
impl Shape for Rectangle { fn area(&self) -> f64 { self.w * self.h } }

fn create_shape(kind: &str, params: &[f64]) -> Box<dyn Shape> {
    match kind {
        "circle" => Box::new(Circle { radius: params[0] }),
        "rectangle" => Box::new(Rectangle { w: params[0], h: params[1] }),
        _ => panic!("Unknown shape: {kind}"),
    }
}"##,
            confidence: 0.90,
            related: &["builder_pattern", "singleton_pattern"],
        },
        SeedIntent {
            name: "singleton_pattern",
            python: r##"class Singleton:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            self._initialized = True
            self.data = {}

    def set(self, key: str, value):
        self.data[key] = value

    def get(self, key: str):
        return self.data.get(key)"##,
            rust: r##"use std::sync::OnceLock;
use std::collections::HashMap;
use std::sync::Mutex;

static INSTANCE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn singleton() -> &'static Mutex<HashMap<String, String>> {
    INSTANCE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn set(key: &str, value: &str) {
    singleton().lock().unwrap().insert(key.to_string(), value.to_string());
}

fn get(key: &str) -> Option<String> {
    singleton().lock().unwrap().get(key).cloned()
}"##,
            confidence: 0.89,
            related: &["factory_pattern", "builder_pattern"],
        },
        SeedIntent {
            name: "builder_pattern",
            python: r##"class QueryBuilder:
    def __init__(self, table: str):
        self._table = table
        self._select = "*"
        self._where: list[str] = []
        self._order: str | None = None
        self._limit: int | None = None

    def select(self, cols: str):
        self._select = cols
        return self

    def where(self, condition: str):
        self._where.append(condition)
        return self

    def order_by(self, col: str):
        self._order = col
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def build(self) -> str:
        sql = f"SELECT {self._select} FROM {self._table}"
        if self._where:
            sql += " WHERE " + " AND ".join(self._where)
        if self._order:
            sql += f" ORDER BY {self._order}"
        if self._limit:
            sql += f" LIMIT {self._limit}"
        return sql"##,
            rust: r##"struct QueryBuilder {
    table: String,
    select: String,
    conditions: Vec<String>,
    order: Option<String>,
    limit: Option<usize>,
}

impl QueryBuilder {
    fn new(table: &str) -> Self {
        Self { table: table.to_string(), select: "*".to_string(), conditions: vec![], order: None, limit: None }
    }
    fn select(mut self, cols: &str) -> Self { self.select = cols.to_string(); self }
    fn where_clause(mut self, cond: &str) -> Self { self.conditions.push(cond.to_string()); self }
    fn order_by(mut self, col: &str) -> Self { self.order = Some(col.to_string()); self }
    fn limit(mut self, n: usize) -> Self { self.limit = Some(n); self }

    fn build(&self) -> String {
        let mut sql = format!("SELECT {} FROM {}", self.select, self.table);
        if !self.conditions.is_empty() { sql += &format!(" WHERE {}", self.conditions.join(" AND ")); }
        if let Some(ref o) = self.order { sql += &format!(" ORDER BY {o}"); }
        if let Some(n) = self.limit { sql += &format!(" LIMIT {n}"); }
        sql
    }
}"##,
            confidence: 0.90,
            related: &["factory_pattern", "sql_query"],
        },
    ]
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::TritState;

    #[test]
    fn test_seed_fills_50_intents() {
        let mut net = CellNet::new();
        let (seeded, confirmed) = seed(&mut net, 100);
        assert_eq!(seeded, 51);
        assert_eq!(net.len(), 51);
        // 모든 셀이 확정 상태여야 함 (confidence >= 0.85)
        assert_eq!(confirmed, 51, "모든 시드 셀이 확정(+2) 상태여야 합니다");
    }

    #[test]
    fn test_seed_each_cell_has_two_patterns() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        for (_, cell) in net.iter() {
            assert_eq!(
                cell.patterns.len(), 2,
                "cell {}에 Python+Rust 패턴 2개 필요 (실제: {}개)",
                cell.intent, cell.patterns.len()
            );
            let langs: Vec<&str> = cell.patterns.iter().map(|p| p.target_lang.as_str()).collect();
            assert!(langs.contains(&"python"), "cell {}에 Python 패턴 없음 ", cell.intent);
            assert!(langs.contains(&"rust"), "cell {}에 Rust 패턴 없음 ", cell.intent);
        }
    }

    #[test]
    fn test_seed_all_confirmed() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        for (_, cell) in net.iter() {
            assert_eq!(
                cell.trit_state,
                TritState::Confirmed,
                "cell {} 상태가 확정이 아님: {:?} (energy: {:.3})",
                cell.intent, cell.trit_state, cell.energy
            );
            assert!(
                cell.energy >= 0.75,
                "cell {} 에너지 {:.3} < 0.75",
                cell.intent, cell.energy
            );
        }
    }

    #[test]
    fn test_seed_confidence_above_085() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        for (_, cell) in net.iter() {
            for pattern in &cell.patterns {
                assert!(
                    pattern.confidence >= 0.85,
                    "cell {} {} 패턴 confidence {:.3} < 0.85",
                    cell.intent, pattern.target_lang, pattern.confidence
                );
            }
        }
    }

    #[test]
    fn test_seed_idempotent() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        let count_first = net.len();
        // 두 번째 시드는 이미 존재하므로 추가하지 않음
        let (seeded, _) = seed(&mut net, 100);
        assert_eq!(seeded, 0, "중복 시드 시 새 셀이 추가되면 안 됨 ");
        assert_eq!(net.len(), count_first);
    }

    #[test]
    fn test_seed_partial_count() {
        let mut net = CellNet::new();
        let (seeded, _) = seed(&mut net, 10);
        assert_eq!(seeded, 10);
        assert_eq!(net.len(), 10);
    }

    #[test]
    fn test_seed_edges_created() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        // http_server는 rest_api, tcp_server, websocket_server에 연결되어야 함
        let http = net.find_by_intent("http_server").unwrap();
        assert!(
            !http.edges.is_empty(),
            "http_server에 관계 엣지가 없음 "
        );
    }

    #[test]
    fn test_seed_patterns_contain_imports() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        let http = net.find_by_intent("http_server").unwrap();
        let py = http.pattern_for("python").unwrap();
        assert!(py.code.contains("import") || py.code.contains("from"),
            "Python 패턴에 import 없음 ");
        let rs = http.pattern_for("rust").unwrap();
        assert!(rs.code.contains("use ") || rs.code.contains("fn "),
            "Rust 패턴에 use/fn 없음 ");
    }

    #[test]
    fn test_all_50_intents_present() {
        let expected = [
            "http_server", "rest_api", "sort_function", "binary_search",
            "file_reader", "file_writer", "json_parser", "csv_parser",
            "database_client", "sql_query", "web_scraper", "cli_tool",
            "auth_handler", "jwt_handler", "websocket_server", "tcp_server",
            "cache_client", "redis_client", "queue_worker", "task_scheduler",
            "logger", "metrics_collector", "data_processor", "html_parser",
            "xml_parser", "orm_model", "unit_test", "integration_test",
            "argument_parser", "config_loader", "email_sender",
            "image_processor", "pdf_generator", "cron_job", "middleware",
            "rate_limiter", "validator", "serializer", "deserializer",
            "encryption", "hashing", "compression", "regex_matcher",
            "url_router", "template_engine", "state_machine", "event_emitter",
            "observer_pattern", "factory_pattern", "singleton_pattern",
            "builder_pattern",
        ];
        let mut net = CellNet::new();
        seed(&mut net, 100);
        for intent in &expected {
            assert!(
                net.find_by_intent(intent).is_some(),
                "intent {} 누락", intent
            );
        }
    }

    #[test]
    fn test_seed_o1_lookup_after_seed() {
        let mut net = CellNet::new();
        seed(&mut net, 100);
        // 시드 후 O(1) 조회가 작동하는지 확인
        assert_eq!(net.evaluate_intent("http_server"), TritState::Confirmed);
        assert_eq!(net.evaluate_intent("sort_function"), TritState::Confirmed);
        assert_eq!(net.evaluate_intent("nonexistent"), TritState::Unknown);
    }
}
