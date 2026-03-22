// ═══════════════════════════════════════════════════════════════
// CrownyFoundry 통합 서버 — 포트 7731
//
// 시나리오 1: 한글 파일명 정적 서빙 (decodeURIComponent)
// 시나리오 2: /api/foundry/* 엔진 API
// 시나리오 3: /foundry/* 검증명세서 호환 API
// 시나리오 4: SSE 파이프라인 스트림
// 시나리오 5: SPA fallback (알 수 없는 경로 → index.html)
//
// 사용법: cd ~/Downloads/CrownyTVM && node foundry-gui/server-foundry.js
// ═══════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.FOUNDRY_PORT || '7731', 10);
const GUI_DIR = path.join(__dirname);

// foundry/engine/ REST API
const { handleRequest: engineHandler, memory } = require('../foundry/engine/server');

// MIME
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// JSON 응답 헬퍼
function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

// Body 파싱
function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

// ═══ 서버 ═══
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  // ★ 핵심: 한글 파일명을 위해 디코딩
  const pathname = decodeURIComponent(url.pathname);

  // ─── 1. /api/foundry/* → engine REST API ───
  if (pathname.startsWith('/api/foundry')) {
    return engineHandler(req, res);
  }

  // ─── 2. /foundry/* → 검증명세서 호환 API ───
  if (pathname.startsWith('/foundry/')) {
    return handleFoundryCompat(req, res, pathname, url);
  }

  // ─── 3. 정적 파일 서빙 ───
  serveStatic(res, pathname);
});

// ═══ 검증명세서 호환 API (/foundry/*) ═══
async function handleFoundryCompat(req, res, pathname, url) {
  // GET /foundry/health
  if (pathname === '/foundry/health') {
    return jsonRes(res, 200, { 상태: 1, 메시지: '확정', ...memory.stats() });
  }

  // POST /foundry/cell/query
  if (pathname === '/foundry/cell/query' && req.method === 'POST') {
    const body = await parseBody(req);
    const { 작업, 셀ID } = body;
    if (작업 === '읽기') {
      const cell = memory.getByName(셀ID) || memory.getCell(Number(셀ID) || 0);
      if (!cell) return jsonRes(res, 404, { 상태: -2, 오류: '셀 없음: ' + 셀ID });
      return jsonRes(res, 200, { 상태: 1, 데이터: cell });
    }
    if (작업 === '탐색') {
      const chain = memory.chain(Number(셀ID) || 0, body.깊이 || 2);
      const conns = memory.getConnections(Number(셀ID) || 0);
      return jsonRes(res, 200, { 상태: 1, 데이터: { 노드들: chain, 링크들: [], 연결: conns } });
    }
    if (작업 === '주장') {
      const cell = memory.createClaim(셀ID || 'unknown', '주장', body.값 || '', 0, 0);
      return jsonRes(res, 200, { 상태: 1, 데이터: cell });
    }
    return jsonRes(res, 404, { 상태: -2, 오류: '알 수 없는 작업: ' + 작업 });
  }

  // GET /foundry/cell/:id
  if (pathname.startsWith('/foundry/cell/') && req.method === 'GET') {
    const id = pathname.split('/')[3] || '';
    const cell = memory.getByName(id) || memory.getCell(Number(id) || 0);
    if (!cell) return jsonRes(res, 404, { 상태: -2, 오류: '셀 없음: ' + id });
    return jsonRes(res, 200, { 상태: 1, 데이터: cell });
  }

  // PUT /foundry/cell/:id/:slot
  if (pathname.startsWith('/foundry/cell/') && req.method === 'PUT') {
    const parts = pathname.split('/').filter(Boolean);
    const id = parts[2] || '';
    const slot = parseInt(parts[3] || '-1', 10);
    if (slot < 0 || slot > 26) return jsonRes(res, 400, { 상태: -1, 오류: '슬롯 범위 초과(0~26): ' + slot });
    const body = await parseBody(req);
    let cell = memory.getByName(id);
    if (!cell) cell = memory.createValue(id, 0, 0);
    const updated = memory.updateCell(cell.id, { content: body.값 ?? body.value ?? '' });
    return jsonRes(res, 200, { 상태: 1, 데이터: updated });
  }

  // POST /foundry/pipeline/run
  if (pathname === '/foundry/pipeline/run' && req.method === 'POST') {
    const body = await parseBody(req);
    return jsonRes(res, 200, { 상태: 0, 파이프라인ID: body.파이프라인ID, 메시지: '실행 시작' });
  }

  // GET /foundry/pipeline/stream (SSE)
  if (pathname === '/foundry/pipeline/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const stats = memory.stats();
    res.write(`event: 상태갱신\ndata: ${JSON.stringify({ id: 'foundry', 상태: 1, 셀수: stats.totalCells })}\n\n`);
    const iv = setInterval(() => {
      res.write(`event: 상태갱신\ndata: ${JSON.stringify({ id: 'heartbeat', 상태: 1, t: Date.now() })}\n\n`);
    }, 3000);
    req.on('close', () => clearInterval(iv));
    return;
  }

  // GET /foundry/analysis/kps
  if (pathname.startsWith('/foundry/analysis/kps')) {
    const symbol = url.searchParams.get('symbol') || 'SOL';
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const data = Array.from({ length: limit }, (_, i) => ({
      close: 100 + Math.sin(i * 0.3) * 10 + i * 0.3 + (Math.random() - 0.5) * 2,
    }));
    return jsonRes(res, 200, { 상태: 1, 심볼: symbol, 데이터: data });
  }

  // 그 외 /foundry/* → 404
  return jsonRes(res, 404, { 상태: -2, 오류: '경로 없음: ' + pathname });
}

// ═══ 정적 파일 서빙 ═══
function serveStatic(res, pathname) {
  let filePath = path.join(GUI_DIR, pathname === '/' ? 'index.html' : pathname);

  // 보안: GUI_DIR 밖으로 나가지 못하게
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(GUI_DIR))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // 파일 존재 확인
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: HTML 요청이면 index.html, 아니면 404
    const ext = path.extname(pathname);
    if (ext && ext !== '.html') {
      res.writeHead(404);
      return res.end('Not Found: ' + pathname);
    }
    filePath = path.join(GUI_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

// ═══ 일간 백업 ═══
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
function dailyBackup() {
  const src = path.join(__dirname, '..', 'data', 'foundry', 'memory.json');
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const dst = path.join(BACKUP_DIR, `${date}.json`);
  if (fs.existsSync(dst)) return; // 오늘 이미 백업됨
  fs.copyFileSync(src, dst);
  // 30일 이전 삭제
  const files = fs.readdirSync(BACKUP_DIR).sort();
  while (files.length > 30) { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); }
  console.log(`  백업: ${dst}`);
}
// 시작 시 + 매 6시간마다
dailyBackup();
setInterval(dailyBackup, 6 * 3600 * 1000);

// ═══ 로그 로테이션 (#78) ═══
const AUDIT_DIR = path.join(__dirname, '..', 'data', 'audit');
function rotateAuditLogs() {
  if (!fs.existsSync(AUDIT_DIR)) return;
  const files = fs.readdirSync(AUDIT_DIR).filter(f => f.endsWith('.log')).sort();
  while (files.length > 90) { // 90일 보관
    fs.unlinkSync(path.join(AUDIT_DIR, files.shift()));
  }
}
rotateAuditLogs();
setInterval(rotateAuditLogs, 24 * 3600 * 1000);

// ═══ IP 화이트리스트 (#73) ═══
const IP_WHITELIST = process.env.CROWNY_IP_WHITELIST ? process.env.CROWNY_IP_WHITELIST.split(',') : null;

// ═══ 서버 시작 ═══

// HTTPS 자체서명 지원 (#71)
const https = require('https');
const crypto = require('crypto');

let actualServer = server;
if (process.env.CROWNY_HTTPS === 'self') {
  try {
    const certDir = path.join(__dirname, '..', 'data', 'certs');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const keyPath = path.join(certDir, 'self-key.pem');
    const certPath = path.join(certDir, 'self-cert.pem');

    if (!fs.existsSync(keyPath)) {
      // 자체서명 인증서 생성 (openssl 없이 Node.js로)
      const { execSync } = require('child_process');
      execSync(`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/CN=CrownyCore"`, { stdio: 'ignore' });
      console.log('  자체서명 인증서 생성');
    }

    actualServer = https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }, server._events?.request || server.listeners('request')[0]);
    console.log('  HTTPS 모드 (자체서명)');
  } catch (e) {
    console.warn('  HTTPS 실패, HTTP로 전환:', e.message);
    actualServer = server;
  }
}

actualServer.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════`);
  console.log(`  CrownyCore v1.0`);
  console.log(`  GUI:  http://localhost:${PORT}/`);
  console.log(`  API:  http://localhost:${PORT}/api/foundry/`);
  console.log(`═══════════════════════════════════════════`);
});
