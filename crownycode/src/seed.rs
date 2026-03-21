// crownycode/src/seed.rs
// ═══════════════════════════════════════════════════════════════
// 셀DB 시드 — 200개 기본 의도 패턴 (Python + Rust)
// ═══════════════════════════════════════════════════════════════
//
// 모든 요청이 미인지(-2)로 빠지는 것을 방지하기 위해
// CellNet에 확정(+2) 상태의 기본 패턴을 채운다.
//
// 사용법: crownycode seed --count 200

use crate::color::Colorize;

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
/// count: 채울 의도 수 (최대 200)
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
        count.min(200),
        if count > 0 {
            confirmed as f64 / count.min(200) as f64 * 100.0
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

/// 200개 기본 의도 — 실제 동작하는 최소 스니펫 (import/use 포함)
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

        // ══════════════════════════════════════════════════════════
        // ── 149 new high-value intents (52–200) ──────────────────
        // ══════════════════════════════════════════════════════════

        // ── Web Framework Specifics (20) ─────────────────────────

        SeedIntent {
            name: "graphql_server",
            python: r##"from ariadne import QueryType, make_executable_schema
from ariadne.asgi import GraphQL

type_defs = """type Query { hello: String! }"""
query = QueryType()

@query.field("hello")
def resolve_hello(*_):
    return "Hello from CrownyCode!"

schema = make_executable_schema(type_defs, query)
app = GraphQL(schema)"##,
            rust: r##"use async_graphql::{Object, Schema, EmptyMutation, EmptySubscription};

struct Query;

#[Object]
impl Query {
    async fn hello(&self) -> &str { "Hello from CrownyCode!" }
}

fn main() {
    let _schema = Schema::build(Query, EmptyMutation, EmptySubscription).finish();
}"##,
            confidence: 0.88,
            related: &["rest_api", "http_server"],
        },
        SeedIntent {
            name: "grpc_server",
            python: r##"import grpc
from concurrent import futures

class Greeter:
    def SayHello(self, request, context):
        return {"message": f"Hello {request.name}"}

server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
server.add_insecure_port("[::]:50051")
server.start()"##,
            rust: r##"use tonic::{transport::Server, Request, Response, Status};

async fn say_hello(request: Request<()>) -> Result<Response<String>, Status> {
    Ok(Response::new("Hello from CrownyCode!".into()))
}

#[tokio::main]
async fn main() {
    let addr = "[::1]:50051".parse().unwrap();
    println!("gRPC server on {}", addr);
}"##,
            confidence: 0.87,
            related: &["http_server", "rest_api"],
        },
        SeedIntent {
            name: "cors_middleware",
            python: r##"from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["https://example.com"], methods=["GET", "POST"])

@app.route("/api/data")
def data():
    return {"status": "ok"}"##,
            rust: r##"use axum::Router;
use tower_http::cors::{CorsLayer, Any};

fn app() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    Router::new().layer(cors)
}"##,
            confidence: 0.89,
            related: &["middleware", "rest_api"],
        },
        SeedIntent {
            name: "file_upload",
            python: r##"from fastapi import FastAPI, UploadFile
import shutil

app = FastAPI()

@app.post("/upload")
async def upload(file: UploadFile):
    with open(f"/tmp/{file.filename}", "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": file.filename}"##,
            rust: r##"use axum::{extract::Multipart, routing::post, Router};

async fn upload(mut multipart: Multipart) {
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        let data = field.bytes().await.unwrap();
        println!("field={} len={}", name, data.len());
    }
}

fn app() -> Router { Router::new().route("/upload", post(upload)) }"##,
            confidence: 0.88,
            related: &["rest_api", "static_file_server"],
        },
        SeedIntent {
            name: "static_file_server",
            python: r##"from aiohttp import web

app = web.Application()
app.router.add_static("/static/", path="./public", name="static")

if __name__ == "__main__":
    web.run_app(app, port=8080)"##,
            rust: r##"use axum::Router;
use tower_http::services::ServeDir;

fn app() -> Router {
    Router::new().nest_service("/static", ServeDir::new("public"))
}"##,
            confidence: 0.88,
            related: &["http_server", "file_reader"],
        },
        SeedIntent {
            name: "websocket_chat",
            python: r##"import asyncio
import websockets

CLIENTS = set()

async def handler(ws):
    CLIENTS.add(ws)
    try:
        async for msg in ws:
            await asyncio.gather(*(c.send(msg) for c in CLIENTS if c != ws))
    finally:
        CLIENTS.discard(ws)

asyncio.run(websockets.serve(handler, "0.0.0.0", 8765))"##,
            rust: r##"use tokio::sync::broadcast;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures::{StreamExt, SinkExt};

#[tokio::main]
async fn main() {
    let (tx, _) = broadcast::channel::<String>(100);
    let listener = TcpListener::bind("0.0.0.0:8765").await.unwrap();
    while let Ok((stream, _)) = listener.accept().await {
        let tx = tx.clone();
        let mut rx = tx.subscribe();
        tokio::spawn(async move {
            let ws = accept_async(stream).await.unwrap();
            let (mut sink, mut source) = ws.split();
            tokio::spawn(async move { while let Ok(m) = rx.recv().await { let _ = sink.send(m.into()).await; } });
            while let Some(Ok(m)) = source.next().await { let _ = tx.send(m.to_string()); }
        });
    }
}"##,
            confidence: 0.87,
            related: &["websocket_server", "tcp_server"],
        },
        SeedIntent {
            name: "health_check",
            python: r##"from fastapi import FastAPI
import time

app = FastAPI()
START = time.time()

@app.get("/health")
def health():
    return {"status": "ok", "uptime": time.time() - START}"##,
            rust: r##"use axum::{routing::get, Json, Router};
use serde_json::json;
use std::time::Instant;

static mut START: Option<Instant> = None;

async fn health() -> Json<serde_json::Value> {
    Json(json!({"status": "ok"}))
}

fn app() -> Router { Router::new().route("/health", get(health)) }"##,
            confidence: 0.90,
            related: &["rest_api", "http_server"],
        },
        SeedIntent {
            name: "pagination",
            python: r##"from fastapi import FastAPI, Query

app = FastAPI()
DATA = list(range(1000))

@app.get("/items")
def items(offset: int = Query(0, ge=0), limit: int = Query(20, le=100)):
    page = DATA[offset:offset + limit]
    return {"data": page, "total": len(DATA), "offset": offset, "limit": limit}"##,
            rust: r##"use axum::{extract::Query, routing::get, Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Pagination { offset: Option<usize>, limit: Option<usize> }

#[derive(Serialize)]
struct Page { data: Vec<i32>, total: usize }

async fn items(Query(p): Query<Pagination>) -> Json<Page> {
    let all: Vec<i32> = (0..1000).collect();
    let off = p.offset.unwrap_or(0);
    let lim = p.limit.unwrap_or(20);
    Json(Page { data: all[off..all.len().min(off+lim)].to_vec(), total: all.len() })
}

fn app() -> Router { Router::new().route("/items", get(items)) }"##,
            confidence: 0.89,
            related: &["rest_api", "query_builder"],
        },
        SeedIntent {
            name: "api_versioning",
            python: r##"from fastapi import FastAPI, APIRouter

app = FastAPI()
v1 = APIRouter(prefix="/api/v1")
v2 = APIRouter(prefix="/api/v2")

@v1.get("/users")
def users_v1():
    return [{"name": "Alice"}]

@v2.get("/users")
def users_v2():
    return [{"name": "Alice", "email": "a@b.com"}]

app.include_router(v1)
app.include_router(v2)"##,
            rust: r##"use axum::{routing::get, Json, Router};

async fn users_v1() -> Json<Vec<&'static str>> { Json(vec!["Alice"]) }
async fn users_v2() -> Json<Vec<&'static str>> { Json(vec!["Alice+email"]) }

fn app() -> Router {
    let v1 = Router::new().route("/users", get(users_v1));
    let v2 = Router::new().route("/users", get(users_v2));
    Router::new().nest("/api/v1", v1).nest("/api/v2", v2)
}"##,
            confidence: 0.88,
            related: &["rest_api", "url_router"],
        },
        SeedIntent {
            name: "request_logger",
            python: r##"from fastapi import FastAPI, Request
import time, logging

app = FastAPI()
logger = logging.getLogger("api")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    logger.info(f"{request.method} {request.url.path} {response.status_code} {ms:.1f}ms")
    return response"##,
            rust: r##"use axum::{Router, middleware};
use tower_http::trace::TraceLayer;

fn app() -> Router {
    Router::new().layer(TraceLayer::new_for_http())
}"##,
            confidence: 0.88,
            related: &["middleware", "logger"],
        },
        SeedIntent {
            name: "response_cache",
            python: r##"from cachetools import TTLCache
from fastapi import FastAPI

app = FastAPI()
cache = TTLCache(maxsize=256, ttl=60)

@app.get("/data/{key}")
def get_data(key: str):
    if key in cache:
        return {"data": cache[key], "cached": True}
    value = f"computed_{key}"
    cache[key] = value
    return {"data": value, "cached": False}"##,
            rust: r##"use std::collections::HashMap;
use std::time::{Duration, Instant};

struct TtlCache { map: HashMap<String, (String, Instant)>, ttl: Duration }

impl TtlCache {
    fn new(ttl_secs: u64) -> Self { Self { map: HashMap::new(), ttl: Duration::from_secs(ttl_secs) } }
    fn get(&self, key: &str) -> Option<&str> {
        self.map.get(key).filter(|(_, t)| t.elapsed() < self.ttl).map(|(v, _)| v.as_str())
    }
    fn set(&mut self, key: String, val: String) { self.map.insert(key, (val, Instant::now())); }
}"##,
            confidence: 0.87,
            related: &["cache_client", "rest_api"],
        },
        SeedIntent {
            name: "webhook_handler",
            python: r##"import hmac, hashlib
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
SECRET = b"webhook_secret"

@app.post("/webhook")
async def webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("X-Signature", "")
    expected = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(403, "Invalid signature")
    return {"status": "accepted"}"##,
            rust: r##"use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn verify_webhook(secret: &[u8], body: &[u8], signature: &str) -> bool {
    let mut mac = HmacSha256::new_from_slice(secret).unwrap();
    mac.update(body);
    let expected = hex::encode(mac.finalize().into_bytes());
    expected == signature
}"##,
            confidence: 0.87,
            related: &["rest_api", "hmac_auth"],
        },
        SeedIntent {
            name: "sse_server",
            python: r##"from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()

async def event_stream():
    i = 0
    while True:
        yield f"data: event {i}\n\n"
        i += 1
        await asyncio.sleep(1)

@app.get("/events")
def events():
    return StreamingResponse(event_stream(), media_type="text/event-stream")"##,
            rust: r##"use axum::{response::sse::{Event, Sse}, routing::get, Router};
use futures::stream::{self, Stream};
use std::time::Duration;

fn sse_handler() -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let stream = stream::repeat_with(|| Ok(Event::default().data("hello")))
        .throttle(Duration::from_secs(1));
    Sse::new(stream)
}

fn app() -> Router { Router::new().route("/events", get(sse_handler)) }"##,
            confidence: 0.87,
            related: &["websocket_server", "rest_api"],
        },
        SeedIntent {
            name: "multipart_form",
            python: r##"from fastapi import FastAPI, Form, UploadFile

app = FastAPI()

@app.post("/submit")
async def submit(name: str = Form(...), age: int = Form(...), photo: UploadFile = None):
    return {"name": name, "age": age, "has_photo": photo is not None}"##,
            rust: r##"use axum::{extract::Multipart, routing::post, Router};

async fn submit(mut form: Multipart) {
    while let Some(field) = form.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        let data = field.text().await.unwrap();
        println!("{name} = {data}");
    }
}

fn app() -> Router { Router::new().route("/submit", post(submit)) }"##,
            confidence: 0.87,
            related: &["file_upload", "rest_api"],
        },
        SeedIntent {
            name: "cookie_session",
            python: r##"from flask import Flask, session

app = Flask(__name__)
app.secret_key = "crowny_secret"

@app.route("/login")
def login():
    session["user"] = "alice"
    return "logged in"

@app.route("/me")
def me():
    return {"user": session.get("user", "anonymous")}"##,
            rust: r##"use axum::{routing::get, Router};
use tower_sessions::{MemoryStore, SessionManagerLayer};

fn app() -> Router {
    let store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(store);
    Router::new().route("/", get(|| async { "hello" })).layer(session_layer)
}"##,
            confidence: 0.86,
            related: &["auth_handler", "middleware"],
        },
        SeedIntent {
            name: "oauth_handler",
            python: r##"from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI

app = FastAPI()
oauth = OAuth()
oauth.register("github", client_id="ID", client_secret="SECRET",
    authorize_url="https://github.com/login/oauth/authorize",
    access_token_url="https://github.com/login/oauth/access_token")

@app.get("/login")
async def login(request):
    return await oauth.github.authorize_redirect(request, "http://localhost/callback")"##,
            rust: r##"use oauth2::{AuthorizationCode, AuthUrl, ClientId, ClientSecret, TokenUrl, basic::BasicClient};

fn oauth_client() -> BasicClient {
    BasicClient::new(
        ClientId::new("id".into()), Some(ClientSecret::new("secret".into())),
        AuthUrl::new("https://github.com/login/oauth/authorize".into()).unwrap(),
        Some(TokenUrl::new("https://github.com/login/oauth/access_token".into()).unwrap()),
    )
}"##,
            confidence: 0.86,
            related: &["auth_handler", "jwt_handler"],
        },
        SeedIntent {
            name: "api_key_auth",
            python: r##"from fastapi import FastAPI, Security, HTTPException
from fastapi.security import APIKeyHeader

app = FastAPI()
api_key_header = APIKeyHeader(name="X-API-Key")
VALID_KEYS = {"secret123"}

@app.get("/protected")
def protected(key: str = Security(api_key_header)):
    if key not in VALID_KEYS:
        raise HTTPException(403, "Invalid API key")
    return {"status": "ok"}"##,
            rust: r##"use axum::{http::HeaderMap, routing::get, Json, Router};

async fn protected(headers: HeaderMap) -> Json<&'static str> {
    let key = headers.get("X-API-Key").and_then(|v| v.to_str().ok()).unwrap_or("");
    if key != "secret123" { return Json("forbidden"); }
    Json("ok")
}

fn app() -> Router { Router::new().route("/protected", get(protected)) }"##,
            confidence: 0.88,
            related: &["auth_handler", "middleware"],
        },
        SeedIntent {
            name: "graphql_subscription",
            python: r##"from ariadne import SubscriptionType, make_executable_schema
import asyncio

subscription = SubscriptionType()

@subscription.source("counter")
async def counter_source(*_):
    i = 0
    while True:
        yield {"counter": i}
        i += 1
        await asyncio.sleep(1)

@subscription.field("counter")
def counter_resolver(obj, *_):
    return obj["counter"]"##,
            rust: r##"use async_graphql::{Subscription, Object, EmptyMutation, Schema};
use futures::Stream;

struct Query;
#[Object]
impl Query { async fn health(&self) -> bool { true } }

struct Sub;
#[Subscription]
impl Sub {
    async fn counter(&self) -> impl Stream<Item = i32> {
        futures::stream::iter(0..100)
    }
}"##,
            confidence: 0.86,
            related: &["graphql_server", "websocket_server"],
        },
        SeedIntent {
            name: "proxy_server",
            python: r##"import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy(request: Request, path: str):
    async with httpx.AsyncClient() as client:
        resp = await client.request(request.method, f"http://backend:8000/{path}",
            headers=dict(request.headers), content=await request.body())
        return StreamingResponse(iter([resp.content]), status_code=resp.status_code)"##,
            rust: r##"use hyper::{Client, Body, Request, Uri};

async fn proxy(req: Request<Body>) -> Result<hyper::Response<Body>, hyper::Error> {
    let client = Client::new();
    let uri: Uri = format!("http://backend:8000{}", req.uri()).parse().unwrap();
    let proxied = Request::builder().method(req.method()).uri(uri).body(req.into_body()).unwrap();
    client.request(proxied).await
}"##,
            confidence: 0.86,
            related: &["http_server", "http_client"],
        },
        SeedIntent {
            name: "load_balancer",
            python: r##"import itertools
import httpx

BACKENDS = ["http://localhost:8001", "http://localhost:8002", "http://localhost:8003"]
pool = itertools.cycle(BACKENDS)

async def forward(request_path: str):
    backend = next(pool)
    async with httpx.AsyncClient() as client:
        return await client.get(f"{backend}{request_path}")"##,
            rust: r##"use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn next_backend() -> &'static str {
    let backends = ["http://localhost:8001", "http://localhost:8002", "http://localhost:8003"];
    let idx = COUNTER.fetch_add(1, Ordering::Relaxed) % backends.len();
    backends[idx]
}"##,
            confidence: 0.86,
            related: &["proxy_server", "http_server"],
        },

        // ── Database & Storage (15) ──────────────────────────────

        SeedIntent {
            name: "postgresql_client",
            python: r##"import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://user:pass@localhost/db")
    rows = await conn.fetch("SELECT id, name FROM users WHERE active = $1", True)
    for row in rows:
        print(row["id"], row["name"])
    await conn.close()"##,
            rust: r##"use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    let pool = PgPoolOptions::new().max_connections(5)
        .connect("postgres://user:pass@localhost/db").await.unwrap();
    let rows = sqlx::query!("SELECT id, name FROM users WHERE active = true")
        .fetch_all(&pool).await.unwrap();
    for row in rows { println!("{} {}", row.id, row.name); }
}"##,
            confidence: 0.88,
            related: &["database_client", "connection_pool"],
        },
        SeedIntent {
            name: "mongodb_client",
            python: r##"from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client["mydb"]
col = db["users"]
col.insert_one({"name": "Alice", "age": 30})
user = col.find_one({"name": "Alice"})
print(user)"##,
            rust: r##"use mongodb::{Client, options::ClientOptions};

#[tokio::main]
async fn main() {
    let opts = ClientOptions::parse("mongodb://localhost:27017").await.unwrap();
    let client = Client::with_options(opts).unwrap();
    let db = client.database("mydb");
    let col = db.collection::<bson::Document>("users");
    let doc = bson::doc! { "name": "Alice", "age": 30 };
    col.insert_one(doc, None).await.unwrap();
}"##,
            confidence: 0.87,
            related: &["database_client", "connection_pool"],
        },
        SeedIntent {
            name: "connection_pool",
            python: r##"import asyncpg

async def create_pool():
    pool = await asyncpg.create_pool("postgresql://user:pass@localhost/db",
        min_size=5, max_size=20)
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT 1 as n")
        print(row["n"])
    await pool.close()"##,
            rust: r##"use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    let pool = PgPoolOptions::new()
        .min_connections(5)
        .max_connections(20)
        .connect("postgres://user:pass@localhost/db").await.unwrap();
    let row: (i64,) = sqlx::query_as("SELECT 1").fetch_one(&pool).await.unwrap();
    println!("{}", row.0);
}"##,
            confidence: 0.87,
            related: &["postgresql_client", "database_client"],
        },
        SeedIntent {
            name: "database_migration",
            python: r##"import sqlite3

MIGRATIONS = [
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    "ALTER TABLE users ADD COLUMN email TEXT",
]

def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER)")
    cur = conn.execute("SELECT COALESCE(MAX(version), -1) FROM _migrations")
    current = cur.fetchone()[0]
    for i, sql in enumerate(MIGRATIONS):
        if i > current:
            conn.execute(sql)
            conn.execute("INSERT INTO _migrations VALUES (?)", (i,))
    conn.commit()"##,
            rust: r##"use sqlx::{Pool, Postgres, migrate::Migrator};
use std::path::Path;

async fn run_migrations(pool: &Pool<Postgres>) {
    let migrator = Migrator::new(Path::new("./migrations")).await.unwrap();
    migrator.run(pool).await.unwrap();
    println!("Migrations applied");
}"##,
            confidence: 0.87,
            related: &["postgresql_client", "database_client"],
        },
        SeedIntent {
            name: "transaction_handler",
            python: r##"import asyncpg

async def transfer(pool, from_id: int, to_id: int, amount: float):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from_id)
            await conn.execute("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to_id)"##,
            rust: r##"use sqlx::{Pool, Postgres};

async fn transfer(pool: &Pool<Postgres>, from: i64, to: i64, amount: f64) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE accounts SET balance = balance - $1 WHERE id = $2")
        .bind(amount).bind(from).execute(&mut *tx).await?;
    sqlx::query("UPDATE accounts SET balance = balance + $1 WHERE id = $2")
        .bind(amount).bind(to).execute(&mut *tx).await?;
    tx.commit().await
}"##,
            confidence: 0.88,
            related: &["postgresql_client", "database_client"],
        },
        SeedIntent {
            name: "query_builder",
            python: r##"class SafeQuery:
    def __init__(self, table: str):
        self.table = table
        self.clauses = []
        self.params = []

    def where(self, col: str, op: str, val):
        self.clauses.append(f"{col} {op} ?")
        self.params.append(val)
        return self

    def build(self):
        sql = f"SELECT * FROM {self.table}"
        if self.clauses:
            sql += " WHERE " + " AND ".join(self.clauses)
        return sql, self.params"##,
            rust: r##"struct SafeQuery {
    table: String, clauses: Vec<String>, params: Vec<String>,
}

impl SafeQuery {
    fn new(table: &str) -> Self { Self { table: table.into(), clauses: vec![], params: vec![] } }
    fn where_eq(mut self, col: &str, val: &str) -> Self {
        self.clauses.push(format!("{} = ${}", col, self.params.len() + 1));
        self.params.push(val.into()); self
    }
    fn build(&self) -> String {
        let mut sql = format!("SELECT * FROM {}", self.table);
        if !self.clauses.is_empty() { sql += &format!(" WHERE {}", self.clauses.join(" AND ")); }
        sql
    }
}"##,
            confidence: 0.88,
            related: &["sql_query", "builder_pattern"],
        },
        SeedIntent {
            name: "key_value_store",
            python: r##"import json, os

class KVStore:
    def __init__(self, path: str):
        self.path = path
        self.data = json.load(open(path)) if os.path.exists(path) else {}

    def get(self, key: str, default=None):
        return self.data.get(key, default)

    def set(self, key: str, value):
        self.data[key] = value
        with open(self.path, "w") as f:
            json.dump(self.data, f)"##,
            rust: r##"use std::collections::HashMap;
use std::fs;

struct KvStore { path: String, data: HashMap<String, String> }

impl KvStore {
    fn open(path: &str) -> Self {
        let data = fs::read_to_string(path).ok()
            .and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        Self { path: path.into(), data }
    }
    fn get(&self, key: &str) -> Option<&str> { self.data.get(key).map(|s| s.as_str()) }
    fn set(&mut self, key: String, val: String) {
        self.data.insert(key, val);
        fs::write(&self.path, serde_json::to_string(&self.data).unwrap()).ok();
    }
}"##,
            confidence: 0.88,
            related: &["cache_client", "redis_client"],
        },
        SeedIntent {
            name: "time_series_db",
            python: r##"from collections import defaultdict
import time

class TimeSeries:
    def __init__(self):
        self.data = defaultdict(list)

    def add(self, metric: str, value: float):
        self.data[metric].append((time.time(), value))

    def query(self, metric: str, since: float):
        return [(t, v) for t, v in self.data[metric] if t >= since]"##,
            rust: r##"use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

struct TimeSeries { data: HashMap<String, Vec<(f64, f64)>> }

impl TimeSeries {
    fn new() -> Self { Self { data: HashMap::new() } }
    fn add(&mut self, metric: &str, value: f64) {
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64();
        self.data.entry(metric.into()).or_default().push((ts, value));
    }
    fn query(&self, metric: &str, since: f64) -> Vec<(f64, f64)> {
        self.data.get(metric).map(|v| v.iter().filter(|(t, _)| *t >= since).copied().collect()).unwrap_or_default()
    }
}"##,
            confidence: 0.86,
            related: &["metrics_collector", "key_value_store"],
        },
        SeedIntent {
            name: "full_text_search",
            python: r##"from collections import defaultdict
import re

class SearchIndex:
    def __init__(self):
        self.index = defaultdict(set)
        self.docs = {}

    def add(self, doc_id: str, text: str):
        self.docs[doc_id] = text
        for word in re.findall(r'\w+', text.lower()):
            self.index[word].add(doc_id)

    def search(self, query: str):
        words = re.findall(r'\w+', query.lower())
        if not words: return []
        result = self.index.get(words[0], set())
        for w in words[1:]:
            result &= self.index.get(w, set())
        return list(result)"##,
            rust: r##"use std::collections::{HashMap, HashSet};

struct SearchIndex { index: HashMap<String, HashSet<String>>, docs: HashMap<String, String> }

impl SearchIndex {
    fn new() -> Self { Self { index: HashMap::new(), docs: HashMap::new() } }
    fn add(&mut self, id: &str, text: &str) {
        self.docs.insert(id.into(), text.into());
        for word in text.to_lowercase().split_whitespace() {
            self.index.entry(word.into()).or_default().insert(id.into());
        }
    }
    fn search(&self, query: &str) -> Vec<String> {
        let words: Vec<_> = query.to_lowercase().split_whitespace().map(String::from).collect();
        let mut result: Option<HashSet<String>> = None;
        for w in &words {
            let set = self.index.get(w).cloned().unwrap_or_default();
            result = Some(result.map(|r| &r & &set).unwrap_or(set));
        }
        result.unwrap_or_default().into_iter().collect()
    }
}"##,
            confidence: 0.87,
            related: &["database_client", "text_tokenizer"],
        },
        SeedIntent {
            name: "data_backup",
            python: r##"import shutil, datetime, os

def backup(src: str, backup_dir: str) -> str:
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = os.path.join(backup_dir, f"backup_{ts}")
    shutil.copytree(src, dst)
    return dst

def restore(backup_path: str, dst: str):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(backup_path, dst)"##,
            rust: r##"use std::fs;
use std::path::Path;

fn backup(src: &Path, backup_dir: &Path) -> std::io::Result<String> {
    fs::create_dir_all(backup_dir)?;
    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let dst = backup_dir.join(format!("backup_{ts}"));
    copy_dir_all(src, &dst)?;
    Ok(dst.to_string_lossy().into())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() { copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?; }
        else { fs::copy(entry.path(), dst.join(entry.file_name()))?; }
    }
    Ok(())
}"##,
            confidence: 0.87,
            related: &["file_reader", "file_writer"],
        },
        SeedIntent {
            name: "s3_client",
            python: r##"import boto3

s3 = boto3.client("s3")

def upload(bucket: str, key: str, data: bytes):
    s3.put_object(Bucket=bucket, Key=key, Body=data)

def download(bucket: str, key: str) -> bytes:
    resp = s3.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read()

def list_objects(bucket: str, prefix: str = ""):
    resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    return [obj["Key"] for obj in resp.get("Contents", [])]"##,
            rust: r##"use aws_sdk_s3::Client;

async fn upload(client: &Client, bucket: &str, key: &str, data: Vec<u8>) {
    client.put_object().bucket(bucket).key(key)
        .body(data.into()).send().await.unwrap();
}

async fn download(client: &Client, bucket: &str, key: &str) -> Vec<u8> {
    let resp = client.get_object().bucket(bucket).key(key).send().await.unwrap();
    resp.body.collect().await.unwrap().into_bytes().to_vec()
}"##,
            confidence: 0.87,
            related: &["file_upload", "data_backup"],
        },
        SeedIntent {
            name: "sqlite_wrapper",
            python: r##"import sqlite3

class DB:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row

    def execute(self, sql: str, params=()):
        return self.conn.execute(sql, params)

    def query(self, sql: str, params=()):
        return [dict(row) for row in self.execute(sql, params).fetchall()]

    def close(self):
        self.conn.close()"##,
            rust: r##"use rusqlite::{Connection, params};

struct DB { conn: Connection }

impl DB {
    fn open(path: &str) -> Self { Self { conn: Connection::open(path).unwrap() } }
    fn execute(&self, sql: &str, p: &[&dyn rusqlite::ToSql]) {
        self.conn.execute(sql, p).unwrap();
    }
    fn query(&self, sql: &str) -> Vec<Vec<String>> {
        let mut stmt = self.conn.prepare(sql).unwrap();
        let cols = stmt.column_count();
        stmt.query_map(params![], |row| {
            Ok((0..cols).map(|i| row.get::<_, String>(i).unwrap_or_default()).collect())
        }).unwrap().filter_map(|r| r.ok()).collect()
    }
}"##,
            confidence: 0.88,
            related: &["database_client", "sql_query"],
        },
        SeedIntent {
            name: "data_seeder",
            python: r##"import random, string

def random_name():
    return "".join(random.choices(string.ascii_lowercase, k=8))

def seed_users(db, count: int = 100):
    for _ in range(count):
        db.execute("INSERT INTO users (name, email) VALUES (?, ?)",
            (random_name(), f"{random_name()}@example.com"))"##,
            rust: r##"use rand::Rng;

fn random_name() -> String {
    let mut rng = rand::thread_rng();
    (0..8).map(|_| (b'a' + rng.gen_range(0..26)) as char).collect()
}

fn seed_users(count: usize) -> Vec<(String, String)> {
    (0..count).map(|_| {
        let name = random_name();
        let email = format!("{}@example.com", random_name());
        (name, email)
    }).collect()
}"##,
            confidence: 0.87,
            related: &["database_client", "random_generator"],
        },
        SeedIntent {
            name: "soft_delete",
            python: r##"from datetime import datetime

class SoftDeleteMixin:
    deleted_at = None

    def soft_delete(self):
        self.deleted_at = datetime.utcnow()

    def restore(self):
        self.deleted_at = None

    @classmethod
    def query_active(cls, db):
        return db.execute("SELECT * FROM {} WHERE deleted_at IS NULL".format(cls.__tablename__))"##,
            rust: r##"use chrono::{DateTime, Utc};

struct Record { id: i64, data: String, deleted_at: Option<DateTime<Utc>> }

impl Record {
    fn soft_delete(&mut self) { self.deleted_at = Some(Utc::now()); }
    fn restore(&mut self) { self.deleted_at = None; }
    fn is_active(&self) -> bool { self.deleted_at.is_none() }
}

fn query_active(records: &[Record]) -> Vec<&Record> {
    records.iter().filter(|r| r.is_active()).collect()
}"##,
            confidence: 0.87,
            related: &["database_client", "orm_model"],
        },
        SeedIntent {
            name: "audit_log",
            python: r##"import json, time

class AuditLog:
    def __init__(self, path: str):
        self.path = path

    def log(self, user: str, action: str, details: dict):
        entry = {"ts": time.time(), "user": user, "action": action, **details}
        with open(self.path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def query(self, user: str = None):
        with open(self.path) as f:
            entries = [json.loads(line) for line in f]
        if user:
            entries = [e for e in entries if e["user"] == user]
        return entries"##,
            rust: r##"use serde::{Serialize, Deserialize};
use std::fs::{OpenOptions, read_to_string};
use std::io::Write;

#[derive(Serialize, Deserialize)]
struct AuditEntry { ts: f64, user: String, action: String }

fn log_action(path: &str, user: &str, action: &str) {
    let entry = AuditEntry { ts: 0.0, user: user.into(), action: action.into() };
    let mut f = OpenOptions::new().create(true).append(true).open(path).unwrap();
    writeln!(f, "{}", serde_json::to_string(&entry).unwrap()).unwrap();
}

fn query_log(path: &str) -> Vec<AuditEntry> {
    read_to_string(path).unwrap_or_default().lines()
        .filter_map(|l| serde_json::from_str(l).ok()).collect()
}"##,
            confidence: 0.87,
            related: &["logger", "database_client"],
        },

        // ── Auth & Security (10) ────────────────────────────────

        SeedIntent {
            name: "password_hasher",
            python: r##"import bcrypt

def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())

def verify_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode(), hashed)"##,
            rust: r##"use bcrypt::{hash, verify, DEFAULT_COST};

fn hash_password(password: &str) -> String {
    hash(password, DEFAULT_COST).unwrap()
}

fn verify_password(password: &str, hashed: &str) -> bool {
    verify(password, hashed).unwrap_or(false)
}"##,
            confidence: 0.90,
            related: &["auth_handler", "hashing"],
        },
        SeedIntent {
            name: "session_manager",
            python: r##"import uuid, time

class SessionManager:
    def __init__(self, ttl: int = 3600):
        self.sessions = {}
        self.ttl = ttl

    def create(self, user_id: str) -> str:
        sid = str(uuid.uuid4())
        self.sessions[sid] = {"user": user_id, "created": time.time()}
        return sid

    def validate(self, sid: str):
        s = self.sessions.get(sid)
        if s and time.time() - s["created"] < self.ttl:
            return s["user"]
        self.destroy(sid)
        return None

    def destroy(self, sid: str):
        self.sessions.pop(sid, None)"##,
            rust: r##"use std::collections::HashMap;
use std::time::{Duration, Instant};

struct SessionManager { sessions: HashMap<String, (String, Instant)>, ttl: Duration }

impl SessionManager {
    fn new(ttl_secs: u64) -> Self { Self { sessions: HashMap::new(), ttl: Duration::from_secs(ttl_secs) } }
    fn create(&mut self, user: &str) -> String {
        let sid = format!("{:x}", rand::random::<u128>());
        self.sessions.insert(sid.clone(), (user.into(), Instant::now()));
        sid
    }
    fn validate(&self, sid: &str) -> Option<&str> {
        self.sessions.get(sid).filter(|(_, t)| t.elapsed() < self.ttl).map(|(u, _)| u.as_str())
    }
    fn destroy(&mut self, sid: &str) { self.sessions.remove(sid); }
}"##,
            confidence: 0.88,
            related: &["auth_handler", "cookie_session"],
        },
        SeedIntent {
            name: "role_based_access",
            python: r##"from functools import wraps

ROLES = {"admin": {"read", "write", "delete"}, "user": {"read"}, "editor": {"read", "write"}}

def require_permission(perm: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(user, *args, **kwargs):
            perms = ROLES.get(user.get("role", ""), set())
            if perm not in perms:
                raise PermissionError(f"Missing permission: {perm}")
            return fn(user, *args, **kwargs)
        return wrapper
    return decorator

@require_permission("write")
def edit_post(user, post_id): pass"##,
            rust: r##"use std::collections::{HashMap, HashSet};

struct Rbac { roles: HashMap<String, HashSet<String>> }

impl Rbac {
    fn new() -> Self {
        let mut roles = HashMap::new();
        roles.insert("admin".into(), ["read", "write", "delete"].iter().map(|s| s.to_string()).collect());
        roles.insert("user".into(), ["read"].iter().map(|s| s.to_string()).collect());
        Self { roles }
    }
    fn check(&self, role: &str, perm: &str) -> bool {
        self.roles.get(role).map(|p| p.contains(perm)).unwrap_or(false)
    }
}"##,
            confidence: 0.88,
            related: &["auth_handler", "middleware"],
        },
        SeedIntent {
            name: "token_refresh",
            python: r##"import jwt, time

SECRET = "crowny_secret"

def create_tokens(user_id: str):
    access = jwt.encode({"sub": user_id, "exp": time.time() + 900}, SECRET)
    refresh = jwt.encode({"sub": user_id, "exp": time.time() + 86400, "type": "refresh"}, SECRET)
    return {"access": access, "refresh": refresh}

def refresh_access(refresh_token: str):
    payload = jwt.decode(refresh_token, SECRET, algorithms=["HS256"])
    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token")
    return create_tokens(payload["sub"])"##,
            rust: r##"use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct Claims { sub: String, exp: usize, refresh: bool }

fn create_tokens(user: &str, secret: &[u8]) -> (String, String) {
    let access = Claims { sub: user.into(), exp: 900, refresh: false };
    let refresh = Claims { sub: user.into(), exp: 86400, refresh: true };
    let key = EncodingKey::from_secret(secret);
    (encode(&Header::default(), &access, &key).unwrap(),
     encode(&Header::default(), &refresh, &key).unwrap())
}"##,
            confidence: 0.87,
            related: &["jwt_handler", "auth_handler"],
        },
        SeedIntent {
            name: "csrf_protection",
            python: r##"import secrets, hmac

class CsrfProtection:
    def __init__(self):
        self.secret = secrets.token_hex(32)

    def generate_token(self, session_id: str) -> str:
        return hmac.new(self.secret.encode(), session_id.encode(), "sha256").hexdigest()

    def validate(self, session_id: str, token: str) -> bool:
        expected = self.generate_token(session_id)
        return hmac.compare_digest(token, expected)"##,
            rust: r##"use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn generate_csrf(secret: &[u8], session_id: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).unwrap();
    mac.update(session_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn validate_csrf(secret: &[u8], session_id: &str, token: &str) -> bool {
    generate_csrf(secret, session_id) == token
}"##,
            confidence: 0.87,
            related: &["auth_handler", "hmac_auth"],
        },
        SeedIntent {
            name: "input_sanitizer",
            python: r##"import html, re

def sanitize_html(text: str) -> str:
    return html.escape(text)

def strip_tags(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)

def sanitize_sql(text: str) -> str:
    return text.replace("'", "''").replace(";", "")"##,
            rust: r##"fn sanitize_html(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&#x27;")
}

fn strip_tags(text: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result
}"##,
            confidence: 0.89,
            related: &["validator", "html_parser"],
        },
        SeedIntent {
            name: "ip_whitelist",
            python: r##"from ipaddress import ip_address, ip_network

class IpWhitelist:
    def __init__(self, allowed: list[str]):
        self.networks = [ip_network(a, strict=False) for a in allowed]

    def is_allowed(self, ip: str) -> bool:
        addr = ip_address(ip)
        return any(addr in net for net in self.networks)

wl = IpWhitelist(["192.168.1.0/24", "10.0.0.0/8"])
print(wl.is_allowed("192.168.1.5"))  # True"##,
            rust: r##"use std::net::IpAddr;

struct IpWhitelist { allowed: Vec<(IpAddr, u8)> }

impl IpWhitelist {
    fn new(cidrs: &[&str]) -> Self {
        let allowed = cidrs.iter().map(|c| {
            let parts: Vec<&str> = c.split('/').collect();
            (parts[0].parse::<IpAddr>().unwrap(), parts.get(1).and_then(|p| p.parse().ok()).unwrap_or(32))
        }).collect();
        Self { allowed }
    }
    fn is_allowed(&self, ip: &str) -> bool {
        let addr: IpAddr = ip.parse().unwrap();
        self.allowed.iter().any(|(net, _)| *net == addr)
    }
}"##,
            confidence: 0.86,
            related: &["middleware", "auth_handler"],
        },
        SeedIntent {
            name: "two_factor_auth",
            python: r##"import pyotp

def setup_2fa(user: str) -> str:
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(user, issuer_name="CrownyCode")
    return secret, uri

def verify_2fa(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code)"##,
            rust: r##"use totp_rs::{Algorithm, TOTP, Secret};

fn setup_2fa() -> (String, String) {
    let secret = Secret::generate_secret().to_encoded();
    let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_bytes().unwrap()).unwrap();
    let uri = totp.get_url("user@crowny", "CrownyCode");
    (secret.to_string(), uri)
}

fn verify_2fa(secret: &str, code: &str) -> bool {
    let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.as_bytes().to_vec()).unwrap();
    totp.check_current(code).unwrap_or(false)
}"##,
            confidence: 0.86,
            related: &["auth_handler", "password_hasher"],
        },
        SeedIntent {
            name: "certificate_pinning",
            python: r##"import ssl, hashlib, urllib.request

EXPECTED_HASH = "sha256/AbCdEf..."

def pinned_request(url: str):
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(url, context=ctx) as resp:
        cert_der = resp.fp.raw._sock.getpeercert(binary_form=True)
        cert_hash = "sha256/" + hashlib.sha256(cert_der).hexdigest()
        if cert_hash != EXPECTED_HASH:
            raise ssl.SSLError("Certificate pin mismatch")
        return resp.read()"##,
            rust: r##"use reqwest::Certificate;
use std::fs;

fn pinned_client(cert_path: &str) -> reqwest::Client {
    let cert_pem = fs::read(cert_path).unwrap();
    let cert = Certificate::from_pem(&cert_pem).unwrap();
    reqwest::Client::builder()
        .add_root_certificate(cert)
        .build().unwrap()
}"##,
            confidence: 0.85,
            related: &["http_client", "encryption"],
        },
        SeedIntent {
            name: "secrets_manager",
            python: r##"import os
from pathlib import Path

def load_env(path: str = ".env"):
    if Path(path).exists():
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

def get_secret(key: str) -> str:
    val = os.environ.get(key)
    if val is None:
        raise KeyError(f"Missing secret: {key}")
    return val"##,
            rust: r##"use std::collections::HashMap;
use std::fs;

fn load_env(path: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if !line.is_empty() && !line.starts_with('#') {
                if let Some((k, v)) = line.split_once('=') {
                    map.insert(k.trim().into(), v.trim().into());
                }
            }
        }
    }
    map
}

fn get_secret(env: &HashMap<String, String>, key: &str) -> String {
    env.get(key).cloned().unwrap_or_else(|| panic!("Missing secret: {key}"))
}"##,
            confidence: 0.88,
            related: &["config_loader", "dotenv_loader"],
        },

        // ── Data Processing (15) ────────────────────────────────

        SeedIntent {
            name: "etl_pipeline",
            python: r##"def extract(source: str) -> list[dict]:
    import json
    with open(source) as f:
        return json.load(f)

def transform(data: list[dict]) -> list[dict]:
    return [{"name": d["name"].upper(), "value": d["value"] * 2} for d in data]

def load(data: list[dict], dest: str):
    import json
    with open(dest, "w") as f:
        json.dump(data, f)

def run_etl(src: str, dst: str):
    load(transform(extract(src)), dst)"##,
            rust: r##"use serde::{Serialize, Deserialize};
use std::fs;

#[derive(Serialize, Deserialize)]
struct Record { name: String, value: f64 }

fn extract(path: &str) -> Vec<Record> {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}
fn transform(data: Vec<Record>) -> Vec<Record> {
    data.into_iter().map(|r| Record { name: r.name.to_uppercase(), value: r.value * 2.0 }).collect()
}
fn load(data: &[Record], path: &str) {
    fs::write(path, serde_json::to_string(data).unwrap()).unwrap();
}
fn run_etl(src: &str, dst: &str) { load(&transform(extract(src)), dst); }"##,
            confidence: 0.88,
            related: &["data_processor", "csv_to_json"],
        },
        SeedIntent {
            name: "batch_processor",
            python: r##"from typing import Callable

def process_in_batches(items: list, batch_size: int, fn: Callable):
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        fn(batch)
        print(f"Processed batch {i // batch_size + 1}: {len(batch)} items")"##,
            rust: r##"fn process_in_batches<T, F>(items: &[T], batch_size: usize, mut f: F)
where F: FnMut(&[T]) {
    for (i, chunk) in items.chunks(batch_size).enumerate() {
        f(chunk);
        println!("Processed batch {}: {} items", i + 1, chunk.len());
    }
}"##,
            confidence: 0.89,
            related: &["data_processor", "parallel_map"],
        },
        SeedIntent {
            name: "stream_processor",
            python: r##"import asyncio
from collections.abc import AsyncIterator

async def stream_process(source: AsyncIterator, transform, sink):
    async for item in source:
        result = transform(item)
        await sink(result)

async def example():
    async def source():
        for i in range(10): yield i
    async def sink(x): print(f"output: {x}")
    await stream_process(source(), lambda x: x * 2, sink)"##,
            rust: r##"use tokio::sync::mpsc;

async fn stream_process(mut rx: mpsc::Receiver<i32>, transform: fn(i32) -> i32) {
    while let Some(item) = rx.recv().await {
        let result = transform(item);
        println!("output: {}", result);
    }
}

#[tokio::main]
async fn main() {
    let (tx, rx) = mpsc::channel(32);
    tokio::spawn(async move { for i in 0..10 { tx.send(i).await.unwrap(); } });
    stream_process(rx, |x| x * 2).await;
}"##,
            confidence: 0.87,
            related: &["data_processor", "channel_communication"],
        },
        SeedIntent {
            name: "map_reduce",
            python: r##"from collections import Counter
from concurrent.futures import ProcessPoolExecutor

def mapper(text: str) -> list[tuple[str, int]]:
    return [(w, 1) for w in text.lower().split()]

def reducer(pairs: list[tuple[str, int]]) -> dict[str, int]:
    counts = Counter()
    for word, count in pairs:
        counts[word] += count
    return dict(counts)

def map_reduce(texts: list[str]) -> dict[str, int]:
    with ProcessPoolExecutor() as ex:
        mapped = list(ex.map(mapper, texts))
    return reducer([p for pairs in mapped for p in pairs])"##,
            rust: r##"use std::collections::HashMap;

fn mapper(text: &str) -> Vec<(String, usize)> {
    text.split_whitespace().map(|w| (w.to_lowercase(), 1)).collect()
}

fn reducer(pairs: Vec<(String, usize)>) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for (word, count) in pairs { *counts.entry(word).or_insert(0) += count; }
    counts
}

fn map_reduce(texts: &[&str]) -> HashMap<String, usize> {
    let mapped: Vec<_> = texts.iter().flat_map(|t| mapper(t)).collect();
    reducer(mapped)
}"##,
            confidence: 0.88,
            related: &["data_processor", "parallel_map"],
        },
        SeedIntent {
            name: "data_validator",
            python: r##"from dataclasses import dataclass

@dataclass
class Schema:
    fields: dict  # name -> (type, required)

    def validate(self, data: dict) -> list[str]:
        errors = []
        for name, (typ, required) in self.fields.items():
            if name not in data:
                if required: errors.append(f"Missing field: {name}")
            elif not isinstance(data[name], typ):
                errors.append(f"{name}: expected {typ.__name__}")
        return errors

schema = Schema({"name": (str, True), "age": (int, True), "email": (str, False)})"##,
            rust: r##"use std::collections::HashMap;

enum FieldType { Str, Int, Float }

struct Schema { fields: HashMap<String, (FieldType, bool)> }

impl Schema {
    fn validate(&self, data: &HashMap<String, String>) -> Vec<String> {
        let mut errors = vec![];
        for (name, (_, required)) in &self.fields {
            if !data.contains_key(name) && *required {
                errors.push(format!("Missing field: {name}"));
            }
        }
        errors
    }
}"##,
            confidence: 0.88,
            related: &["validator", "json_parser"],
        },
        SeedIntent {
            name: "csv_to_json",
            python: r##"import csv, json

def csv_to_json(csv_path: str, json_path: str):
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        data = list(reader)
    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

csv_to_json("data.csv", "data.json")"##,
            rust: r##"use std::fs;

fn csv_to_json(csv_path: &str, json_path: &str) {
    let content = fs::read_to_string(csv_path).unwrap();
    let mut lines = content.lines();
    let headers: Vec<&str> = lines.next().unwrap().split(',').collect();
    let records: Vec<_> = lines.map(|line| {
        let vals: Vec<&str> = line.split(',').collect();
        headers.iter().zip(vals.iter()).map(|(h, v)| format!("\"{h}\": \"{v}\"")).collect::<Vec<_>>()
    }).collect();
    let json = format!("[{}]", records.iter().map(|r| format!("{{{}}}", r.join(", "))).collect::<Vec<_>>().join(", "));
    fs::write(json_path, json).unwrap();
}"##,
            confidence: 0.88,
            related: &["csv_parser", "json_parser"],
        },
        SeedIntent {
            name: "json_to_xml",
            python: r##"import json

def json_to_xml(data, root="root") -> str:
    def convert(obj, tag="item"):
        if isinstance(obj, dict):
            inner = "".join(f"<{k}>{convert(v, k)}</{k}>" for k, v in obj.items())
            return inner
        elif isinstance(obj, list):
            return "".join(f"<{tag}>{convert(i, tag)}</{tag}>" for i in obj)
        return str(obj)
    return f"<{root}>{convert(data)}</{root}>"

print(json_to_xml({"name": "Alice", "age": 30}))"##,
            rust: r##"use serde_json::Value;

fn json_to_xml(val: &Value, tag: &str) -> String {
    match val {
        Value::Object(map) => {
            let inner: String = map.iter().map(|(k, v)| format!("<{k}>{}</{k}>", json_to_xml(v, k))).collect();
            format!("<{tag}>{inner}</{tag}>")
        }
        Value::Array(arr) => arr.iter().map(|v| format!("<item>{}</item>", json_to_xml(v, "item"))).collect(),
        Value::String(s) => s.clone(),
        v => v.to_string(),
    }
}"##,
            confidence: 0.87,
            related: &["json_parser", "xml_parser"],
        },
        SeedIntent {
            name: "text_tokenizer",
            python: r##"import re

def tokenize(text: str) -> list[str]:
    return re.findall(r'\b\w+\b', text.lower())

def ngrams(tokens: list[str], n: int = 2) -> list[tuple]:
    return [tuple(tokens[i:i+n]) for i in range(len(tokens) - n + 1)]

text = "Hello world, this is CrownyCode!"
tokens = tokenize(text)
bigrams = ngrams(tokens, 2)"##,
            rust: r##"fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

fn ngrams(tokens: &[String], n: usize) -> Vec<Vec<&str>> {
    tokens.windows(n).map(|w| w.iter().map(|s| s.as_str()).collect()).collect()
}"##,
            confidence: 0.88,
            related: &["regex_matcher", "full_text_search"],
        },
        SeedIntent {
            name: "html_to_markdown",
            python: r##"import re

def html_to_md(html: str) -> str:
    text = html
    text = re.sub(r'<h([1-6])>(.*?)</h\1>', lambda m: '#' * int(m.group(1)) + ' ' + m.group(2), text)
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text)
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text)
    text = re.sub(r'<a href="(.*?)">(.*?)</a>', r'[\2](\1)', text)
    text = re.sub(r'<li>(.*?)</li>', r'- \1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()"##,
            rust: r##"fn html_to_md(html: &str) -> String {
    let mut text = html.to_string();
    let patterns = [
        (r"<strong>(.*?)</strong>", "**$1**"),
        (r"<em>(.*?)</em>", "*$1*"),
        (r"<li>(.*?)</li>", "- $1"),
        (r"<[^>]+>", ""),
    ];
    for (pat, rep) in patterns {
        let re = regex::Regex::new(pat).unwrap();
        text = re.replace_all(&text, rep).into();
    }
    text.trim().to_string()
}"##,
            confidence: 0.87,
            related: &["html_parser", "markdown_renderer"],
        },
        SeedIntent {
            name: "diff_calculator",
            python: r##"import difflib

def text_diff(a: str, b: str) -> str:
    a_lines = a.splitlines(keepends=True)
    b_lines = b.splitlines(keepends=True)
    diff = difflib.unified_diff(a_lines, b_lines, fromfile="a", tofile="b")
    return "".join(diff)

print(text_diff("hello\nworld\n", "hello\nrust\n"))"##,
            rust: r##"fn simple_diff(a: &str, b: &str) -> Vec<String> {
    let a_lines: Vec<&str> = a.lines().collect();
    let b_lines: Vec<&str> = b.lines().collect();
    let mut result = vec![];
    let max = a_lines.len().max(b_lines.len());
    for i in 0..max {
        match (a_lines.get(i), b_lines.get(i)) {
            (Some(a), Some(b)) if a != b => { result.push(format!("-{a}")); result.push(format!("+{b}")); }
            (Some(a), None) => result.push(format!("-{a}")),
            (None, Some(b)) => result.push(format!("+{b}")),
            _ => {}
        }
    }
    result
}"##,
            confidence: 0.87,
            related: &["data_processor", "text_tokenizer"],
        },
        SeedIntent {
            name: "deduplicator",
            python: r##"from typing import Callable

def deduplicate(items: list, key: Callable = None) -> list:
    seen = set()
    result = []
    for item in items:
        k = key(item) if key else item
        if k not in seen:
            seen.add(k)
            result.append(item)
    return result

data = [{"id": 1, "name": "a"}, {"id": 1, "name": "b"}, {"id": 2, "name": "c"}]
print(deduplicate(data, key=lambda x: x["id"]))"##,
            rust: r##"use std::collections::HashSet;

fn deduplicate<T: Clone, K: std::hash::Hash + Eq>(items: &[T], key: fn(&T) -> K) -> Vec<T> {
    let mut seen = HashSet::new();
    items.iter().filter(|item| seen.insert(key(item))).cloned().collect()
}

fn deduplicate_vec<T: std::hash::Hash + Eq + Clone>(items: Vec<T>) -> Vec<T> {
    let mut seen = HashSet::new();
    items.into_iter().filter(|item| seen.insert(item.clone())).collect()
}"##,
            confidence: 0.88,
            related: &["data_processor", "bloom_filter"],
        },
        SeedIntent {
            name: "aggregator",
            python: r##"from collections import defaultdict

def group_by(items: list[dict], key: str) -> dict:
    groups = defaultdict(list)
    for item in items:
        groups[item[key]].append(item)
    return dict(groups)

def aggregate(items: list[dict], key: str, value: str):
    groups = group_by(items, key)
    return {k: {"count": len(v), "sum": sum(i[value] for i in v),
                "avg": sum(i[value] for i in v) / len(v)} for k, v in groups.items()}"##,
            rust: r##"use std::collections::HashMap;

fn group_by<'a>(items: &'a [(String, f64)], key: fn(&(String, f64)) -> &str) -> HashMap<&'a str, Vec<f64>> {
    let mut groups: HashMap<&str, Vec<f64>> = HashMap::new();
    for item in items {
        groups.entry(key(item)).or_default().push(item.1);
    }
    groups
}

fn aggregate(groups: &HashMap<&str, Vec<f64>>) -> HashMap<&str, (usize, f64, f64)> {
    groups.iter().map(|(k, v)| {
        let sum: f64 = v.iter().sum();
        (*k, (v.len(), sum, sum / v.len() as f64))
    }).collect()
}"##,
            confidence: 0.87,
            related: &["data_processor", "map_reduce"],
        },
        SeedIntent {
            name: "data_sampler",
            python: r##"import random

def reservoir_sample(stream, k: int) -> list:
    reservoir = []
    for i, item in enumerate(stream):
        if i < k:
            reservoir.append(item)
        else:
            j = random.randint(0, i)
            if j < k:
                reservoir[j] = item
    return reservoir

print(reservoir_sample(range(1000), 10))"##,
            rust: r##"use rand::Rng;

fn reservoir_sample<T: Clone>(stream: &[T], k: usize) -> Vec<T> {
    let mut rng = rand::thread_rng();
    let mut reservoir: Vec<T> = stream[..k.min(stream.len())].to_vec();
    for i in k..stream.len() {
        let j = rng.gen_range(0..=i);
        if j < k { reservoir[j] = stream[i].clone(); }
    }
    reservoir
}"##,
            confidence: 0.87,
            related: &["data_processor", "random_generator"],
        },
        SeedIntent {
            name: "time_window",
            python: r##"from collections import defaultdict
import time

class SlidingWindow:
    def __init__(self, window_secs: int):
        self.window = window_secs
        self.events = []

    def add(self, value: float):
        self.events.append((time.time(), value))
        self._prune()

    def _prune(self):
        cutoff = time.time() - self.window
        self.events = [(t, v) for t, v in self.events if t >= cutoff]

    def average(self) -> float:
        self._prune()
        if not self.events: return 0.0
        return sum(v for _, v in self.events) / len(self.events)"##,
            rust: r##"use std::time::{Duration, Instant};

struct SlidingWindow { window: Duration, events: Vec<(Instant, f64)> }

impl SlidingWindow {
    fn new(secs: u64) -> Self { Self { window: Duration::from_secs(secs), events: vec![] } }
    fn add(&mut self, value: f64) {
        self.events.push((Instant::now(), value));
        self.prune();
    }
    fn prune(&mut self) {
        let cutoff = Instant::now() - self.window;
        self.events.retain(|(t, _)| *t >= cutoff);
    }
    fn average(&mut self) -> f64 {
        self.prune();
        if self.events.is_empty() { return 0.0; }
        self.events.iter().map(|(_, v)| v).sum::<f64>() / self.events.len() as f64
    }
}"##,
            confidence: 0.87,
            related: &["metrics_collector", "time_series_db"],
        },
        SeedIntent {
            name: "bloom_filter",
            python: r##"import hashlib

class BloomFilter:
    def __init__(self, size: int = 1000, hashes: int = 3):
        self.bits = [False] * size
        self.size = size
        self.hashes = hashes

    def _hash(self, item: str, seed: int) -> int:
        h = hashlib.sha256(f"{seed}:{item}".encode()).hexdigest()
        return int(h, 16) % self.size

    def add(self, item: str):
        for i in range(self.hashes):
            self.bits[self._hash(item, i)] = True

    def might_contain(self, item: str) -> bool:
        return all(self.bits[self._hash(item, i)] for i in range(self.hashes))"##,
            rust: r##"use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

struct BloomFilter { bits: Vec<bool>, num_hashes: usize }

impl BloomFilter {
    fn new(size: usize, hashes: usize) -> Self { Self { bits: vec![false; size], num_hashes: hashes } }
    fn hash(&self, item: &str, seed: usize) -> usize {
        let mut h = DefaultHasher::new();
        seed.hash(&mut h); item.hash(&mut h);
        (h.finish() as usize) % self.bits.len()
    }
    fn add(&mut self, item: &str) {
        for i in 0..self.num_hashes { let idx = self.hash(item, i); self.bits[idx] = true; }
    }
    fn might_contain(&self, item: &str) -> bool {
        (0..self.num_hashes).all(|i| self.bits[self.hash(item, i)])
    }
}"##,
            confidence: 0.88,
            related: &["deduplicator", "hashing"],
        },

        // ── Testing & Quality (10) ──────────────────────────────

        SeedIntent {
            name: "mock_server",
            python: r##"from http.server import HTTPServer, BaseHTTPRequestHandler
import json

RESPONSES = {}

class MockHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        resp = RESPONSES.get(self.path, {"status": 404, "body": "Not Found"})
        self.send_response(resp.get("status", 200))
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(resp.get("body", "")).encode())

def start_mock(port=9999, routes=None):
    global RESPONSES
    RESPONSES = routes or {}
    HTTPServer(("localhost", port), MockHandler).serve_forever()"##,
            rust: r##"use axum::{routing::get, Json, Router};
use serde_json::Value;

async fn mock_users() -> Json<Value> {
    Json(serde_json::json!([{"id": 1, "name": "Alice"}]))
}

fn mock_app() -> Router {
    Router::new().route("/api/users", get(mock_users))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn test_mock() { let _app = mock_app(); }
}"##,
            confidence: 0.87,
            related: &["http_server", "unit_test"],
        },
        SeedIntent {
            name: "test_fixture",
            python: r##"import pytest

@pytest.fixture
def db():
    conn = create_test_db()
    conn.execute("CREATE TABLE users (id INTEGER, name TEXT)")
    conn.execute("INSERT INTO users VALUES (1, 'Alice')")
    yield conn
    conn.close()

def create_test_db():
    import sqlite3
    return sqlite3.connect(":memory:")

def test_user_count(db):
    count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    assert count == 1"##,
            rust: r##"struct TestFixture { data: Vec<String> }

impl TestFixture {
    fn setup() -> Self { Self { data: vec!["Alice".into(), "Bob".into()] } }
    fn teardown(self) { /* cleanup */ }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_with_fixture() {
        let fixture = TestFixture::setup();
        assert_eq!(fixture.data.len(), 2);
        fixture.teardown();
    }
}"##,
            confidence: 0.88,
            related: &["unit_test", "integration_test"],
        },
        SeedIntent {
            name: "property_test",
            python: r##"from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_preserves_length(xs):
    assert len(sorted(xs)) == len(xs)

@given(st.lists(st.integers()))
def test_sort_idempotent(xs):
    assert sorted(xs) == sorted(sorted(xs))

@given(st.text(), st.text())
def test_concat_length(a, b):
    assert len(a + b) == len(a) + len(b)"##,
            rust: r##"#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn sort_preserves_length(ref v in proptest::collection::vec(any::<i32>(), 0..100)) {
            let mut sorted = v.clone();
            sorted.sort();
            prop_assert_eq!(sorted.len(), v.len());
        }
        #[test]
        fn concat_length(ref a in ".*", ref b in ".*") {
            prop_assert_eq!(format!("{a}{b}").len(), a.len() + b.len());
        }
    }
}"##,
            confidence: 0.87,
            related: &["unit_test", "test_fixture"],
        },
        SeedIntent {
            name: "benchmark",
            python: r##"import time

def benchmark(fn, *args, iterations=1000):
    start = time.perf_counter()
    for _ in range(iterations):
        fn(*args)
    elapsed = time.perf_counter() - start
    avg_ms = (elapsed / iterations) * 1000
    print(f"{fn.__name__}: {avg_ms:.3f}ms avg ({iterations} iterations)")
    return avg_ms

benchmark(sorted, list(range(1000)))"##,
            rust: r##"use std::time::Instant;

fn benchmark<F: Fn()>(name: &str, iterations: u32, f: F) {
    let start = Instant::now();
    for _ in 0..iterations { f(); }
    let elapsed = start.elapsed();
    let avg = elapsed / iterations;
    println!("{name}: {avg:?} avg ({iterations} iterations)");
}

fn main() {
    benchmark("sort_1000", 1000, || {
        let mut v: Vec<i32> = (0..1000).rev().collect();
        v.sort();
    });
}"##,
            confidence: 0.89,
            related: &["unit_test", "metrics_collector"],
        },
        SeedIntent {
            name: "coverage_report",
            python: r##"import coverage

def run_with_coverage(test_module: str):
    cov = coverage.Coverage()
    cov.start()
    __import__(test_module)
    cov.stop()
    cov.save()
    cov.report(show_missing=True)
    cov.html_report(directory="htmlcov")
    print("Coverage report: htmlcov/index.html")"##,
            rust: r##"// Run with: cargo tarpaulin --out Html
// Or: cargo llvm-cov --html

fn add(a: i32, b: i32) -> i32 { a + b }
fn multiply(a: i32, b: i32) -> i32 { a * b }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_add() { assert_eq!(add(2, 3), 5); }
    #[test]
    fn test_multiply() { assert_eq!(multiply(3, 4), 12); }
}"##,
            confidence: 0.86,
            related: &["unit_test", "benchmark"],
        },
        SeedIntent {
            name: "test_reporter",
            python: r##"import json, time

class TestReporter:
    def __init__(self):
        self.results = []

    def record(self, name: str, passed: bool, duration_ms: float, error: str = None):
        self.results.append({"name": name, "passed": passed, "ms": duration_ms, "error": error})

    def summary(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        return {"total": total, "passed": passed, "failed": total - passed}

    def to_json(self) -> str:
        return json.dumps({"summary": self.summary(), "tests": self.results}, indent=2)"##,
            rust: r##"use serde::Serialize;

#[derive(Serialize)]
struct TestResult { name: String, passed: bool, ms: f64 }

struct TestReporter { results: Vec<TestResult> }

impl TestReporter {
    fn new() -> Self { Self { results: vec![] } }
    fn record(&mut self, name: &str, passed: bool, ms: f64) {
        self.results.push(TestResult { name: name.into(), passed, ms });
    }
    fn summary(&self) -> (usize, usize) {
        let passed = self.results.iter().filter(|r| r.passed).count();
        (self.results.len(), passed)
    }
}"##,
            confidence: 0.86,
            related: &["unit_test", "logger"],
        },
        SeedIntent {
            name: "snapshot_test",
            python: r##"import json, os

SNAP_DIR = "__snapshots__"

def assert_snapshot(name: str, value):
    os.makedirs(SNAP_DIR, exist_ok=True)
    path = os.path.join(SNAP_DIR, f"{name}.json")
    current = json.dumps(value, indent=2, sort_keys=True)
    if os.path.exists(path):
        expected = open(path).read()
        assert current == expected, f"Snapshot mismatch for {name}"
    else:
        with open(path, "w") as f:
            f.write(current)
        print(f"Snapshot created: {name}")"##,
            rust: r##"use std::fs;
use std::path::Path;

fn assert_snapshot(name: &str, value: &str) {
    let dir = Path::new("__snapshots__");
    fs::create_dir_all(dir).unwrap();
    let path = dir.join(format!("{name}.snap"));
    if path.exists() {
        let expected = fs::read_to_string(&path).unwrap();
        assert_eq!(value, expected, "Snapshot mismatch: {name}");
    } else {
        fs::write(&path, value).unwrap();
        println!("Snapshot created: {name}");
    }
}"##,
            confidence: 0.87,
            related: &["unit_test", "test_fixture"],
        },
        SeedIntent {
            name: "integration_suite",
            python: r##"import unittest

class IntegrationSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = start_test_server()
        cls.client = create_test_client()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_health(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)

    def test_crud(self):
        resp = self.client.post("/items", json={"name": "test"})
        self.assertEqual(resp.status_code, 201)

def start_test_server(): pass
def create_test_client(): pass"##,
            rust: r##"#[cfg(test)]
mod integration {
    use axum::Router;
    use axum::body::Body;
    use http::Request;
    use tower::ServiceExt;

    fn app() -> Router { Router::new() }

    #[tokio::test]
    async fn test_health() {
        let req = Request::builder().uri("/health").body(Body::empty()).unwrap();
        let resp = app().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), 200);
    }
}"##,
            confidence: 0.86,
            related: &["integration_test", "mock_server"],
        },
        SeedIntent {
            name: "load_tester",
            python: r##"import asyncio, time, httpx

async def load_test(url: str, total: int = 1000, concurrency: int = 50):
    sem = asyncio.Semaphore(concurrency)
    results = []
    async def req():
        async with sem:
            start = time.time()
            async with httpx.AsyncClient() as c:
                r = await c.get(url)
            results.append((r.status_code, time.time() - start))
    await asyncio.gather(*(req() for _ in range(total)))
    ok = sum(1 for s, _ in results if s == 200)
    avg = sum(d for _, d in results) / len(results) * 1000
    print(f"{ok}/{total} OK, avg {avg:.1f}ms")"##,
            rust: r##"use std::time::Instant;

async fn load_test(url: &str, total: usize, concurrency: usize) {
    let client = reqwest::Client::new();
    let sem = tokio::sync::Semaphore::new(concurrency);
    let mut handles = vec![];
    for _ in 0..total {
        let permit = sem.clone().acquire_owned().await.unwrap();
        let client = client.clone();
        let url = url.to_string();
        handles.push(tokio::spawn(async move {
            let start = Instant::now();
            let resp = client.get(&url).send().await;
            drop(permit);
            (resp.is_ok(), start.elapsed())
        }));
    }
    println!("Load test: {} requests", total);
}"##,
            confidence: 0.86,
            related: &["http_client", "benchmark"],
        },
        SeedIntent {
            name: "chaos_tester",
            python: r##"import random, functools

def chaos(failure_rate: float = 0.1):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if random.random() < failure_rate:
                raise RuntimeError(f"Chaos: random failure in {fn.__name__}")
            return fn(*args, **kwargs)
        return wrapper
    return decorator

@chaos(0.2)
def process_order(order_id: int):
    return f"Processed {order_id}""##,
            rust: r##"use rand::Rng;

struct ChaosWrapper { failure_rate: f64 }

impl ChaosWrapper {
    fn new(rate: f64) -> Self { Self { failure_rate: rate } }
    fn call<F, T>(&self, f: F) -> Result<T, String>
    where F: FnOnce() -> T {
        if rand::thread_rng().gen::<f64>() < self.failure_rate {
            Err("Chaos: random failure".into())
        } else {
            Ok(f())
        }
    }
}"##,
            confidence: 0.86,
            related: &["unit_test", "retry_with_backoff"],
        },

        // ── CLI & DevTools (10) ─────────────────────────────────

        SeedIntent {
            name: "progress_bar",
            python: r##"import sys, time

def progress_bar(current: int, total: int, width: int = 40):
    pct = current / total
    filled = int(width * pct)
    bar = '█' * filled + '░' * (width - filled)
    sys.stdout.write(f'\r[{bar}] {pct:.0%} ({current}/{total})')
    sys.stdout.flush()

for i in range(101):
    progress_bar(i, 100)
    time.sleep(0.02)
print()"##,
            rust: r##"use std::io::{self, Write};

fn progress_bar(current: usize, total: usize, width: usize) {
    let pct = current as f64 / total as f64;
    let filled = (width as f64 * pct) as usize;
    let bar: String = "█".repeat(filled) + &"░".repeat(width - filled);
    print!("\r[{bar}] {:.0}% ({current}/{total})", pct * 100.0);
    io::stdout().flush().unwrap();
}

fn main() {
    for i in 0..=100 { progress_bar(i, 100, 40); std::thread::sleep(std::time::Duration::from_millis(20)); }
    println!();
}"##,
            confidence: 0.89,
            related: &["cli_tool", "color_output"],
        },
        SeedIntent {
            name: "table_formatter",
            python: r##"def format_table(headers: list[str], rows: list[list[str]]) -> str:
    widths = [max(len(h), max((len(str(r[i])) for r in rows), default=0)) for i, h in enumerate(headers)]
    sep = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    hdr = "| " + " | ".join(h.ljust(w) for h, w in zip(headers, widths)) + " |"
    lines = [sep, hdr, sep]
    for row in rows:
        lines.append("| " + " | ".join(str(v).ljust(w) for v, w in zip(row, widths)) + " |")
    lines.append(sep)
    return "\n".join(lines)"##,
            rust: r##"fn format_table(headers: &[&str], rows: &[Vec<String>]) -> String {
    let widths: Vec<usize> = headers.iter().enumerate()
        .map(|(i, h)| rows.iter().map(|r| r[i].len()).max().unwrap_or(0).max(h.len()))
        .collect();
    let sep = format!("+-{}-+", widths.iter().map(|w| "-".repeat(*w)).collect::<Vec<_>>().join("-+-"));
    let hdr = format!("| {} |", headers.iter().zip(&widths).map(|(h, w)| format!("{:w$}", h, w = w)).collect::<Vec<_>>().join(" | "));
    let mut lines = vec![sep.clone(), hdr, sep.clone()];
    for row in rows {
        lines.push(format!("| {} |", row.iter().zip(&widths).map(|(v, w)| format!("{:w$}", v, w = w)).collect::<Vec<_>>().join(" | ")));
    }
    lines.push(sep);
    lines.join("\n")
}"##,
            confidence: 0.88,
            related: &["cli_tool", "color_output"],
        },
        SeedIntent {
            name: "color_output",
            python: r##"class Color:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

    @staticmethod
    def red(s): return f"{Color.RED}{s}{Color.RESET}"
    @staticmethod
    def green(s): return f"{Color.GREEN}{s}{Color.RESET}"
    @staticmethod
    def yellow(s): return f"{Color.YELLOW}{s}{Color.RESET}"
    @staticmethod
    def bold(s): return f"{Color.BOLD}{s}{Color.RESET}"

print(Color.green("OK"), Color.red("FAIL"), Color.bold("DONE"))"##,
            rust: r##"fn red(s: &str) -> String { format!("\x1b[91m{s}\x1b[0m") }
fn green(s: &str) -> String { format!("\x1b[92m{s}\x1b[0m") }
fn yellow(s: &str) -> String { format!("\x1b[93m{s}\x1b[0m") }
fn bold(s: &str) -> String { format!("\x1b[1m{s}\x1b[0m") }

fn main() {
    println!("{} {} {}", green("OK"), red("FAIL"), bold("DONE"));
}"##,
            confidence: 0.90,
            related: &["cli_tool", "progress_bar"],
        },
        SeedIntent {
            name: "interactive_prompt",
            python: r##"def prompt(message: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    result = input(f"{message}{suffix}: ").strip()
    return result or default

def confirm(message: str, default: bool = False) -> bool:
    yn = " [Y/n]" if default else " [y/N]"
    result = input(f"{message}{yn}: ").strip().lower()
    if not result: return default
    return result in ("y", "yes")

name = prompt("Your name", "World")
if confirm("Continue?", True):
    print(f"Hello, {name}!")"##,
            rust: r##"use std::io::{self, Write, BufRead};

fn prompt(message: &str, default: &str) -> String {
    print!("{message} [{default}]: ");
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().lock().read_line(&mut input).unwrap();
    let input = input.trim();
    if input.is_empty() { default.to_string() } else { input.to_string() }
}

fn confirm(message: &str, default: bool) -> bool {
    let yn = if default { "[Y/n]" } else { "[y/N]" };
    let answer = prompt(&format!("{message} {yn}"), if default { "y" } else { "n" });
    matches!(answer.to_lowercase().as_str(), "y" | "yes")
}"##,
            confidence: 0.88,
            related: &["cli_tool", "argument_parser"],
        },
        SeedIntent {
            name: "file_watcher",
            python: r##"from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class Handler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory:
            print(f"Modified: {event.src_path}")

    def on_created(self, event):
        print(f"Created: {event.src_path}")

observer = Observer()
observer.schedule(Handler(), path=".", recursive=True)
observer.start()"##,
            rust: r##"use notify::{Watcher, RecursiveMode, watcher};
use std::sync::mpsc;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();
    let mut watcher = watcher(tx, Duration::from_secs(1)).unwrap();
    watcher.watch(".", RecursiveMode::Recursive).unwrap();
    loop {
        match rx.recv() {
            Ok(event) => println!("Change: {:?}", event),
            Err(e) => println!("Error: {:?}", e),
        }
    }
}"##,
            confidence: 0.87,
            related: &["hot_reloader", "file_reader"],
        },
        SeedIntent {
            name: "hot_reloader",
            python: r##"import importlib, time, os

def watch_and_reload(module_name: str, interval: float = 1.0):
    mod = importlib.import_module(module_name)
    last_mtime = os.path.getmtime(mod.__file__)
    while True:
        time.sleep(interval)
        mtime = os.path.getmtime(mod.__file__)
        if mtime != last_mtime:
            print(f"Reloading {module_name}...")
            importlib.reload(mod)
            last_mtime = mtime"##,
            rust: r##"use notify::{Watcher, RecursiveMode, watcher};
use std::sync::mpsc;
use std::time::Duration;
use std::process::Command;

fn hot_reload(watch_path: &str, command: &str) {
    let (tx, rx) = mpsc::channel();
    let mut w = watcher(tx, Duration::from_secs(1)).unwrap();
    w.watch(watch_path, RecursiveMode::Recursive).unwrap();
    loop {
        if rx.recv().is_ok() {
            println!("Change detected, rebuilding...");
            Command::new("sh").arg("-c").arg(command).status().ok();
        }
    }
}"##,
            confidence: 0.86,
            related: &["file_watcher", "command_runner"],
        },
        SeedIntent {
            name: "dotenv_loader",
            python: r##"from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///default.db")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

print(f"DB: {DATABASE_URL}, Debug: {DEBUG}")"##,
            rust: r##"use std::collections::HashMap;
use std::fs;

fn load_dotenv(path: &str) -> HashMap<String, String> {
    let mut env = HashMap::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            if let Some((key, val)) = line.split_once('=') {
                let val = val.trim().trim_matches('"');
                env.insert(key.trim().into(), val.into());
                std::env::set_var(key.trim(), val);
            }
        }
    }
    env
}"##,
            confidence: 0.88,
            related: &["config_loader", "secrets_manager"],
        },
        SeedIntent {
            name: "command_runner",
            python: r##"import subprocess

def run(cmd: str, capture: bool = True) -> tuple[int, str, str]:
    result = subprocess.run(cmd, shell=True, capture_output=capture, text=True)
    return result.returncode, result.stdout, result.stderr

def run_or_fail(cmd: str) -> str:
    code, stdout, stderr = run(cmd)
    if code != 0:
        raise RuntimeError(f"Command failed: {cmd}\n{stderr}")
    return stdout"##,
            rust: r##"use std::process::Command;

fn run(cmd: &str) -> Result<String, String> {
    let output = Command::new("sh").arg("-c").arg(cmd).output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into())
    }
}"##,
            confidence: 0.89,
            related: &["cli_tool", "process_manager"],
        },
        SeedIntent {
            name: "project_scaffolder",
            python: r##"import os

def scaffold(name: str, template: str = "basic"):
    dirs = [f"{name}/src", f"{name}/tests", f"{name}/docs"]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    files = {
        f"{name}/src/main.py": "def main():\n    print('Hello!')\n\nif __name__ == '__main__':\n    main()",
        f"{name}/tests/__init__.py": "",
        f"{name}/README.md": f"# {name}\n",
    }
    for path, content in files.items():
        with open(path, "w") as f:
            f.write(content)
    print(f"Scaffolded project: {name}")"##,
            rust: r##"use std::fs;
use std::path::Path;

fn scaffold(name: &str) {
    let dirs = ["src", "tests", "docs"];
    for dir in dirs { fs::create_dir_all(Path::new(name).join(dir)).unwrap(); }
    fs::write(
        Path::new(name).join("src/main.rs"),
        "fn main() {\n    println!(\"Hello!\");\n}\n"
    ).unwrap();
    fs::write(Path::new(name).join("Cargo.toml"),
        format!("[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n")
    ).unwrap();
    println!("Scaffolded project: {name}");
}"##,
            confidence: 0.87,
            related: &["cli_tool", "file_writer"],
        },
        SeedIntent {
            name: "changelog_generator",
            python: r##"import subprocess, re

def generate_changelog(since_tag: str = "") -> str:
    cmd = "git log --oneline"
    if since_tag:
        cmd += f" {since_tag}..HEAD"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    lines = result.stdout.strip().split("\n")
    sections = {"feat": [], "fix": [], "other": []}
    for line in lines:
        if "feat" in line.lower(): sections["feat"].append(line)
        elif "fix" in line.lower(): sections["fix"].append(line)
        else: sections["other"].append(line)
    return sections"##,
            rust: r##"use std::process::Command;

fn generate_changelog(since_tag: &str) -> String {
    let args = if since_tag.is_empty() {
        vec!["log", "--oneline"]
    } else {
        vec!["log", "--oneline", &format!("{since_tag}..HEAD")]
    };
    let output = Command::new("git").args(&args).output().unwrap();
    let log = String::from_utf8_lossy(&output.stdout);
    let mut changelog = String::from("# Changelog\n\n");
    for line in log.lines() {
        if line.contains("feat") { changelog += &format!("- [NEW] {line}\n"); }
        else if line.contains("fix") { changelog += &format!("- [FIX] {line}\n"); }
    }
    changelog
}"##,
            confidence: 0.86,
            related: &["cli_tool", "command_runner"],
        },

        // ── Networking & Protocols (10) ─────────────────────────

        SeedIntent {
            name: "tcp_client",
            python: r##"import socket

def tcp_request(host: str, port: int, message: str) -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((host, port))
        s.sendall(message.encode())
        return s.recv(4096).decode()

response = tcp_request("localhost", 8080, "Hello")"##,
            rust: r##"use std::io::{Read, Write};
use std::net::TcpStream;

fn tcp_request(addr: &str, message: &str) -> String {
    let mut stream = TcpStream::connect(addr).unwrap();
    stream.write_all(message.as_bytes()).unwrap();
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).unwrap();
    String::from_utf8_lossy(&buf[..n]).into()
}"##,
            confidence: 0.89,
            related: &["tcp_server", "http_client"],
        },
        SeedIntent {
            name: "udp_server",
            python: r##"import socket

def udp_echo_server(host: str = "0.0.0.0", port: int = 9999):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((host, port))
    print(f"UDP server on {host}:{port}")
    while True:
        data, addr = sock.recvfrom(1024)
        print(f"From {addr}: {data.decode()}")
        sock.sendto(data, addr)"##,
            rust: r##"use std::net::UdpSocket;

fn udp_echo_server(addr: &str) {
    let socket = UdpSocket::bind(addr).unwrap();
    println!("UDP server on {addr}");
    let mut buf = [0u8; 1024];
    loop {
        let (n, src) = socket.recv_from(&mut buf).unwrap();
        println!("From {src}: {}", String::from_utf8_lossy(&buf[..n]));
        socket.send_to(&buf[..n], src).unwrap();
    }
}"##,
            confidence: 0.88,
            related: &["tcp_server", "tcp_client"],
        },
        SeedIntent {
            name: "dns_resolver",
            python: r##"import socket

def resolve(hostname: str) -> list[str]:
    results = socket.getaddrinfo(hostname, None)
    ips = list(set(r[4][0] for r in results))
    return ips

def reverse_lookup(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except socket.herror:
        return "Unknown"

print(resolve("example.com"))"##,
            rust: r##"use std::net::ToSocketAddrs;

fn resolve(hostname: &str) -> Vec<String> {
    format!("{hostname}:0").to_socket_addrs()
        .map(|addrs| addrs.map(|a| a.ip().to_string()).collect())
        .unwrap_or_default()
}

fn main() {
    for ip in resolve("example.com") { println!("{ip}"); }
}"##,
            confidence: 0.88,
            related: &["tcp_client", "http_client"],
        },
        SeedIntent {
            name: "smtp_client",
            python: r##"import smtplib
from email.mime.text import MIMEText

def send_email(to: str, subject: str, body: str, smtp_host="localhost", smtp_port=587):
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = "noreply@crowny.com"
    msg["To"] = to
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login("user", "pass")
        server.send_message(msg)"##,
            rust: r##"use lettre::{Message, SmtpTransport, Transport};
use lettre::message::header::ContentType;

fn send_email(to: &str, subject: &str, body: &str) {
    let email = Message::builder()
        .from("noreply@crowny.com".parse().unwrap())
        .to(to.parse().unwrap())
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string()).unwrap();
    let mailer = SmtpTransport::builder_dangerous("localhost").build();
    mailer.send(&email).unwrap();
}"##,
            confidence: 0.87,
            related: &["email_sender", "http_client"],
        },
        SeedIntent {
            name: "ftp_client",
            python: r##"from ftplib import FTP

def ftp_upload(host: str, user: str, passwd: str, local: str, remote: str):
    with FTP(host) as ftp:
        ftp.login(user, passwd)
        with open(local, "rb") as f:
            ftp.storbinary(f"STOR {remote}", f)

def ftp_download(host: str, user: str, passwd: str, remote: str, local: str):
    with FTP(host) as ftp:
        ftp.login(user, passwd)
        with open(local, "wb") as f:
            ftp.retrbinary(f"RETR {remote}", f.write)"##,
            rust: r##"use std::io::{Read, Write};
use std::net::TcpStream;

fn ftp_connect(host: &str) -> TcpStream {
    let mut stream = TcpStream::connect(format!("{host}:21")).unwrap();
    let mut buf = [0u8; 1024];
    stream.read(&mut buf).unwrap(); // read banner
    stream.write_all(b"USER anonymous\r\n").unwrap();
    stream.read(&mut buf).unwrap();
    stream
}"##,
            confidence: 0.85,
            related: &["tcp_client", "file_upload"],
        },
        SeedIntent {
            name: "mqtt_client",
            python: r##"import paho.mqtt.client as mqtt

def on_message(client, userdata, msg):
    print(f"{msg.topic}: {msg.payload.decode()}")

client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883)
client.subscribe("sensors/#")

def publish(topic: str, message: str):
    client.publish(topic, message)

client.loop_start()"##,
            rust: r##"use rumqttc::{MqttOptions, Client, QoS};
use std::time::Duration;

fn mqtt_client() {
    let mut opts = MqttOptions::new("crowny", "localhost", 1883);
    opts.set_keep_alive(Duration::from_secs(5));
    let (mut client, mut conn) = Client::new(opts, 10);
    client.subscribe("sensors/#", QoS::AtMostOnce).unwrap();
    for notification in conn.iter() {
        println!("{:?}", notification);
    }
}"##,
            confidence: 0.86,
            related: &["tcp_client", "pub_sub_system"],
        },
        SeedIntent {
            name: "ssh_client",
            python: r##"import paramiko

def ssh_exec(host: str, user: str, key_path: str, command: str) -> str:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, key_filename=key_path)
    stdin, stdout, stderr = client.exec_command(command)
    output = stdout.read().decode()
    client.close()
    return output"##,
            rust: r##"use std::process::Command;

fn ssh_exec(host: &str, user: &str, command: &str) -> String {
    let output = Command::new("ssh")
        .arg(format!("{user}@{host}"))
        .arg(command)
        .output().unwrap();
    String::from_utf8_lossy(&output.stdout).into()
}"##,
            confidence: 0.86,
            related: &["command_runner", "tcp_client"],
        },
        SeedIntent {
            name: "http_client",
            python: r##"import httpx

async def get(url: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()

async def post(url: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=data)
        return resp.json()"##,
            rust: r##"use reqwest;

async fn get(url: &str) -> Result<String, reqwest::Error> {
    let body = reqwest::get(url).await?.text().await?;
    Ok(body)
}

async fn post(url: &str, json: &serde_json::Value) -> Result<String, reqwest::Error> {
    let client = reqwest::Client::new();
    let body = client.post(url).json(json).send().await?.text().await?;
    Ok(body)
}"##,
            confidence: 0.89,
            related: &["rest_api", "tcp_client"],
        },
        SeedIntent {
            name: "ping_checker",
            python: r##"import subprocess, platform

def ping(host: str, count: int = 4) -> dict:
    param = "-n" if platform.system().lower() == "windows" else "-c"
    result = subprocess.run(["ping", param, str(count), host],
        capture_output=True, text=True, timeout=10)
    return {"success": result.returncode == 0, "output": result.stdout}

print(ping("8.8.8.8", 2))"##,
            rust: r##"use std::process::Command;
use std::time::Duration;

fn ping(host: &str, count: u32) -> bool {
    Command::new("ping")
        .args(["-c", &count.to_string(), host])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}"##,
            confidence: 0.88,
            related: &["command_runner", "dns_resolver"],
        },
        SeedIntent {
            name: "port_scanner",
            python: r##"import socket
from concurrent.futures import ThreadPoolExecutor

def scan_port(host: str, port: int, timeout: float = 1.0) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0

def scan_ports(host: str, ports: range) -> list[int]:
    with ThreadPoolExecutor(max_workers=100) as ex:
        results = ex.map(lambda p: (p, scan_port(host, p)), ports)
    return [p for p, open in results if open]

print(scan_ports("localhost", range(1, 1025)))"##,
            rust: r##"use std::net::TcpStream;
use std::time::Duration;

fn scan_port(host: &str, port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("{host}:{port}").parse().unwrap(),
        Duration::from_secs(1)
    ).is_ok()
}

fn scan_ports(host: &str, range: std::ops::Range<u16>) -> Vec<u16> {
    range.filter(|&p| scan_port(host, p)).collect()
}"##,
            confidence: 0.87,
            related: &["tcp_client", "dns_resolver"],
        },

        // ── Concurrency & Scheduling (10) ───────────────────────

        SeedIntent {
            name: "thread_pool",
            python: r##"from concurrent.futures import ThreadPoolExecutor

def parallel_process(items: list, fn, max_workers: int = 4) -> list:
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(fn, items))
    return results

results = parallel_process(range(20), lambda x: x * x, max_workers=4)
print(results)"##,
            rust: r##"use std::sync::{mpsc, Arc, Mutex};
use std::thread;

struct ThreadPool { workers: Vec<thread::JoinHandle<()>>, tx: mpsc::Sender<Box<dyn FnOnce() + Send>> }

impl ThreadPool {
    fn new(size: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Box<dyn FnOnce() + Send>>();
        let rx = Arc::new(Mutex::new(rx));
        let workers = (0..size).map(|_| {
            let rx = Arc::clone(&rx);
            thread::spawn(move || { while let Ok(job) = rx.lock().unwrap().recv() { job(); } })
        }).collect();
        Self { workers, tx }
    }
    fn execute<F: FnOnce() + Send + 'static>(&self, f: F) { self.tx.send(Box::new(f)).unwrap(); }
}"##,
            confidence: 0.89,
            related: &["parallel_map", "async_queue"],
        },
        SeedIntent {
            name: "mutex_wrapper",
            python: r##"import threading

class SharedState:
    def __init__(self, value=0):
        self._value = value
        self._lock = threading.Lock()

    def get(self):
        with self._lock:
            return self._value

    def increment(self):
        with self._lock:
            self._value += 1
            return self._value

state = SharedState()
threads = [threading.Thread(target=state.increment) for _ in range(100)]
for t in threads: t.start()
for t in threads: t.join()
print(state.get())  # 100"##,
            rust: r##"use std::sync::{Arc, Mutex};
use std::thread;

fn shared_counter() -> i32 {
    let counter = Arc::new(Mutex::new(0));
    let handles: Vec<_> = (0..100).map(|_| {
        let counter = Arc::clone(&counter);
        thread::spawn(move || { *counter.lock().unwrap() += 1; })
    }).collect();
    for h in handles { h.join().unwrap(); }
    *counter.lock().unwrap()
}"##,
            confidence: 0.90,
            related: &["thread_pool", "channel_communication"],
        },
        SeedIntent {
            name: "channel_communication",
            python: r##"import queue, threading

def producer(q: queue.Queue, items: list):
    for item in items:
        q.put(item)
    q.put(None)  # sentinel

def consumer(q: queue.Queue):
    while True:
        item = q.get()
        if item is None: break
        print(f"Processing: {item}")

q = queue.Queue(maxsize=10)
threading.Thread(target=producer, args=(q, range(20))).start()
consumer(q)"##,
            rust: r##"use std::sync::mpsc;
use std::thread;

fn channel_example() {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for i in 0..20 { tx.send(i).unwrap(); }
    });
    while let Ok(val) = rx.recv() {
        println!("Received: {val}");
    }
}"##,
            confidence: 0.90,
            related: &["thread_pool", "async_queue"],
        },
        SeedIntent {
            name: "semaphore",
            python: r##"import asyncio

async def limited_task(sem: asyncio.Semaphore, task_id: int):
    async with sem:
        print(f"Task {task_id} running")
        await asyncio.sleep(1)
        print(f"Task {task_id} done")

async def main():
    sem = asyncio.Semaphore(3)  # max 3 concurrent
    await asyncio.gather(*(limited_task(sem, i) for i in range(10)))"##,
            rust: r##"use tokio::sync::Semaphore;
use std::sync::Arc;

async fn limited_tasks() {
    let sem = Arc::new(Semaphore::new(3));
    let mut handles = vec![];
    for i in 0..10 {
        let sem = sem.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            println!("Task {i} running");
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }));
    }
    for h in handles { h.await.unwrap(); }
}"##,
            confidence: 0.88,
            related: &["thread_pool", "rate_limiter"],
        },
        SeedIntent {
            name: "retry_with_backoff",
            python: r##"import time, random

def retry(fn, max_retries: int = 3, base_delay: float = 1.0):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            print(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s")
            time.sleep(delay)"##,
            rust: r##"use std::time::Duration;
use std::thread;

fn retry<F, T, E: std::fmt::Display>(f: F, max_retries: u32) -> Result<T, E>
where F: Fn() -> Result<T, E> {
    for attempt in 0..max_retries {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if attempt < max_retries - 1 => {
                let delay = Duration::from_millis(1000 * 2u64.pow(attempt));
                eprintln!("Attempt {} failed: {e}. Retrying...", attempt + 1);
                thread::sleep(delay);
            }
            Err(e) => return Err(e),
        }
    }
    unreachable!()
}"##,
            confidence: 0.89,
            related: &["circuit_breaker", "http_client"],
        },
        SeedIntent {
            name: "circuit_breaker",
            python: r##"import time

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, reset_timeout: float = 30.0):
        self.failures = 0
        self.threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.last_failure = 0
        self.state = "closed"

    def call(self, fn, *args):
        if self.state == "open":
            if time.time() - self.last_failure > self.reset_timeout:
                self.state = "half-open"
            else:
                raise RuntimeError("Circuit is open")
        try:
            result = fn(*args)
            self.failures = 0
            self.state = "closed"
            return result
        except Exception as e:
            self.failures += 1
            self.last_failure = time.time()
            if self.failures >= self.threshold:
                self.state = "open"
            raise"##,
            rust: r##"use std::time::{Duration, Instant};

enum State { Closed, Open(Instant), HalfOpen }

struct CircuitBreaker { state: State, failures: u32, threshold: u32, timeout: Duration }

impl CircuitBreaker {
    fn new(threshold: u32, timeout_secs: u64) -> Self {
        Self { state: State::Closed, failures: 0, threshold, timeout: Duration::from_secs(timeout_secs) }
    }
    fn call<F, T, E>(&mut self, f: F) -> Result<T, E> where F: FnOnce() -> Result<T, E> {
        if let State::Open(since) = self.state {
            if since.elapsed() > self.timeout { self.state = State::HalfOpen; }
            else { panic!("Circuit is open"); }
        }
        match f() {
            Ok(v) => { self.failures = 0; self.state = State::Closed; Ok(v) }
            Err(e) => { self.failures += 1;
                if self.failures >= self.threshold { self.state = State::Open(Instant::now()); }
                Err(e) }
        }
    }
}"##,
            confidence: 0.88,
            related: &["retry_with_backoff", "middleware"],
        },
        SeedIntent {
            name: "debouncer",
            python: r##"import time, threading

class Debouncer:
    def __init__(self, delay: float):
        self.delay = delay
        self.timer = None

    def __call__(self, fn, *args):
        if self.timer:
            self.timer.cancel()
        self.timer = threading.Timer(self.delay, fn, args)
        self.timer.start()

debounce = Debouncer(0.5)
debounce(print, "Only this prints if called rapidly")"##,
            rust: r##"use std::time::{Duration, Instant};

struct Debouncer { delay: Duration, last_call: Option<Instant> }

impl Debouncer {
    fn new(delay_ms: u64) -> Self { Self { delay: Duration::from_millis(delay_ms), last_call: None } }
    fn should_execute(&mut self) -> bool {
        let now = Instant::now();
        if self.last_call.map(|t| now.duration_since(t) >= self.delay).unwrap_or(true) {
            self.last_call = Some(now);
            true
        } else {
            false
        }
    }
}"##,
            confidence: 0.87,
            related: &["throttler", "event_emitter"],
        },
        SeedIntent {
            name: "throttler",
            python: r##"import time

class Throttler:
    def __init__(self, max_per_second: float):
        self.min_interval = 1.0 / max_per_second
        self.last_call = 0

    def throttle(self, fn, *args):
        now = time.time()
        elapsed = now - self.last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_call = time.time()
        return fn(*args)"##,
            rust: r##"use std::time::{Duration, Instant};
use std::thread;

struct Throttler { interval: Duration, last: Option<Instant> }

impl Throttler {
    fn new(max_per_sec: f64) -> Self {
        Self { interval: Duration::from_secs_f64(1.0 / max_per_sec), last: None }
    }
    fn throttle<F: FnOnce() -> T, T>(&mut self, f: F) -> T {
        if let Some(last) = self.last {
            let elapsed = last.elapsed();
            if elapsed < self.interval { thread::sleep(self.interval - elapsed); }
        }
        self.last = Some(Instant::now());
        f()
    }
}"##,
            confidence: 0.87,
            related: &["rate_limiter", "debouncer"],
        },
        SeedIntent {
            name: "parallel_map",
            python: r##"from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

def parallel_map(fn, items, workers=4, use_processes=False):
    Pool = ProcessPoolExecutor if use_processes else ThreadPoolExecutor
    with Pool(max_workers=workers) as ex:
        return list(ex.map(fn, items))

results = parallel_map(lambda x: x ** 2, range(100), workers=8)"##,
            rust: r##"use std::thread;

fn parallel_map<T: Send + 'static, R: Send + 'static>(
    items: Vec<T>, f: fn(T) -> R, workers: usize
) -> Vec<R> {
    let chunks: Vec<Vec<T>> = items.chunks(workers).map(|c| c.to_vec()).collect();
    let handles: Vec<_> = chunks.into_iter().map(|chunk| {
        thread::spawn(move || chunk.into_iter().map(f).collect::<Vec<_>>())
    }).collect();
    handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
}"##,
            confidence: 0.88,
            related: &["thread_pool", "map_reduce"],
        },
        SeedIntent {
            name: "async_queue",
            python: r##"import asyncio

class AsyncQueue:
    def __init__(self, max_workers: int = 5):
        self.queue = asyncio.Queue()
        self.workers = max_workers

    async def add(self, coro):
        await self.queue.put(coro)

    async def worker(self):
        while True:
            coro = await self.queue.get()
            try: await coro
            finally: self.queue.task_done()

    async def run(self):
        workers = [asyncio.create_task(self.worker()) for _ in range(self.workers)]
        await self.queue.join()
        for w in workers: w.cancel()"##,
            rust: r##"use tokio::sync::mpsc;

struct AsyncQueue { tx: mpsc::Sender<Box<dyn FnOnce() + Send>> }

impl AsyncQueue {
    fn new(workers: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Box<dyn FnOnce() + Send>>(100);
        let rx = std::sync::Arc::new(tokio::sync::Mutex::new(rx));
        for _ in 0..workers {
            let rx = rx.clone();
            tokio::spawn(async move {
                while let Some(job) = rx.lock().await.recv().await { job(); }
            });
        }
        Self { tx }
    }
    async fn submit<F: FnOnce() + Send + 'static>(&self, f: F) {
        self.tx.send(Box::new(f)).await.unwrap();
    }
}"##,
            confidence: 0.87,
            related: &["thread_pool", "queue_worker"],
        },

        // ── System & OS (10) ────────────────────────────────────

        SeedIntent {
            name: "env_config",
            python: r##"import os
from dataclasses import dataclass

@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8080
    debug: bool = False
    db_url: str = "sqlite:///app.db"

    @classmethod
    def from_env(cls):
        return cls(
            host=os.getenv("HOST", cls.host),
            port=int(os.getenv("PORT", str(cls.port))),
            debug=os.getenv("DEBUG", "").lower() == "true",
            db_url=os.getenv("DATABASE_URL", cls.db_url),
        )"##,
            rust: r##"struct Config { host: String, port: u16, debug: bool, db_url: String }

impl Config {
    fn from_env() -> Self {
        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080),
            debug: std::env::var("DEBUG").map(|v| v == "true").unwrap_or(false),
            db_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:///app.db".into()),
        }
    }
}"##,
            confidence: 0.89,
            related: &["config_loader", "dotenv_loader"],
        },
        SeedIntent {
            name: "signal_handler",
            python: r##"import signal, sys

def handle_sigint(sig, frame):
    print("\nGraceful shutdown...")
    sys.exit(0)

def handle_sigterm(sig, frame):
    print("\nTerminated, cleaning up...")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_sigint)
signal.signal(signal.SIGTERM, handle_sigterm)
print("Running... (Ctrl+C to stop)")"##,
            rust: r##"use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn main() {
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    ctrlc::set_handler(move || {
        println!("\nGraceful shutdown...");
        r.store(false, Ordering::SeqCst);
    }).unwrap();
    while running.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}"##,
            confidence: 0.88,
            related: &["daemon_process", "process_manager"],
        },
        SeedIntent {
            name: "process_manager",
            python: r##"import subprocess, os, signal

class ProcessManager:
    def __init__(self):
        self.processes = {}

    def start(self, name: str, cmd: list[str]) -> int:
        proc = subprocess.Popen(cmd)
        self.processes[name] = proc
        return proc.pid

    def stop(self, name: str):
        if proc := self.processes.get(name):
            proc.terminate()
            proc.wait(timeout=5)
            del self.processes[name]

    def stop_all(self):
        for name in list(self.processes): self.stop(name)"##,
            rust: r##"use std::collections::HashMap;
use std::process::{Child, Command};

struct ProcessManager { procs: HashMap<String, Child> }

impl ProcessManager {
    fn new() -> Self { Self { procs: HashMap::new() } }
    fn start(&mut self, name: &str, cmd: &str, args: &[&str]) {
        let child = Command::new(cmd).args(args).spawn().unwrap();
        self.procs.insert(name.into(), child);
    }
    fn stop(&mut self, name: &str) {
        if let Some(mut child) = self.procs.remove(name) { child.kill().ok(); }
    }
    fn stop_all(&mut self) {
        for (_, mut child) in self.procs.drain() { child.kill().ok(); }
    }
}"##,
            confidence: 0.87,
            related: &["command_runner", "signal_handler"],
        },
        SeedIntent {
            name: "system_monitor",
            python: r##"import psutil

def system_stats() -> dict:
    return {
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory": {
            "total_gb": psutil.virtual_memory().total / (1024**3),
            "used_percent": psutil.virtual_memory().percent,
        },
        "disk_percent": psutil.disk_usage("/").percent,
        "load_avg": psutil.getloadavg(),
    }"##,
            rust: r##"use std::fs;

fn cpu_usage() -> f64 {
    let stat = fs::read_to_string("/proc/stat").unwrap_or_default();
    let line = stat.lines().next().unwrap_or("");
    let vals: Vec<u64> = line.split_whitespace().skip(1).filter_map(|s| s.parse().ok()).collect();
    let total: u64 = vals.iter().sum();
    let idle = vals.get(3).copied().unwrap_or(0);
    if total == 0 { 0.0 } else { (1.0 - idle as f64 / total as f64) * 100.0 }
}

fn memory_usage() -> (u64, u64) {
    let info = fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let parse = |key: &str| -> u64 {
        info.lines().find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|s| s.parse().ok()).unwrap_or(0)
    };
    (parse("MemTotal:"), parse("MemAvailable:"))
}"##,
            confidence: 0.86,
            related: &["metrics_collector", "logger"],
        },
        SeedIntent {
            name: "disk_usage",
            python: r##"import shutil, os

def disk_usage(path: str = "/") -> dict:
    usage = shutil.disk_usage(path)
    return {
        "total_gb": usage.total / (1024**3),
        "used_gb": usage.used / (1024**3),
        "free_gb": usage.free / (1024**3),
        "percent": usage.used / usage.total * 100,
    }

def check_low_disk(path: str = "/", threshold_gb: float = 1.0) -> bool:
    return disk_usage(path)["free_gb"] < threshold_gb"##,
            rust: r##"use std::process::Command;

fn disk_usage(path: &str) -> (u64, u64, u64) {
    let output = Command::new("df").arg("-B1").arg(path).output().unwrap();
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().nth(1).unwrap_or("");
    let parts: Vec<u64> = line.split_whitespace()
        .filter_map(|s| s.parse().ok()).collect();
    (parts.get(0).copied().unwrap_or(0),
     parts.get(1).copied().unwrap_or(0),
     parts.get(2).copied().unwrap_or(0))
}"##,
            confidence: 0.87,
            related: &["system_monitor", "file_reader"],
        },
        SeedIntent {
            name: "network_info",
            python: r##"import socket

def get_hostname() -> str:
    return socket.gethostname()

def get_local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]

def get_all_ips() -> list[str]:
    hostname = socket.gethostname()
    return socket.gethostbyname_ex(hostname)[2]

print(f"Hostname: {get_hostname()}, IP: {get_local_ip()}")"##,
            rust: r##"use std::net::UdpSocket;

fn get_local_ip() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0").unwrap();
    socket.connect("8.8.8.8:80").unwrap();
    socket.local_addr().unwrap().ip().to_string()
}

fn get_hostname() -> String {
    hostname::get().unwrap().to_string_lossy().into()
}"##,
            confidence: 0.87,
            related: &["dns_resolver", "tcp_client"],
        },
        SeedIntent {
            name: "temp_file",
            python: r##"import tempfile, os

def with_temp_file(content: str, suffix: str = ".txt"):
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
        yield path
    finally:
        os.unlink(path)

def with_temp_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        return tmpdir"##,
            rust: r##"use std::fs;
use std::path::PathBuf;

struct TempFile { path: PathBuf }

impl TempFile {
    fn new(suffix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("tmp_{}{suffix}", rand::random::<u32>()));
        Self { path }
    }
    fn write(&self, content: &str) { fs::write(&self.path, content).unwrap(); }
    fn path(&self) -> &std::path::Path { &self.path }
}

impl Drop for TempFile {
    fn drop(&mut self) { fs::remove_file(&self.path).ok(); }
}"##,
            confidence: 0.88,
            related: &["file_writer", "file_reader"],
        },
        SeedIntent {
            name: "lockfile",
            python: r##"import os, fcntl

class Lockfile:
    def __init__(self, path: str):
        self.path = path
        self.fd = None

    def acquire(self) -> bool:
        self.fd = open(self.path, "w")
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.fd.write(str(os.getpid()))
            self.fd.flush()
            return True
        except OSError:
            return False

    def release(self):
        if self.fd:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            self.fd.close()
            os.unlink(self.path)"##,
            rust: r##"use std::fs::{File, OpenOptions};
use std::io::Write;

struct Lockfile { path: String, file: Option<File> }

impl Lockfile {
    fn new(path: &str) -> Self { Self { path: path.into(), file: None } }
    fn acquire(&mut self) -> bool {
        match OpenOptions::new().write(true).create_new(true).open(&self.path) {
            Ok(mut f) => { write!(f, "{}", std::process::id()).ok(); self.file = Some(f); true }
            Err(_) => false,
        }
    }
    fn release(&mut self) { self.file.take(); std::fs::remove_file(&self.path).ok(); }
}

impl Drop for Lockfile { fn drop(&mut self) { self.release(); } }"##,
            confidence: 0.87,
            related: &["mutex_wrapper", "file_writer"],
        },
        SeedIntent {
            name: "daemon_process",
            python: r##"import os, sys, time

def daemonize():
    if os.fork() > 0: sys.exit(0)
    os.setsid()
    if os.fork() > 0: sys.exit(0)
    sys.stdout = open("/dev/null", "w")
    sys.stderr = open("/dev/null", "w")
    sys.stdin = open("/dev/null", "r")

def run_daemon(pidfile: str):
    daemonize()
    with open(pidfile, "w") as f:
        f.write(str(os.getpid()))
    while True:
        time.sleep(60)"##,
            rust: r##"use std::fs;
use std::process;

fn write_pidfile(path: &str) {
    fs::write(path, process::id().to_string()).unwrap();
}

fn remove_pidfile(path: &str) {
    fs::remove_file(path).ok();
}

fn is_running(pidfile: &str) -> bool {
    fs::read_to_string(pidfile).ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .map(|pid| std::path::Path::new(&format!("/proc/{pid}")).exists())
        .unwrap_or(false)
}"##,
            confidence: 0.86,
            related: &["signal_handler", "process_manager"],
        },
        SeedIntent {
            name: "log_rotation",
            python: r##"import logging
from logging.handlers import RotatingFileHandler

def setup_logger(name: str, path: str, max_bytes: int = 10_000_000, backups: int = 5):
    logger = logging.getLogger(name)
    handler = RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backups)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger"##,
            rust: r##"use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

struct RotatingLog { path: String, max_bytes: u64, backups: u32 }

impl RotatingLog {
    fn new(path: &str, max_bytes: u64, backups: u32) -> Self {
        Self { path: path.into(), max_bytes, backups }
    }
    fn write(&self, msg: &str) {
        let size = fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        if size >= self.max_bytes { self.rotate(); }
        let mut f = OpenOptions::new().create(true).append(true).open(&self.path).unwrap();
        writeln!(f, "{msg}").unwrap();
    }
    fn rotate(&self) {
        for i in (1..self.backups).rev() {
            let from = format!("{}.{}", self.path, i);
            let to = format!("{}.{}", self.path, i + 1);
            if Path::new(&from).exists() { fs::rename(&from, &to).ok(); }
        }
        fs::rename(&self.path, format!("{}.1", self.path)).ok();
    }
}"##,
            confidence: 0.87,
            related: &["logger", "file_writer"],
        },

        // ── Cryptography (5) ────────────────────────────────────

        SeedIntent {
            name: "aes_encrypt",
            python: r##"from cryptography.fernet import Fernet

def encrypt(plaintext: str, key: bytes = None) -> tuple[bytes, bytes]:
    if key is None:
        key = Fernet.generate_key()
    f = Fernet(key)
    return f.encrypt(plaintext.encode()), key

def decrypt(ciphertext: bytes, key: bytes) -> str:
    f = Fernet(key)
    return f.decrypt(ciphertext).decode()"##,
            rust: r##"use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit}};

fn encrypt(plaintext: &[u8], key: &[u8; 32], nonce: &[u8; 12]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.encrypt(Nonce::from_slice(nonce), plaintext).unwrap()
}

fn decrypt(ciphertext: &[u8], key: &[u8; 32], nonce: &[u8; 12]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(Nonce::from_slice(nonce), ciphertext).unwrap()
}"##,
            confidence: 0.88,
            related: &["encryption", "hashing"],
        },
        SeedIntent {
            name: "rsa_keypair",
            python: r##"from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes

def generate_keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = private.public_key()
    return private, public

def encrypt_rsa(public_key, plaintext: bytes) -> bytes:
    return public_key.encrypt(plaintext, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(), label=None))"##,
            rust: r##"use rsa::{RsaPrivateKey, RsaPublicKey, pkcs1::EncodeRsaPublicKey};
use rand::rngs::OsRng;

fn generate_keypair() -> (RsaPrivateKey, RsaPublicKey) {
    let private = RsaPrivateKey::new(&mut OsRng, 2048).unwrap();
    let public = RsaPublicKey::from(&private);
    (private, public)
}"##,
            confidence: 0.86,
            related: &["encryption", "digital_signature"],
        },
        SeedIntent {
            name: "digital_signature",
            python: r##"from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils

def sign(private_key, data: bytes) -> bytes:
    return private_key.sign(data, ec.ECDSA(hashes.SHA256()))

def verify(public_key, data: bytes, signature: bytes) -> bool:
    try:
        public_key.verify(signature, data, ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False"##,
            rust: r##"use ed25519_dalek::{Keypair, Signer, Verifier, Signature};
use rand::rngs::OsRng;

fn sign_message(keypair: &Keypair, message: &[u8]) -> Signature {
    keypair.sign(message)
}

fn verify_signature(keypair: &Keypair, message: &[u8], sig: &Signature) -> bool {
    keypair.public.verify(message, sig).is_ok()
}

fn generate_keypair() -> Keypair { Keypair::generate(&mut OsRng) }"##,
            confidence: 0.86,
            related: &["encryption", "rsa_keypair"],
        },
        SeedIntent {
            name: "hmac_auth",
            python: r##"import hmac, hashlib, time

def sign_request(secret: str, method: str, path: str, body: str = "") -> str:
    timestamp = str(int(time.time()))
    message = f"{method}:{path}:{timestamp}:{body}"
    sig = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"{timestamp}:{sig}"

def verify_request(secret: str, method: str, path: str, body: str, auth: str, max_age: int = 300) -> bool:
    ts, sig = auth.split(":", 1)
    if abs(time.time() - int(ts)) > max_age:
        return False
    message = f"{method}:{path}:{ts}:{body}"
    expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)"##,
            rust: r##"use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn sign(secret: &[u8], message: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).unwrap();
    mac.update(message);
    hex::encode(mac.finalize().into_bytes())
}

fn verify(secret: &[u8], message: &[u8], signature: &str) -> bool {
    sign(secret, message) == signature
}"##,
            confidence: 0.88,
            related: &["webhook_handler", "auth_handler"],
        },
        SeedIntent {
            name: "random_generator",
            python: r##"import secrets, string

def random_bytes(n: int) -> bytes:
    return secrets.token_bytes(n)

def random_hex(n: int) -> str:
    return secrets.token_hex(n)

def random_string(length: int, charset: str = string.ascii_letters + string.digits) -> str:
    return "".join(secrets.choice(charset) for _ in range(length))

def random_int(low: int, high: int) -> int:
    return secrets.randbelow(high - low) + low"##,
            rust: r##"use rand::Rng;

fn random_bytes(n: usize) -> Vec<u8> {
    let mut rng = rand::thread_rng();
    (0..n).map(|_| rng.gen()).collect()
}

fn random_hex(n: usize) -> String {
    random_bytes(n).iter().map(|b| format!("{b:02x}")).collect()
}

fn random_string(len: usize) -> String {
    let charset = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    (0..len).map(|_| charset[rng.gen_range(0..charset.len())] as char).collect()
}"##,
            confidence: 0.89,
            related: &["encryption", "hashing"],
        },

        // ── Patterns & Architecture (10) ────────────────────────

        SeedIntent {
            name: "repository_pattern",
            python: r##"from abc import ABC, abstractmethod

class Repository(ABC):
    @abstractmethod
    def find_by_id(self, id: int): pass
    @abstractmethod
    def find_all(self) -> list: pass
    @abstractmethod
    def save(self, entity) -> int: pass
    @abstractmethod
    def delete(self, id: int): pass

class InMemoryRepo(Repository):
    def __init__(self):
        self.data = {}
        self.next_id = 1

    def find_by_id(self, id): return self.data.get(id)
    def find_all(self): return list(self.data.values())
    def save(self, entity):
        self.data[self.next_id] = entity
        self.next_id += 1
        return self.next_id - 1
    def delete(self, id): self.data.pop(id, None)"##,
            rust: r##"trait Repository<T> {
    fn find_by_id(&self, id: u64) -> Option<&T>;
    fn find_all(&self) -> Vec<&T>;
    fn save(&mut self, entity: T) -> u64;
    fn delete(&mut self, id: u64);
}

struct InMemoryRepo<T> { data: std::collections::HashMap<u64, T>, next_id: u64 }

impl<T> InMemoryRepo<T> {
    fn new() -> Self { Self { data: std::collections::HashMap::new(), next_id: 1 } }
}

impl<T> Repository<T> for InMemoryRepo<T> {
    fn find_by_id(&self, id: u64) -> Option<&T> { self.data.get(&id) }
    fn find_all(&self) -> Vec<&T> { self.data.values().collect() }
    fn save(&mut self, entity: T) -> u64 { let id = self.next_id; self.data.insert(id, entity); self.next_id += 1; id }
    fn delete(&mut self, id: u64) { self.data.remove(&id); }
}"##,
            confidence: 0.88,
            related: &["orm_model", "database_client"],
        },
        SeedIntent {
            name: "service_layer",
            python: r##"class UserService:
    def __init__(self, repo, hasher, emailer):
        self.repo = repo
        self.hasher = hasher
        self.emailer = emailer

    def register(self, name: str, email: str, password: str) -> int:
        hashed = self.hasher.hash(password)
        user_id = self.repo.save({"name": name, "email": email, "password": hashed})
        self.emailer.send(email, "Welcome!", f"Hi {name}!")
        return user_id

    def authenticate(self, email: str, password: str):
        user = self.repo.find_by_email(email)
        if user and self.hasher.verify(password, user["password"]):
            return user
        return None"##,
            rust: r##"struct UserService<R, H> { repo: R, hasher: H }

trait UserRepo { fn save(&mut self, name: &str, email: &str) -> u64; fn find(&self, id: u64) -> Option<String>; }
trait Hasher { fn hash(&self, pw: &str) -> String; fn verify(&self, pw: &str, h: &str) -> bool; }

impl<R: UserRepo, H: Hasher> UserService<R, H> {
    fn new(repo: R, hasher: H) -> Self { Self { repo, hasher } }
    fn register(&mut self, name: &str, email: &str, password: &str) -> u64 {
        let _hashed = self.hasher.hash(password);
        self.repo.save(name, email)
    }
}"##,
            confidence: 0.87,
            related: &["repository_pattern", "dependency_injection"],
        },
        SeedIntent {
            name: "dependency_injection",
            python: r##"class Container:
    def __init__(self):
        self._factories = {}
        self._singletons = {}

    def register(self, name: str, factory, singleton: bool = False):
        self._factories[name] = (factory, singleton)

    def resolve(self, name: str):
        factory, singleton = self._factories[name]
        if singleton:
            if name not in self._singletons:
                self._singletons[name] = factory(self)
            return self._singletons[name]
        return factory(self)

c = Container()
c.register("db", lambda c: {"connection": "sqlite"}, singleton=True)
c.register("repo", lambda c: {"db": c.resolve("db")})"##,
            rust: r##"use std::collections::HashMap;
use std::any::Any;

struct Container { factories: HashMap<String, Box<dyn Fn() -> Box<dyn Any>>> }

impl Container {
    fn new() -> Self { Self { factories: HashMap::new() } }
    fn register<T: Any + 'static, F: Fn() -> T + 'static>(&mut self, name: &str, f: F) {
        self.factories.insert(name.into(), Box::new(move || Box::new(f())));
    }
    fn resolve<T: Any>(&self, name: &str) -> Option<Box<T>> {
        self.factories.get(name).map(|f| f()).and_then(|b| b.downcast().ok())
    }
}"##,
            confidence: 0.87,
            related: &["factory_pattern", "service_layer"],
        },
        SeedIntent {
            name: "middleware_chain",
            python: r##"class MiddlewareChain:
    def __init__(self):
        self.middlewares = []

    def use(self, middleware):
        self.middlewares.append(middleware)
        return self

    def execute(self, request):
        def run(index, req):
            if index >= len(self.middlewares):
                return req
            mw = self.middlewares[index]
            return mw(req, lambda r: run(index + 1, r))
        return run(0, request)

chain = MiddlewareChain()
chain.use(lambda req, next: next({**req, "logged": True}))
chain.use(lambda req, next: next({**req, "authed": True}))"##,
            rust: r##"type Middleware = Box<dyn Fn(Request, &dyn Fn(Request) -> Response) -> Response>;

struct Request { path: String, headers: Vec<(String, String)> }
struct Response { status: u16, body: String }

struct Chain { middlewares: Vec<Middleware> }

impl Chain {
    fn new() -> Self { Self { middlewares: vec![] } }
    fn add(&mut self, mw: Middleware) { self.middlewares.push(mw); }
    fn execute(&self, req: Request) -> Response {
        fn run(mws: &[Middleware], req: Request) -> Response {
            if mws.is_empty() { return Response { status: 200, body: "OK".into() }; }
            mws[0](req, &|r| run(&mws[1..], r))
        }
        run(&self.middlewares, req)
    }
}"##,
            confidence: 0.87,
            related: &["middleware", "chain_of_responsibility"],
        },
        SeedIntent {
            name: "pub_sub_system",
            python: r##"from collections import defaultdict

class PubSub:
    def __init__(self):
        self.subscribers = defaultdict(list)

    def subscribe(self, topic: str, callback):
        self.subscribers[topic].append(callback)

    def unsubscribe(self, topic: str, callback):
        self.subscribers[topic].remove(callback)

    def publish(self, topic: str, data):
        for cb in self.subscribers.get(topic, []):
            cb(data)

bus = PubSub()
bus.subscribe("user.created", lambda d: print(f"New user: {d}"))"##,
            rust: r##"use std::collections::HashMap;

struct PubSub { subs: HashMap<String, Vec<Box<dyn Fn(&str)>>> }

impl PubSub {
    fn new() -> Self { Self { subs: HashMap::new() } }
    fn subscribe<F: Fn(&str) + 'static>(&mut self, topic: &str, f: F) {
        self.subs.entry(topic.into()).or_default().push(Box::new(f));
    }
    fn publish(&self, topic: &str, data: &str) {
        if let Some(cbs) = self.subs.get(topic) {
            for cb in cbs { cb(data); }
        }
    }
}"##,
            confidence: 0.88,
            related: &["event_emitter", "observer_pattern"],
        },
        SeedIntent {
            name: "command_pattern",
            python: r##"from abc import ABC, abstractmethod

class Command(ABC):
    @abstractmethod
    def execute(self): pass
    @abstractmethod
    def undo(self): pass

class InsertText(Command):
    def __init__(self, doc: list, pos: int, text: str):
        self.doc, self.pos, self.text = doc, pos, text

    def execute(self):
        self.doc.insert(self.pos, self.text)

    def undo(self):
        self.doc.pop(self.pos)

class History:
    def __init__(self):
        self.stack = []

    def execute(self, cmd: Command):
        cmd.execute()
        self.stack.append(cmd)

    def undo(self):
        if self.stack:
            self.stack.pop().undo()"##,
            rust: r##"trait Command { fn execute(&mut self); fn undo(&mut self); }

struct InsertCmd { doc: Vec<String>, pos: usize, text: String }
impl Command for InsertCmd {
    fn execute(&mut self) { self.doc.insert(self.pos, self.text.clone()); }
    fn undo(&mut self) { self.doc.remove(self.pos); }
}

struct History { stack: Vec<Box<dyn Command>> }
impl History {
    fn new() -> Self { Self { stack: vec![] } }
    fn execute(&mut self, mut cmd: Box<dyn Command>) { cmd.execute(); self.stack.push(cmd); }
    fn undo(&mut self) { if let Some(mut cmd) = self.stack.pop() { cmd.undo(); } }
}"##,
            confidence: 0.88,
            related: &["state_machine", "observer_pattern"],
        },
        SeedIntent {
            name: "strategy_pattern",
            python: r##"from abc import ABC, abstractmethod

class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: list) -> list: pass

class QuickSort(SortStrategy):
    def sort(self, data): return sorted(data)

class BubbleSort(SortStrategy):
    def sort(self, data):
        d = data[:]
        for i in range(len(d)):
            for j in range(len(d) - 1 - i):
                if d[j] > d[j+1]: d[j], d[j+1] = d[j+1], d[j]
        return d

class Sorter:
    def __init__(self, strategy: SortStrategy):
        self.strategy = strategy
    def sort(self, data): return self.strategy.sort(data)"##,
            rust: r##"trait SortStrategy { fn sort(&self, data: &mut Vec<i32>); }

struct QuickSort;
impl SortStrategy for QuickSort { fn sort(&self, data: &mut Vec<i32>) { data.sort(); } }

struct BubbleSort;
impl SortStrategy for BubbleSort {
    fn sort(&self, data: &mut Vec<i32>) {
        let n = data.len();
        for i in 0..n { for j in 0..n-1-i { if data[j] > data[j+1] { data.swap(j, j+1); } } }
    }
}

struct Sorter { strategy: Box<dyn SortStrategy> }
impl Sorter {
    fn new(s: Box<dyn SortStrategy>) -> Self { Self { strategy: s } }
    fn sort(&self, data: &mut Vec<i32>) { self.strategy.sort(data); }
}"##,
            confidence: 0.88,
            related: &["sort_function", "factory_pattern"],
        },
        SeedIntent {
            name: "decorator_pattern",
            python: r##"class Logger:
    def __init__(self, wrapped):
        self.wrapped = wrapped

    def process(self, data):
        print(f"[LOG] Input: {data}")
        result = self.wrapped.process(data)
        print(f"[LOG] Output: {result}")
        return result

class Validator:
    def __init__(self, wrapped):
        self.wrapped = wrapped

    def process(self, data):
        if not data: raise ValueError("Empty data")
        return self.wrapped.process(data)

class Core:
    def process(self, data): return data.upper()

pipeline = Logger(Validator(Core()))"##,
            rust: r##"trait Processor { fn process(&self, data: &str) -> String; }

struct Core;
impl Processor for Core { fn process(&self, data: &str) -> String { data.to_uppercase() } }

struct LogDecorator<P: Processor> { inner: P }
impl<P: Processor> Processor for LogDecorator<P> {
    fn process(&self, data: &str) -> String {
        println!("[LOG] Input: {data}");
        let result = self.inner.process(data);
        println!("[LOG] Output: {result}");
        result
    }
}

fn decorated() -> impl Processor { LogDecorator { inner: Core } }"##,
            confidence: 0.88,
            related: &["middleware", "middleware_chain"],
        },
        SeedIntent {
            name: "adapter_pattern",
            python: r##"class OldApi:
    def get_data_xml(self) -> str:
        return "<data><item>Hello</item></data>"

class NewApi:
    def get_data_json(self) -> dict:
        return {"data": [{"item": "Hello"}]}

class Adapter:
    def __init__(self, old: OldApi):
        self.old = old

    def get_data_json(self) -> dict:
        xml = self.old.get_data_xml()
        # Simplified conversion
        return {"data": [{"item": "Hello"}]}

adapted = Adapter(OldApi())"##,
            rust: r##"trait JsonApi { fn get_json(&self) -> String; }
trait XmlApi { fn get_xml(&self) -> String; }

struct OldService;
impl XmlApi for OldService { fn get_xml(&self) -> String { "<data>Hello</data>".into() } }

struct Adapter<T: XmlApi> { inner: T }
impl<T: XmlApi> JsonApi for Adapter<T> {
    fn get_json(&self) -> String {
        let xml = self.inner.get_xml();
        format!("{{\"data\": \"{}\"}}", xml)
    }
}

fn adapted() -> impl JsonApi { Adapter { inner: OldService } }"##,
            confidence: 0.88,
            related: &["decorator_pattern", "factory_pattern"],
        },
        SeedIntent {
            name: "chain_of_responsibility",
            python: r##"from abc import ABC, abstractmethod

class Handler(ABC):
    def __init__(self):
        self._next = None

    def set_next(self, handler):
        self._next = handler
        return handler

    def handle(self, request):
        if self._next:
            return self._next.handle(request)
        return None

class AuthHandler(Handler):
    def handle(self, request):
        if not request.get("token"):
            return "Auth required"
        return super().handle(request)

class RateLimitHandler(Handler):
    def handle(self, request):
        if request.get("rate_exceeded"):
            return "Rate limited"
        return super().handle(request)"##,
            rust: r##"trait Handler { fn handle(&self, request: &str) -> Option<String>; fn next(&self) -> Option<&dyn Handler>; }

struct AuthHandler { next: Option<Box<dyn Handler>> }
impl Handler for AuthHandler {
    fn handle(&self, request: &str) -> Option<String> {
        if !request.contains("token") { return Some("Auth required".into()); }
        self.next().and_then(|n| n.handle(request))
    }
    fn next(&self) -> Option<&dyn Handler> { self.next.as_deref() }
}

struct LogHandler { next: Option<Box<dyn Handler>> }
impl Handler for LogHandler {
    fn handle(&self, request: &str) -> Option<String> {
        println!("Log: {request}");
        self.next().and_then(|n| n.handle(request))
    }
    fn next(&self) -> Option<&dyn Handler> { self.next.as_deref() }
}"##,
            confidence: 0.87,
            related: &["middleware_chain", "middleware"],
        },

        // ── File & Format (10) ──────────────────────────────────

        SeedIntent {
            name: "yaml_parser",
            python: r##"import yaml

def load_yaml(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)

def dump_yaml(data: dict, path: str):
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)

config = load_yaml("config.yaml")"##,
            rust: r##"use serde_yaml;
use std::fs;

fn load_yaml<T: serde::de::DeserializeOwned>(path: &str) -> T {
    let content = fs::read_to_string(path).unwrap();
    serde_yaml::from_str(&content).unwrap()
}

fn dump_yaml<T: serde::Serialize>(data: &T, path: &str) {
    let yaml = serde_yaml::to_string(data).unwrap();
    fs::write(path, yaml).unwrap();
}"##,
            confidence: 0.88,
            related: &["json_parser", "config_loader"],
        },
        SeedIntent {
            name: "ini_parser",
            python: r##"import configparser

def load_ini(path: str) -> dict:
    config = configparser.ConfigParser()
    config.read(path)
    return {s: dict(config[s]) for s in config.sections()}

def save_ini(data: dict, path: str):
    config = configparser.ConfigParser()
    for section, values in data.items():
        config[section] = values
    with open(path, "w") as f:
        config.write(f)"##,
            rust: r##"use std::collections::HashMap;
use std::fs;

fn parse_ini(path: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections = HashMap::new();
    let mut current = String::new();
    for line in fs::read_to_string(path).unwrap_or_default().lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            current = line[1..line.len()-1].to_string();
            sections.entry(current.clone()).or_insert_with(HashMap::new);
        } else if let Some((k, v)) = line.split_once('=') {
            if let Some(sec) = sections.get_mut(&current) {
                sec.insert(k.trim().into(), v.trim().into());
            }
        }
    }
    sections
}"##,
            confidence: 0.87,
            related: &["config_loader", "yaml_parser"],
        },
        SeedIntent {
            name: "markdown_renderer",
            python: r##"import markdown

def render_markdown(md_text: str) -> str:
    return markdown.markdown(md_text, extensions=["fenced_code", "tables"])

html = render_markdown("# Hello\n\nThis is **bold** and *italic*.")
print(html)"##,
            rust: r##"use pulldown_cmark::{Parser, html};

fn render_markdown(md: &str) -> String {
    let parser = Parser::new(md);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

fn main() {
    let html = render_markdown("# Hello\n\nThis is **bold** and *italic*.");
    println!("{html}");
}"##,
            confidence: 0.88,
            related: &["html_parser", "html_to_markdown"],
        },
        SeedIntent {
            name: "zip_archive",
            python: r##"import zipfile, os

def zip_directory(src: str, dst: str):
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src):
            for file in files:
                path = os.path.join(root, file)
                zf.write(path, os.path.relpath(path, src))

def unzip(src: str, dst: str):
    with zipfile.ZipFile(src, "r") as zf:
        zf.extractall(dst)"##,
            rust: r##"use std::fs::File;
use std::io::{Read, Write};
use zip::{ZipWriter, write::FileOptions};

fn create_zip(output: &str, files: &[(&str, &[u8])]) {
    let file = File::create(output).unwrap();
    let mut zip = ZipWriter::new(file);
    let opts = FileOptions::default();
    for (name, data) in files {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
}"##,
            confidence: 0.87,
            related: &["compression", "tar_archive"],
        },
        SeedIntent {
            name: "tar_archive",
            python: r##"import tarfile

def create_tar(src: str, dst: str, compress: bool = True):
    mode = "w:gz" if compress else "w"
    with tarfile.open(dst, mode) as tar:
        tar.add(src, arcname=".")

def extract_tar(src: str, dst: str):
    with tarfile.open(src, "r:*") as tar:
        tar.extractall(dst)"##,
            rust: r##"use flate2::write::GzEncoder;
use flate2::Compression;
use tar::Builder;
use std::fs::File;

fn create_tar_gz(src: &str, dst: &str) {
    let tar_gz = File::create(dst).unwrap();
    let enc = GzEncoder::new(tar_gz, Compression::default());
    let mut tar = Builder::new(enc);
    tar.append_dir_all(".", src).unwrap();
}

fn extract_tar_gz(src: &str, dst: &str) {
    let tar_gz = File::open(src).unwrap();
    let dec = flate2::read::GzDecoder::new(tar_gz);
    let mut archive = tar::Archive::new(dec);
    archive.unpack(dst).unwrap();
}"##,
            confidence: 0.87,
            related: &["compression", "zip_archive"],
        },
        SeedIntent {
            name: "base64_codec",
            python: r##"import base64

def encode(data: bytes) -> str:
    return base64.b64encode(data).decode()

def decode(encoded: str) -> bytes:
    return base64.b64decode(encoded)

def url_safe_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

original = b"Hello CrownyCode!"
encoded = encode(original)
decoded = decode(encoded)
assert decoded == original"##,
            rust: r##"use base64::{Engine, engine::general_purpose};

fn encode(data: &[u8]) -> String {
    general_purpose::STANDARD.encode(data)
}

fn decode(encoded: &str) -> Vec<u8> {
    general_purpose::STANDARD.decode(encoded).unwrap()
}

fn main() {
    let original = b"Hello CrownyCode!";
    let encoded = encode(original);
    let decoded = decode(&encoded);
    assert_eq!(decoded, original);
}"##,
            confidence: 0.89,
            related: &["encryption", "url_encoder"],
        },
        SeedIntent {
            name: "url_encoder",
            python: r##"from urllib.parse import quote, unquote, urlencode, parse_qs

def encode_url(s: str) -> str:
    return quote(s, safe="")

def decode_url(s: str) -> str:
    return unquote(s)

def build_query(params: dict) -> str:
    return urlencode(params)

def parse_query(qs: str) -> dict:
    return {k: v[0] if len(v) == 1 else v for k, v in parse_qs(qs).items()}"##,
            rust: r##"fn url_encode(s: &str) -> String {
    s.chars().map(|c| match c {
        'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
        _ => format!("%{:02X}", c as u32),
    }).collect()
}

fn url_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            result.push(u8::from_str_radix(&hex, 16).unwrap_or(b'?') as char);
        } else { result.push(if c == '+' { ' ' } else { c }); }
    }
    result
}"##,
            confidence: 0.88,
            related: &["url_router", "base64_codec"],
        },
        SeedIntent {
            name: "qr_code_generator",
            python: r##"import qrcode
from io import BytesIO

def generate_qr(data: str, path: str = None) -> bytes:
    qr = qrcode.make(data)
    if path:
        qr.save(path)
    buf = BytesIO()
    qr.save(buf, format="PNG")
    return buf.getvalue()

generate_qr("https://crowny.com", "qr.png")"##,
            rust: r##"use qrcode::QrCode;
use image::Luma;

fn generate_qr(data: &str, path: &str) {
    let code = QrCode::new(data.as_bytes()).unwrap();
    let image = code.render::<Luma<u8>>().build();
    image.save(path).unwrap();
}"##,
            confidence: 0.86,
            related: &["image_processor", "base64_codec"],
        },
        SeedIntent {
            name: "barcode_reader",
            python: r##"from pyzbar.pyzbar import decode
from PIL import Image

def read_barcodes(image_path: str) -> list[dict]:
    img = Image.open(image_path)
    barcodes = decode(img)
    return [{"type": b.type, "data": b.data.decode()} for b in barcodes]

results = read_barcodes("barcode.png")
for r in results:
    print(f"{r['type']}: {r['data']}")"##,
            rust: r##"use bardecoder;

fn read_barcode(image_path: &str) -> Vec<String> {
    let img = image::open(image_path).unwrap();
    let decoder = bardecoder::default_decoder();
    let results = decoder.decode(&img);
    results.into_iter().filter_map(|r| r.ok()).collect()
}"##,
            confidence: 0.85,
            related: &["qr_code_generator", "image_processor"],
        },
        SeedIntent {
            name: "excel_reader",
            python: r##"import openpyxl

def read_excel(path: str, sheet: str = None) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[sheet] if sheet else wb.active
    headers = [cell.value for cell in next(ws.iter_rows(max_row=1))]
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        rows.append(dict(zip(headers, row)))
    return rows"##,
            rust: r##"use calamine::{Reader, open_workbook, Xlsx};

fn read_excel(path: &str) -> Vec<Vec<String>> {
    let mut workbook: Xlsx<_> = open_workbook(path).unwrap();
    let sheet = workbook.worksheet_range_at(0).unwrap().unwrap();
    sheet.rows().map(|row| {
        row.iter().map(|cell| cell.to_string()).collect()
    }).collect()
}"##,
            confidence: 0.86,
            related: &["csv_parser", "file_reader"],
        },

        // ── Math & Algorithm (14) ───────────────────────────────

        SeedIntent {
            name: "matrix_multiply",
            python: r##"def mat_mul(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    rows_a, cols_a = len(a), len(a[0])
    cols_b = len(b[0])
    result = [[0.0] * cols_b for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            for k in range(cols_a):
                result[i][j] += a[i][k] * b[k][j]
    return result

a = [[1, 2], [3, 4]]
b = [[5, 6], [7, 8]]
print(mat_mul(a, b))  # [[19, 22], [43, 50]]"##,
            rust: r##"fn mat_mul(a: &[Vec<f64>], b: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let (rows, cols, inner) = (a.len(), b[0].len(), a[0].len());
    let mut result = vec![vec![0.0; cols]; rows];
    for i in 0..rows {
        for j in 0..cols {
            for k in 0..inner {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    result
}"##,
            confidence: 0.89,
            related: &["data_processor", "parallel_map"],
        },
        SeedIntent {
            name: "fibonacci",
            python: r##"def fib_iter(n: int) -> int:
    if n <= 1: return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def fib_memo(n: int, memo: dict = {}) -> int:
    if n in memo: return memo[n]
    if n <= 1: return n
    memo[n] = fib_memo(n-1, memo) + fib_memo(n-2, memo)
    return memo[n]

print([fib_iter(i) for i in range(10)])"##,
            rust: r##"fn fib(n: u64) -> u64 {
    if n <= 1 { return n; }
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 2..=n { let tmp = a + b; a = b; b = tmp; }
    b
}

fn fib_sequence(n: usize) -> Vec<u64> {
    (0..n as u64).map(fib).collect()
}

fn main() { println!("{:?}", fib_sequence(10)); }"##,
            confidence: 0.90,
            related: &["sort_function", "binary_search"],
        },
        SeedIntent {
            name: "prime_sieve",
            python: r##"def sieve_of_eratosthenes(limit: int) -> list[int]:
    is_prime = [True] * (limit + 1)
    is_prime[0] = is_prime[1] = False
    for i in range(2, int(limit**0.5) + 1):
        if is_prime[i]:
            for j in range(i*i, limit + 1, i):
                is_prime[j] = False
    return [i for i, p in enumerate(is_prime) if p]

primes = sieve_of_eratosthenes(100)
print(primes)"##,
            rust: r##"fn sieve(limit: usize) -> Vec<usize> {
    let mut is_prime = vec![true; limit + 1];
    is_prime[0] = false;
    if limit > 0 { is_prime[1] = false; }
    let mut i = 2;
    while i * i <= limit {
        if is_prime[i] {
            let mut j = i * i;
            while j <= limit { is_prime[j] = false; j += i; }
        }
        i += 1;
    }
    (0..=limit).filter(|&i| is_prime[i]).collect()
}"##,
            confidence: 0.90,
            related: &["fibonacci", "sort_function"],
        },
        SeedIntent {
            name: "graph_bfs",
            python: r##"from collections import deque

def bfs(graph: dict[str, list[str]], start: str) -> list[str]:
    visited = set()
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        if node in visited: continue
        visited.add(node)
        order.append(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                queue.append(neighbor)
    return order

g = {"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": []}
print(bfs(g, "A"))"##,
            rust: r##"use std::collections::{HashMap, HashSet, VecDeque};

fn bfs(graph: &HashMap<&str, Vec<&str>>, start: &str) -> Vec<String> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    let mut order = vec![];
    queue.push_back(start.to_string());
    while let Some(node) = queue.pop_front() {
        if !visited.insert(node.clone()) { continue; }
        order.push(node.clone());
        if let Some(neighbors) = graph.get(node.as_str()) {
            for &n in neighbors {
                if !visited.contains(n) { queue.push_back(n.to_string()); }
            }
        }
    }
    order
}"##,
            confidence: 0.89,
            related: &["graph_dfs", "dijkstra"],
        },
        SeedIntent {
            name: "graph_dfs",
            python: r##"def dfs(graph: dict[str, list[str]], start: str) -> list[str]:
    visited = set()
    order = []
    def visit(node):
        if node in visited: return
        visited.add(node)
        order.append(node)
        for neighbor in graph.get(node, []):
            visit(neighbor)
    visit(start)
    return order

g = {"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": []}
print(dfs(g, "A"))"##,
            rust: r##"use std::collections::{HashMap, HashSet};

fn dfs(graph: &HashMap<&str, Vec<&str>>, start: &str) -> Vec<String> {
    let mut visited = HashSet::new();
    let mut order = vec![];
    fn visit(node: &str, graph: &HashMap<&str, Vec<&str>>, visited: &mut HashSet<String>, order: &mut Vec<String>) {
        if !visited.insert(node.to_string()) { return; }
        order.push(node.to_string());
        if let Some(neighbors) = graph.get(node) {
            for &n in neighbors { visit(n, graph, visited, order); }
        }
    }
    visit(start, graph, &mut visited, &mut order);
    order
}"##,
            confidence: 0.89,
            related: &["graph_bfs", "dijkstra"],
        },
        SeedIntent {
            name: "dijkstra",
            python: r##"import heapq

def dijkstra(graph: dict[str, list[tuple[str, float]]], start: str) -> dict[str, float]:
    dist = {start: 0.0}
    heap = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, float('inf')): continue
        for v, w in graph.get(u, []):
            nd = d + w
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist

g = {"A": [("B", 1), ("C", 4)], "B": [("C", 2)], "C": []}
print(dijkstra(g, "A"))"##,
            rust: r##"use std::collections::{BinaryHeap, HashMap};
use std::cmp::Reverse;

fn dijkstra(graph: &HashMap<&str, Vec<(&str, f64)>>, start: &str) -> HashMap<String, f64> {
    let mut dist: HashMap<String, f64> = HashMap::new();
    let mut heap = BinaryHeap::new();
    dist.insert(start.into(), 0.0);
    heap.push(Reverse((ordered_float::OrderedFloat(0.0), start.to_string())));
    while let Some(Reverse((d, u))) = heap.pop() {
        if d.0 > *dist.get(&u).unwrap_or(&f64::INFINITY) { continue; }
        for &(v, w) in graph.get(u.as_str()).unwrap_or(&vec![]) {
            let nd = d.0 + w;
            if nd < *dist.get(v).unwrap_or(&f64::INFINITY) {
                dist.insert(v.into(), nd);
                heap.push(Reverse((ordered_float::OrderedFloat(nd), v.into())));
            }
        }
    }
    dist
}"##,
            confidence: 0.88,
            related: &["graph_bfs", "graph_dfs"],
        },
        SeedIntent {
            name: "lru_cache",
            python: r##"from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        return None

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)"##,
            rust: r##"use std::collections::HashMap;

struct LruCache<K: std::hash::Hash + Eq + Clone, V> {
    map: HashMap<K, (V, usize)>, order: Vec<K>, capacity: usize, tick: usize,
}

impl<K: std::hash::Hash + Eq + Clone, V> LruCache<K, V> {
    fn new(capacity: usize) -> Self {
        Self { map: HashMap::new(), order: vec![], capacity, tick: 0 }
    }
    fn get(&mut self, key: &K) -> Option<&V> {
        if let Some((v, t)) = self.map.get_mut(key) { self.tick += 1; *t = self.tick; Some(v) } else { None }
    }
    fn put(&mut self, key: K, value: V) {
        self.tick += 1;
        if self.map.len() >= self.capacity && !self.map.contains_key(&key) {
            let oldest = self.map.iter().min_by_key(|(_, (_, t))| t).map(|(k, _)| k.clone());
            if let Some(k) = oldest { self.map.remove(&k); }
        }
        self.map.insert(key, (value, self.tick));
    }
}"##,
            confidence: 0.89,
            related: &["cache_client", "hash_map"],
        },
        SeedIntent {
            name: "trie",
            python: r##"class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def search(self, word: str) -> bool:
        node = self.root
        for ch in word:
            if ch not in node.children: return False
            node = node.children[ch]
        return node.is_end

    def starts_with(self, prefix: str) -> bool:
        node = self.root
        for ch in prefix:
            if ch not in node.children: return False
            node = node.children[ch]
        return True"##,
            rust: r##"use std::collections::HashMap;

struct TrieNode { children: HashMap<char, TrieNode>, is_end: bool }

impl TrieNode { fn new() -> Self { Self { children: HashMap::new(), is_end: false } } }

struct Trie { root: TrieNode }

impl Trie {
    fn new() -> Self { Self { root: TrieNode::new() } }
    fn insert(&mut self, word: &str) {
        let mut node = &mut self.root;
        for ch in word.chars() { node = node.children.entry(ch).or_insert_with(TrieNode::new); }
        node.is_end = true;
    }
    fn search(&self, word: &str) -> bool {
        let mut node = &self.root;
        for ch in word.chars() { match node.children.get(&ch) { Some(n) => node = n, None => return false } }
        node.is_end
    }
    fn starts_with(&self, prefix: &str) -> bool {
        let mut node = &self.root;
        for ch in prefix.chars() { match node.children.get(&ch) { Some(n) => node = n, None => return false } }
        true
    }
}"##,
            confidence: 0.89,
            related: &["full_text_search", "hash_map"],
        },
        SeedIntent {
            name: "linked_list",
            python: r##"class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

class LinkedList:
    def __init__(self):
        self.head = None

    def push(self, val):
        self.head = Node(val, self.head)

    def pop(self):
        if not self.head: return None
        val = self.head.val
        self.head = self.head.next
        return val

    def to_list(self):
        result, node = [], self.head
        while node:
            result.append(node.val)
            node = node.next
        return result"##,
            rust: r##"struct Node<T> { val: T, next: Option<Box<Node<T>>> }

struct LinkedList<T> { head: Option<Box<Node<T>>> }

impl<T> LinkedList<T> {
    fn new() -> Self { Self { head: None } }
    fn push(&mut self, val: T) {
        self.head = Some(Box::new(Node { val, next: self.head.take() }));
    }
    fn pop(&mut self) -> Option<T> {
        self.head.take().map(|node| { self.head = node.next; node.val })
    }
}

impl<T: std::fmt::Debug> LinkedList<T> {
    fn to_vec(&self) -> Vec<&T> {
        let mut result = vec![];
        let mut current = &self.head;
        while let Some(node) = current { result.push(&node.val); current = &node.next; }
        result
    }
}"##,
            confidence: 0.89,
            related: &["stack", "lru_cache"],
        },
        SeedIntent {
            name: "stack",
            python: r##"class Stack:
    def __init__(self):
        self._data = []

    def push(self, val):
        self._data.append(val)

    def pop(self):
        if not self._data: raise IndexError("Stack is empty")
        return self._data.pop()

    def peek(self):
        if not self._data: raise IndexError("Stack is empty")
        return self._data[-1]

    def is_empty(self) -> bool:
        return len(self._data) == 0

    def __len__(self):
        return len(self._data)"##,
            rust: r##"struct Stack<T> { data: Vec<T> }

impl<T> Stack<T> {
    fn new() -> Self { Self { data: vec![] } }
    fn push(&mut self, val: T) { self.data.push(val); }
    fn pop(&mut self) -> Option<T> { self.data.pop() }
    fn peek(&self) -> Option<&T> { self.data.last() }
    fn is_empty(&self) -> bool { self.data.is_empty() }
    fn len(&self) -> usize { self.data.len() }
}"##,
            confidence: 0.90,
            related: &["linked_list", "queue_worker"],
        },
        SeedIntent {
            name: "heap",
            python: r##"import heapq

class MinHeap:
    def __init__(self):
        self._data = []

    def push(self, val):
        heapq.heappush(self._data, val)

    def pop(self):
        return heapq.heappop(self._data)

    def peek(self):
        return self._data[0] if self._data else None

    def __len__(self):
        return len(self._data)

h = MinHeap()
for x in [5, 3, 8, 1, 2]:
    h.push(x)
print([h.pop() for _ in range(5)])  # [1, 2, 3, 5, 8]"##,
            rust: r##"use std::collections::BinaryHeap;
use std::cmp::Reverse;

struct MinHeap<T: Ord> { data: BinaryHeap<Reverse<T>> }

impl<T: Ord> MinHeap<T> {
    fn new() -> Self { Self { data: BinaryHeap::new() } }
    fn push(&mut self, val: T) { self.data.push(Reverse(val)); }
    fn pop(&mut self) -> Option<T> { self.data.pop().map(|Reverse(v)| v) }
    fn peek(&self) -> Option<&T> { self.data.peek().map(|Reverse(v)| v) }
    fn len(&self) -> usize { self.data.len() }
}"##,
            confidence: 0.90,
            related: &["sort_function", "dijkstra"],
        },
        SeedIntent {
            name: "hash_map",
            python: r##"class HashMap:
    def __init__(self, capacity: int = 16):
        self.capacity = capacity
        self.buckets = [[] for _ in range(capacity)]
        self.size = 0

    def _hash(self, key) -> int:
        return hash(key) % self.capacity

    def put(self, key, value):
        idx = self._hash(key)
        for i, (k, v) in enumerate(self.buckets[idx]):
            if k == key:
                self.buckets[idx][i] = (key, value)
                return
        self.buckets[idx].append((key, value))
        self.size += 1

    def get(self, key, default=None):
        idx = self._hash(key)
        for k, v in self.buckets[idx]:
            if k == key: return v
        return default"##,
            rust: r##"struct HashMap<K, V> { buckets: Vec<Vec<(K, V)>>, capacity: usize }

impl<K: std::hash::Hash + Eq, V> HashMap<K, V> {
    fn new(capacity: usize) -> Self { Self { buckets: (0..capacity).map(|_| vec![]).collect(), capacity } }
    fn hash(&self, key: &K) -> usize {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut h);
        (h.finish() as usize) % self.capacity
    }
    fn put(&mut self, key: K, value: V) {
        let idx = self.hash(&key);
        for (k, v) in &mut self.buckets[idx] { if *k == key { *v = value; return; } }
        self.buckets[idx].push((key, value));
    }
    fn get(&self, key: &K) -> Option<&V> {
        let idx = self.hash(key);
        self.buckets[idx].iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }
}"##,
            confidence: 0.89,
            related: &["lru_cache", "bloom_filter"],
        },
        SeedIntent {
            name: "ring_buffer",
            python: r##"class RingBuffer:
    def __init__(self, capacity: int):
        self.data = [None] * capacity
        self.capacity = capacity
        self.head = 0
        self.size = 0

    def push(self, val):
        idx = (self.head + self.size) % self.capacity
        if self.size == self.capacity:
            self.head = (self.head + 1) % self.capacity
        else:
            self.size += 1
        self.data[idx] = val

    def to_list(self):
        return [self.data[(self.head + i) % self.capacity] for i in range(self.size)]

buf = RingBuffer(3)
for x in [1, 2, 3, 4, 5]:
    buf.push(x)
print(buf.to_list())  # [3, 4, 5]"##,
            rust: r##"struct RingBuffer<T: Clone + Default> {
    data: Vec<T>, head: usize, size: usize, capacity: usize,
}

impl<T: Clone + Default> RingBuffer<T> {
    fn new(capacity: usize) -> Self {
        Self { data: vec![T::default(); capacity], head: 0, size: 0, capacity }
    }
    fn push(&mut self, val: T) {
        let idx = (self.head + self.size) % self.capacity;
        if self.size == self.capacity { self.head = (self.head + 1) % self.capacity; }
        else { self.size += 1; }
        self.data[idx] = val;
    }
    fn to_vec(&self) -> Vec<T> {
        (0..self.size).map(|i| self.data[(self.head + i) % self.capacity].clone()).collect()
    }
}"##,
            confidence: 0.89,
            related: &["linked_list", "async_queue"],
        },
        SeedIntent {
            name: "skip_list",
            python: r##"import random

class SkipNode:
    def __init__(self, key: int, level: int):
        self.key = key
        self.forward = [None] * (level + 1)

class SkipList:
    def __init__(self, max_level: int = 16, p: float = 0.5):
        self.max_level = max_level
        self.p = p
        self.header = SkipNode(-1, max_level)
        self.level = 0

    def random_level(self) -> int:
        lvl = 0
        while random.random() < self.p and lvl < self.max_level:
            lvl += 1
        return lvl

    def search(self, key: int) -> bool:
        current = self.header
        for i in range(self.level, -1, -1):
            while current.forward[i] and current.forward[i].key < key:
                current = current.forward[i]
        current = current.forward[0]
        return current is not None and current.key == key"##,
            rust: r##"use rand::Rng;

struct SkipNode { key: i64, forward: Vec<Option<usize>> }
struct SkipList { nodes: Vec<SkipNode>, head: usize, level: usize, max_level: usize }

impl SkipList {
    fn new(max_level: usize) -> Self {
        let head = SkipNode { key: i64::MIN, forward: vec![None; max_level + 1] };
        Self { nodes: vec![head], head: 0, level: 0, max_level }
    }
    fn random_level(&self) -> usize {
        let mut rng = rand::thread_rng();
        let mut lvl = 0;
        while rng.gen::<f64>() < 0.5 && lvl < self.max_level { lvl += 1; }
        lvl
    }
    fn search(&self, key: i64) -> bool {
        let mut current = self.head;
        for i in (0..=self.level).rev() {
            while let Some(next) = self.nodes[current].forward[i] {
                if self.nodes[next].key < key { current = next; } else { break; }
            }
        }
        self.nodes[current].forward[0].map(|n| self.nodes[n].key == key).unwrap_or(false)
    }
}"##,
            confidence: 0.86,
            related: &["linked_list", "binary_search"],
        },
    ]
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::TritState;

    #[test]
    fn test_seed_fills_200_intents() {
        let mut net = CellNet::new();
        let (seeded, confirmed) = seed(&mut net, 300);
        assert_eq!(seeded, 200);
        assert_eq!(net.len(), 200);
        // 모든 셀이 확정 상태여야 함 (confidence >= 0.85)
        assert_eq!(confirmed, 200, "모든 시드 셀이 확정(+2) 상태여야 합니다");
    }

    #[test]
    fn test_seed_each_cell_has_two_patterns() {
        let mut net = CellNet::new();
        seed(&mut net, 300);
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
        seed(&mut net, 300);
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
        seed(&mut net, 300);
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
        seed(&mut net, 300);
        let count_first = net.len();
        // 두 번째 시드는 이미 존재하므로 추가하지 않음
        let (seeded, _) = seed(&mut net, 300);
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
        seed(&mut net, 300);
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
        seed(&mut net, 300);
        let http = net.find_by_intent("http_server").unwrap();
        let py = http.pattern_for("python").unwrap();
        assert!(py.code.contains("import") || py.code.contains("from"),
            "Python 패턴에 import 없음 ");
        let rs = http.pattern_for("rust").unwrap();
        assert!(rs.code.contains("use ") || rs.code.contains("fn "),
            "Rust 패턴에 use/fn 없음 ");
    }

    #[test]
    fn test_all_200_intents_present() {
        let expected = [
            // Original 51
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
            // New 149
            "graphql_server", "grpc_server", "cors_middleware", "file_upload",
            "static_file_server", "websocket_chat", "health_check", "pagination",
            "api_versioning", "request_logger", "response_cache", "webhook_handler",
            "sse_server", "multipart_form", "cookie_session", "oauth_handler",
            "api_key_auth", "graphql_subscription", "proxy_server", "load_balancer",
            "postgresql_client", "mongodb_client", "connection_pool", "database_migration",
            "transaction_handler", "query_builder", "key_value_store", "time_series_db",
            "full_text_search", "data_backup", "s3_client", "sqlite_wrapper",
            "data_seeder", "soft_delete", "audit_log",
            "password_hasher", "session_manager", "role_based_access", "token_refresh",
            "csrf_protection", "input_sanitizer", "ip_whitelist", "two_factor_auth",
            "certificate_pinning", "secrets_manager",
            "etl_pipeline", "batch_processor", "stream_processor", "map_reduce",
            "data_validator", "csv_to_json", "json_to_xml", "text_tokenizer",
            "html_to_markdown", "diff_calculator", "deduplicator", "aggregator",
            "data_sampler", "time_window", "bloom_filter",
            "mock_server", "test_fixture", "property_test", "benchmark",
            "coverage_report", "test_reporter", "snapshot_test", "integration_suite",
            "load_tester", "chaos_tester",
            "progress_bar", "table_formatter", "color_output", "interactive_prompt",
            "file_watcher", "hot_reloader", "dotenv_loader", "command_runner",
            "project_scaffolder", "changelog_generator",
            "tcp_client", "udp_server", "dns_resolver", "smtp_client",
            "ftp_client", "mqtt_client", "ssh_client", "http_client",
            "ping_checker", "port_scanner",
            "thread_pool", "mutex_wrapper", "channel_communication", "semaphore",
            "retry_with_backoff", "circuit_breaker", "debouncer", "throttler",
            "parallel_map", "async_queue",
            "env_config", "signal_handler", "process_manager", "system_monitor",
            "disk_usage", "network_info", "temp_file", "lockfile",
            "daemon_process", "log_rotation",
            "aes_encrypt", "rsa_keypair", "digital_signature", "hmac_auth",
            "random_generator",
            "repository_pattern", "service_layer", "dependency_injection",
            "middleware_chain", "pub_sub_system", "command_pattern", "strategy_pattern",
            "decorator_pattern", "adapter_pattern", "chain_of_responsibility",
            "yaml_parser", "ini_parser", "markdown_renderer", "zip_archive",
            "tar_archive", "base64_codec", "url_encoder", "qr_code_generator",
            "barcode_reader", "excel_reader",
            "matrix_multiply", "fibonacci", "prime_sieve", "graph_bfs",
            "graph_dfs", "dijkstra", "lru_cache", "trie", "linked_list",
            "stack", "heap", "hash_map", "ring_buffer", "skip_list",
        ];
        let mut net = CellNet::new();
        seed(&mut net, 300);
        for intent in &expected {
            assert!(
                net.find_by_intent(intent).is_some(),
                "intent {} 누락", intent
            );
        }
        assert_eq!(expected.len(), 200, "Expected list must have exactly 200 intents");
    }

    #[test]
    fn test_seed_o1_lookup_after_seed() {
        let mut net = CellNet::new();
        seed(&mut net, 300);
        // 시드 후 O(1) 조회가 작동하는지 확인
        assert_eq!(net.evaluate_intent("http_server"), TritState::Confirmed);
        assert_eq!(net.evaluate_intent("sort_function"), TritState::Confirmed);
        assert_eq!(net.evaluate_intent("nonexistent"), TritState::Unknown);
    }
}
