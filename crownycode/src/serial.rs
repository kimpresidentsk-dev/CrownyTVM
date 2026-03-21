// src/serial.rs — 자체 직렬화 (serde/bincode 대체)

use crate::error::Result;
use crate::cell::net::CellNet;
use crate::cell::{CrownyCell, TritState, Pattern, PatternSource, CellEdge, Relation};
use std::io::{Read, Write};

const MAGIC: &[u8; 4] = b"CRNY";
const VERSION: u8 = 1;

pub fn save_cellnet(net: &CellNet, path: &str) -> Result<()> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = std::fs::File::create(path)?;
    let mut w = std::io::BufWriter::new(file);

    // Header
    w.write_all(MAGIC)?;
    w.write_all(&[VERSION])?;

    let cells: Vec<&CrownyCell> = net.iter().map(|(_, c)| c).collect();
    write_u64(&mut w, cells.len() as u64)?;

    for cell in &cells {
        write_cell(&mut w, cell)?;
    }

    w.flush()?;
    Ok(())
}

pub fn load_cellnet(path: &str) -> Result<CellNet> {
    let file = std::fs::File::open(path)?;
    let mut r = std::io::BufReader::new(file);

    // Header
    let mut magic = [0u8; 4];
    r.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(crate::error::err!("잘못된 CellNet 파일 매직"));
    }
    let mut ver = [0u8; 1];
    r.read_exact(&mut ver)?;
    if ver[0] != VERSION {
        return Err(crate::error::err!("지원하지 않는 CellNet 버전: {}", ver[0]));
    }

    let cell_count = read_u64(&mut r)?;
    let mut net = CellNet::new();

    for _ in 0..cell_count {
        let cell = read_cell(&mut r)?;
        net.insert(cell);
    }

    Ok(net)
}

// ── Cell 직렬화 ──────────────────────────────────────────────

fn write_cell<W: Write>(w: &mut W, cell: &CrownyCell) -> Result<()> {
    write_u64(w, cell.id)?;
    write_string(w, &cell.intent)?;
    write_u8(w, trit_to_u8(cell.trit_state))?;
    write_f32(w, cell.energy)?;
    write_i64(w, cell.birth)?;
    write_i64(w, cell.last_activated)?;
    write_u32(w, cell.activation_count)?;
    write_u32(w, cell.refutation_count)?;

    // Patterns
    write_u32(w, cell.patterns.len() as u32)?;
    for p in &cell.patterns {
        write_string(w, &p.target_lang)?;
        write_string(w, &p.code)?;
        write_f32(w, p.confidence)?;
        write_u8(w, source_to_u8(&p.source))?;
    }

    // Edges
    write_u32(w, cell.edges.len() as u32)?;
    for e in &cell.edges {
        write_u64(w, e.target)?;
        write_u8(w, relation_to_u8(e.relation))?;
        write_i8(w, e.weight)?;
    }

    Ok(())
}

fn read_cell<R: Read>(r: &mut R) -> Result<CrownyCell> {
    let id = read_u64(r)?;
    let intent = read_string(r)?;
    let trit_state = u8_to_trit(read_u8(r)?);
    let energy = read_f32(r)?;
    let birth = read_i64(r)?;
    let last_activated = read_i64(r)?;
    let activation_count = read_u32(r)?;
    let refutation_count = read_u32(r)?;

    let pattern_count = read_u32(r)?;
    let mut patterns = Vec::with_capacity(pattern_count as usize);
    for _ in 0..pattern_count {
        let target_lang = read_string(r)?;
        let code = read_string(r)?;
        let confidence = read_f32(r)?;
        let source = u8_to_source(read_u8(r)?);
        patterns.push(Pattern { target_lang, code, confidence, source });
    }

    let edge_count = read_u32(r)?;
    let mut edges = Vec::with_capacity(edge_count as usize);
    for _ in 0..edge_count {
        let target = read_u64(r)?;
        let relation = u8_to_relation(read_u8(r)?);
        let weight = read_i8(r)?;
        edges.push(CellEdge { target, relation, weight });
    }

    // Build CrownyCell without calling new() (which generates a new id)
    Ok(CrownyCell {
        id,
        intent,
        trit_state,
        energy,
        patterns,
        edges,
        birth,
        last_activated,
        activation_count,
        refutation_count,
    })
}

// ── 기본 타입 직렬화 ──────────────────────────────────────────

fn write_u8<W: Write>(w: &mut W, v: u8) -> Result<()> {
    w.write_all(&[v])?;
    Ok(())
}

fn read_u8<R: Read>(r: &mut R) -> Result<u8> {
    let mut buf = [0u8; 1];
    r.read_exact(&mut buf)?;
    Ok(buf[0])
}

fn write_i8<W: Write>(w: &mut W, v: i8) -> Result<()> {
    w.write_all(&v.to_le_bytes())?;
    Ok(())
}

fn read_i8<R: Read>(r: &mut R) -> Result<i8> {
    let mut buf = [0u8; 1];
    r.read_exact(&mut buf)?;
    Ok(i8::from_le_bytes(buf))
}

fn write_u32<W: Write>(w: &mut W, v: u32) -> Result<()> {
    w.write_all(&v.to_le_bytes())?;
    Ok(())
}

fn read_u32<R: Read>(r: &mut R) -> Result<u32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn write_u64<W: Write>(w: &mut W, v: u64) -> Result<()> {
    w.write_all(&v.to_le_bytes())?;
    Ok(())
}

fn read_u64<R: Read>(r: &mut R) -> Result<u64> {
    let mut buf = [0u8; 8];
    r.read_exact(&mut buf)?;
    Ok(u64::from_le_bytes(buf))
}

fn write_i64<W: Write>(w: &mut W, v: i64) -> Result<()> {
    w.write_all(&v.to_le_bytes())?;
    Ok(())
}

fn read_i64<R: Read>(r: &mut R) -> Result<i64> {
    let mut buf = [0u8; 8];
    r.read_exact(&mut buf)?;
    Ok(i64::from_le_bytes(buf))
}

fn write_f32<W: Write>(w: &mut W, v: f32) -> Result<()> {
    w.write_all(&v.to_le_bytes())?;
    Ok(())
}

fn read_f32<R: Read>(r: &mut R) -> Result<f32> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf)?;
    Ok(f32::from_le_bytes(buf))
}

fn write_string<W: Write>(w: &mut W, s: &str) -> Result<()> {
    let bytes = s.as_bytes();
    write_u32(w, bytes.len() as u32)?;
    w.write_all(bytes)?;
    Ok(())
}

fn read_string<R: Read>(r: &mut R) -> Result<String> {
    let len = read_u32(r)? as usize;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    String::from_utf8(buf).map_err(|e| crate::error::err!("UTF-8 오류: {}", e))
}

// ── 열거형 매핑 ──────────────────────────────────────────────

fn trit_to_u8(t: TritState) -> u8 {
    match t {
        TritState::Confirmed => 0,
        TritState::Uncertain => 1,
        TritState::Refuted => 2,
        TritState::Unknown => 3,
    }
}

fn u8_to_trit(v: u8) -> TritState {
    match v {
        0 => TritState::Confirmed,
        1 => TritState::Uncertain,
        2 => TritState::Refuted,
        _ => TritState::Unknown,
    }
}

fn source_to_u8(s: &PatternSource) -> u8 {
    match s {
        PatternSource::Generated => 0,
        PatternSource::LearnedFromClaude => 1,
        PatternSource::UserConfirmed => 2,
        PatternSource::CommunityContributed => 3,
    }
}

fn u8_to_source(v: u8) -> PatternSource {
    match v {
        0 => PatternSource::Generated,
        1 => PatternSource::LearnedFromClaude,
        2 => PatternSource::UserConfirmed,
        3 => PatternSource::CommunityContributed,
        _ => PatternSource::Generated,
    }
}

fn relation_to_u8(r: Relation) -> u8 {
    match r {
        Relation::Related => 0,
        Relation::Refutes => 1,
        Relation::Extends => 2,
        Relation::DependsOn => 3,
    }
}

fn u8_to_relation(v: u8) -> Relation {
    match v {
        0 => Relation::Related,
        1 => Relation::Refutes,
        2 => Relation::Extends,
        3 => Relation::DependsOn,
        _ => Relation::Related,
    }
}
