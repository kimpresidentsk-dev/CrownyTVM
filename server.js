/* ═══════════════════════════════════════════════════════════════
 * CrownyOS Platform Server
 *
 * 회원가입 → 아이디@crowny.org → 셀 생성 → 앱 활성화
 *
 * 온톨로직 원리:
 *   회원 = 셀 (TY_사람, ●미확인)
 *   이메일 인증 = 근거1
 *   프로필 완성 = 근거2
 *   첫 친구 연결 = 근거3 → ▲자동확정
 *   연락처 = 시냅스 (사람→사람)
 *   메시지 = 셀 체인
 *   퀴즈 통과 = 지식 셀 근거
 *   지갑 거래 = 재정 셀
 *
 * 사용법: node server.js
 * ═══════════════════════════════════════════════════════════════ */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const pathModule = require('path');
const { URL } = require('url');

const { execFile } = require('child_process');

const https = require('https');

// 독립 메일 서버 (한선씨 고유코드 · 4상균형3진법)
let mailServer = null;
try {
    mailServer = require('./mail-server/index');
} catch (e) {
    console.warn('[MAIL] 독립 메일 서버 로드 실패:', e.message);
}

// 독립 메신저 (WebSocket + 파일 저장)
let chatServer = null;
try {
    chatServer = require('./chat-server/index');
} catch (e) {
    console.warn('[CHAT] 독립 메신저 로드 실패:', e.message);
}

const PORT = 7730;
const DATA_DIR = './data';
const DOMAIN = 'crowny.org';
const PUBLIC_DIR = pathModule.join(__dirname, 'public');
const CROWNYBUS_API = 'https://crownybus.com';
const ADMIN_USERS = ['kps', 'alice', 'admin'];  // 관리자 아이디 목록
const SOCIAL_DIR = pathModule.join(__dirname, 'social-data');
if (!fs.existsSync(SOCIAL_DIR)) fs.mkdirSync(SOCIAL_DIR, { recursive: true });
const WALLET_CAP_BASIC = 1000;  // 기본사용자 CRM 보관 한도
const DAILY_QUIZ_REWARD_CAP = 27;  // 하루 최대 퀴즈 보상 CRM
const CROWNY_BIN = pathModule.join(__dirname, 'target/release/crowny');
const STD_DIR = pathModule.join(__dirname, 'std');
const EXAMPLES_DIR = pathModule.join(__dirname, 'examples');
const TMP_DIR = pathModule.join(DATA_DIR, 'tmp');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ═══ 한선씨 VM 실행 헬퍼 ═══
function runHanSeon(code, command = 'run', timeout = 5000) {
    return new Promise((resolve) => {
        const tmpFile = pathModule.join(TMP_DIR, `hs_${crypto.randomBytes(6).toString('hex')}.han`);
        fs.writeFileSync(tmpFile, code, 'utf8');
        execFile(CROWNY_BIN, [command, tmpFile], {
            encoding: 'utf8', timeout, maxBuffer: 1024 * 512,
            cwd: __dirname
        }, (err, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch(e) {}
            if (err) {
                if (err.killed) resolve({ output: '', error: '실행 시간 초과 (5초)', timeout: true });
                else resolve({ output: stdout || '', error: stderr || err.message });
            } else {
                resolve({ output: stdout || '', error: stderr || null });
            }
        });
    });
}

// ═══ CrownyBus.com API 브릿지 ═══
function crownyBusAPI(method, path, body = null, busToken = null) {
    return new Promise((resolve) => {
        const url = new URL(path, CROWNYBUS_API);
        const postData = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname, port: 443, path: url.pathname + url.search,
            method, headers: { 'Content-Type': 'application/json' },
            timeout: 8000,
        };
        if (busToken) opts.headers['Authorization'] = 'Bearer ' + busToken;
        if (postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: res.statusCode, data: { raw: data } }); }
            });
        });
        req.on('error', e => resolve({ status: 0, data: { error: e.message } }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: { error: '타임아웃' } }); });
        if (postData) req.write(postData);
        req.end();
    });
}

// ═══ CrownyBus 동기화 시스템 ═══
// 통화 매핑: CrownyTVM ↔ CrownyBus
const BUS_CURRENCY = { 'CRN': 'CRN', 'FNC': 'FNC', 'CRM': 'CRM' };
const LOCAL_CURRENCY = { 'CRN': 'CRN', 'FNC': 'FNC', 'CRM': 'CRM' };

let busStatus = { connected: false, lastSync: null, error: null };
async function syncBusStatus() {
    try {
        const r = await crownyBusAPI('GET', '/v2/features/my');
        busStatus = { connected: r.status === 200 || r.status === 401, lastSync: Date.now(), error: r.status === 0 ? r.data.error : null };
    } catch(e) { busStatus = { connected: false, lastSync: Date.now(), error: e.message }; }
}
setTimeout(syncBusStatus, 2000);
setInterval(syncBusStatus, 60000);

// ── 동기화 큐 (실패 시 재시도) ──
const SYNC_QUEUE_FILE = pathModule.join(DATA_DIR, 'bus_sync_queue.json');
let syncQueue = loadJSON('bus_sync_queue.json', []);

function enqueueBusSync(action, payload, username) {
    syncQueue.push({ id: crypto.randomBytes(4).toString('hex'), action, payload, username, created: Date.now(), retries: 0, lastError: null });
    saveJSON('bus_sync_queue.json', syncQueue);
}

async function processSyncQueue() {
    if (syncQueue.length === 0) return;
    const pending = syncQueue.filter(q => q.retries < 5);
    let changed = false;

    for (const item of pending) {
        const user = users[item.username];
        if (!user || !user.busToken) { item.retries++; item.lastError = 'busToken 없음'; changed = true; continue; }

        let result;
        try {
            if (item.action === 'transfer') {
                result = await crownyBusAPI('POST', '/v2/transfer', item.payload, user.busToken);
            } else if (item.action === 'dex_swap') {
                result = await crownyBusAPI('POST', '/v2/dex_swap', item.payload, user.busToken);
            } else if (item.action === 'register') {
                result = await crownyBusAPI('POST', '/v2/auth/register', item.payload);
            } else if (item.payload?.path && item.payload?.method) {
                // Generic cloud push (chat_send, contact_add, quiz_submit, etc.)
                result = await crownyBusAPI(item.payload.method, item.payload.path, item.payload.body, user.busToken);
            }

            if (result && (result.status === 200 || result.status === 201)) {
                // 성공 — 큐에서 제거
                syncQueue = syncQueue.filter(q => q.id !== item.id);
                changed = true;
                console.log(`[BUS 동기화] ${item.action} 성공: ${item.username}`);
            } else {
                item.retries++;
                item.lastError = JSON.stringify(result?.data || 'unknown').slice(0, 200);
                changed = true;
                console.log(`[BUS 동기화] ${item.action} 실패 (${item.retries}/5): ${item.lastError}`);
            }
        } catch(e) {
            item.retries++;
            item.lastError = e.message;
            changed = true;
        }
    }

    // 5회 초과 실패 항목 정리 (로그 보존)
    const expired = syncQueue.filter(q => q.retries >= 5);
    if (expired.length > 0) {
        const failLog = loadJSON('bus_sync_failed.json', []);
        failLog.push(...expired);
        saveJSON('bus_sync_failed.json', failLog);
        syncQueue = syncQueue.filter(q => q.retries < 5);
        changed = true;
    }

    if (changed) saveJSON('bus_sync_queue.json', syncQueue);
}

// 30초마다 큐 처리
setInterval(processSyncQueue, 30000);
// 시작 5초 후 첫 처리
setTimeout(processSyncQueue, 5000);

// ── 1단계: 계정 연동 ──
async function busRegister(username, password, email, displayName) {
    const r = await crownyBusAPI('POST', '/v2/auth/register', {
        email, password, displayName: displayName || username
    });
    if (r.status === 200 || r.status === 201) {
        const token = r.data?.data?.token || r.data?.token;
        if (token) {
            users[username].busToken = token;
            users[username].busLinked = true;
            users[username].busLinkedAt = Date.now();
            saveJSON('users.json', users);
            console.log(`[BUS] 계정 연동 완료: ${username}`);
            return { success: true, busToken: token };
        }
    }
    // 실패 시 큐에 추가
    enqueueBusSync('register', { email, password, displayName }, username);
    return { success: false, error: r.data?.error || '연결 실패', queued: true };
}

async function busLogin(username, password, email) {
    const r = await crownyBusAPI('POST', '/v2/auth/login', { email, password });
    if (r.status === 200 || r.status === 201) {
        const token = r.data?.data?.token || r.data?.token;
        if (token) {
            users[username].busToken = token;
            users[username].busLinked = true;
            users[username].busLinkedAt = Date.now();
            users[username].busTokenExpires = Date.now() + 86400000; // 24h
            saveJSON('users.json', users);
            console.log(`[BUS] 로그인 연동: ${username}`);
            return { success: true, busToken: token };
        }
    }
    return { success: false, error: r.data?.error || '연결 실패' };
}

// ── 토큰 갱신 ──
async function refreshBusToken(username) {
    const user = users[username];
    if (!user?.busToken) return false;
    const r = await crownyBusAPI('POST', '/v2/auth/refresh', { token: user.busToken });
    if (r.status === 200 || r.status === 201) {
        const newToken = r.data?.data?.token || r.data?.token;
        if (newToken) {
            user.busToken = newToken;
            user.busTokenExpires = Date.now() + 86400000;
            saveJSON('users.json', users);
            return true;
        }
    }
    return false;
}

// ── 유효 토큰 확보 ──
async function ensureBusToken(username) {
    const user = users[username];
    if (!user?.busToken) return null;
    if (user.busTokenExpires && user.busTokenExpires < Date.now() + 600000) {
        await refreshBusToken(username);
    }
    return user.busToken;
}

// ── 2단계: 지갑 원장 동기화 ──
function syncTransfer(username, currency, amount, toAddress, memo) {
    const busAsset = BUS_CURRENCY[currency] || currency;
    const user = users[username];
    const fromAddr = user?.walletAddress || username;
    enqueueBusSync('transfer', {
        asset: busAsset, from: fromAddr, to: toAddress || 'treasury',
        amount, memo: memo || `CrownyTVM sync`
    }, username);
}

function syncSwap(username, fromCurrency, toCurrency, fromAmount) {
    const busFrom = BUS_CURRENCY[fromCurrency] || fromCurrency;
    const busTo = BUS_CURRENCY[toCurrency] || toCurrency;
    const user = users[username];
    enqueueBusSync('dex_swap', {
        trader: user?.walletAddress || username,
        fromAsset: busFrom, toAsset: busTo, fromAmount
    }, username);
}

// ═══ iCloud 동기화 패턴 ═══
// CrownyBus = iCloud (클라우드 마스터)
// CrownyTVM = iPhone (로컬 클라이언트)
// 원칙: 로컬 즉시 처리 → 클라우드 비동기 푸시 → 주기적 풀

// ── Cloud Push: 로컬 → CrownyBus ──
async function cloudPush(username, action, method, path, body) {
    const token = await ensureBusToken(username);
    if (!token) {
        enqueueBusSync(action, { method, path, body }, username);
        return { queued: true };
    }
    const r = await crownyBusAPI(method, path, body, token);
    if (r.status === 401) {
        const refreshed = await refreshBusToken(username);
        if (refreshed) {
            const r2 = await crownyBusAPI(method, path, body, users[username].busToken);
            if (r2.status >= 200 && r2.status < 300) {
                console.log(`[CLOUD↑] ${action} 성공: ${username}`);
                return r2;
            }
        }
        enqueueBusSync(action, { method, path, body }, username);
        return { queued: true };
    }
    if (r.status >= 200 && r.status < 300) {
        console.log(`[CLOUD↑] ${action} 성공: ${username}`);
        return r;
    }
    enqueueBusSync(action, { method, path, body }, username);
    return { queued: true };
}

// ── Cloud Pull: CrownyBus → 로컬 ──
async function cloudPull(username) {
    const token = await ensureBusToken(username);
    if (!token) return { error: 'busToken 없음' };
    const results = { contacts: 0, chats: 0, wallet: null, quiz: null };

    // 1. Pull 연락처
    try {
        const r = await crownyBusAPI('GET', '/v2/contacts', null, token);
        if (r.status === 200 && r.data?.data) {
            const cloudContacts = Array.isArray(r.data.data) ? r.data.data : [];
            cloudContacts.forEach(cc => {
                const existing = findCellsByOwner(username, TY.CONTACT).find(c => c.name === cc.displayName || c.name === cc.username);
                if (!existing) {
                    const nc = createCell(cc.displayName || cc.username, TY.CONTACT, 0, username);
                    nc.phone = cc.phone || '';
                    nc.email = cc.email || '';
                    nc.cloudId = cc.pub_key || cc.id;
                    nc.source = 'cloud';
                    results.contacts++;
                }
            });
        }
    } catch(e) { console.log('[CLOUD↓] 연락처 풀 실패:', e.message); }

    // 2. Pull 채팅 목록
    try {
        const r = await crownyBusAPI('GET', '/v2/chat/list', null, token);
        if (r.status === 200 && r.data?.data) {
            const cloudChats = Array.isArray(r.data.data) ? r.data.data : [];
            cloudChats.forEach(chat => {
                // cloud 채팅 메시지 가져오기
                cloudPullChatMessages(username, chat.chat_id, token).catch(() => {});
                results.chats++;
            });
        }
    } catch(e) { console.log('[CLOUD↓] 채팅 풀 실패:', e.message); }

    // 3. Pull 지갑 잔액
    try {
        const pubKey = users[username]?.walletAddress || username;
        const r = await crownyBusAPI('GET', `/v2/balance/${pubKey}`, null, token);
        if (r.status === 200 && r.data?.data) {
            results.wallet = r.data.data;
            // cloud 잔액을 로컬에 메타데이터로 저장 (로컬 잔액과 별도)
            users[username].cloudBalance = r.data.data;
            saveJSON('users.json', users);
        }
    } catch(e) { console.log('[CLOUD↓] 지갑 풀 실패:', e.message); }

    // 4. Pull 퀴즈 상태
    try {
        const r = await crownyBusAPI('GET', '/v2/bible/quiz/today', null, token);
        if (r.status === 200 && r.data?.data) {
            results.quiz = r.data.data;
            users[username].cloudQuizState = r.data.data;
            saveJSON('users.json', users);
        }
    } catch(e) { console.log('[CLOUD↓] 퀴즈 풀 실패:', e.message); }

    users[username].lastCloudPull = Date.now();
    saveJSON('users.json', users);
    console.log(`[CLOUD↓] 풀 완료: ${username} — 연락처+${results.contacts} 채팅+${results.chats}`);
    return results;
}

async function cloudPullChatMessages(username, chatId, token) {
    const r = await crownyBusAPI('GET', `/v2/chat/${chatId}/messages?limit=50`, null, token);
    if (r.status === 200 && r.data?.data) {
        const msgs = Array.isArray(r.data.data) ? r.data.data : [];
        msgs.forEach(cm => {
            // 이미 있는 메시지면 스킵 (cloudId로 중복 체크)
            const existing = cells.find(c => c.type === TY.MESSAGE && c.cloudId === cm.id);
            if (!existing) {
                const msg = createCell((cm.content || '').slice(0, 100), TY.MESSAGE, Date.now(), username);
                msg.from = cm.sender || '';
                msg.to = username;
                msg.content = cm.content || '';
                msg.read = true;
                msg.cloudId = cm.id;
                msg.cloudChatId = chatId;
                msg.source = 'cloud';
            }
        });
        saveCells();
    }
}

// ── 주기적 풀 (5분마다) ──
const CLOUD_PULL_INTERVAL = 300000; // 5분
setInterval(async () => {
    for (const [username, user] of Object.entries(users)) {
        if (user.busToken && user.busLinked) {
            const lastPull = user.lastCloudPull || 0;
            if (Date.now() - lastPull >= CLOUD_PULL_INTERVAL) {
                try { await cloudPull(username); } catch(e) {}
            }
        }
    }
}, 60000); // 1분마다 체크, 5분 간격으로 실행

// ═══ 서버 모니터링 ═══
const serverStartTime = Date.now();
function getServerStatus() {
    const uptime = Date.now() - serverStartTime;
    const memUsage = process.memoryUsage();
    return {
        uptime,
        uptimeStr: `${Math.floor(uptime/3600000)}h ${Math.floor((uptime%3600000)/60000)}m`,
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
            heap: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        },
        services: {
            mail: { name: '메일서버', status: 'online', info: `${DOMAIN} 웹메일 (${cells.filter(c => c.type === TY_MAIL).length}통)` },
            cloud: { name: '클라우드 동기화', status: busStatus.connected ? 'online' : 'offline', info: busStatus.connected ? 'iCloud 패턴 활성' : '오프라인 모드' },
            blockchain: { name: '블록체인', status: busStatus.connected ? 'online' : 'offline', info: busStatus.connected ? 'crownybus.com 연결됨' : (busStatus.error || '미연결') },
            wallet: { name: '지갑서버', status: 'online', info: `3통화 (CRN/FNC/CRM)` },
            chat: { name: '채팅서버', status: 'online', info: `${cells.filter(c => c.type === TY.MESSAGE).length}건` },
            contacts: { name: '연락처서버', status: 'online', info: `${cells.filter(c => c.type === TY.CONTACT).length}건` },
            hanseon: { name: '한선씨VM', status: fs.existsSync(CROWNY_BIN) ? 'online' : 'offline', info: fs.existsSync(CROWNY_BIN) ? 'ISA729 준비' : '바이너리 없음' },
            quiz: { name: '퀴즈서버', status: BIBLE_QUIZ.length > 0 ? 'online' : 'offline', info: `${BIBLE_QUIZ.length}문항` },
        },
        stats: {
            users: Object.keys(users).length,
            cells: cells.length,
            messages: cells.filter(c => c.type === TY.MESSAGE).length,
            contacts: cells.filter(c => c.type === TY.CONTACT).length,
            transactions: cells.filter(c => c.type === TY.TRANSACTION).length,
            quizAnswered: cells.filter(c => c.type === TY.QUIZ_SCORE).length,
        },
        crownybus: busStatus,
        syncQueue: { pending: syncQueue.length, processing: syncQueue.filter(q => q.retries > 0).length },
        busLinkedUsers: Object.values(users).filter(u => u.busLinked).length,
    };
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.han': 'text/plain; charset=utf-8',
};

// ═══ 데이터 저장 (JSON 파일 기반, 나중에 crowny.db로 전환) ═══

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, def = {}) {
    const p = `${DATA_DIR}/${file}`;
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return def;
}

function saveJSON(file, data) {
    fs.writeFileSync(`${DATA_DIR}/${file}`, JSON.stringify(data, null, 2));
}

// YouTube ID 추출
function extractYoutubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

// ═══ 온톨로직 셀 엔진 (서버 사이드) ═══

const PHASE = { CONFIRMED: 2, PENDING: 0, REFUTED: -2, UNKNOWN: -1 };
const TY = {
    PERSON: 300, FAMILY: 301, ORG: 302, PROJECT: 303,
    TODO: 305, DONATION: 307, HEALTH: 309, KNOWLEDGE: 310,
    PRAYER: 312, MESSAGE: 400, CONTACT: 401, QUIZ_SCORE: 402,
    WALLET: 403, TRANSACTION: 404, EMAIL: 405,
    // 프로젝트 관리 (OmniPlan/OmniFocus/OmniOutline)
    PM_PROJECT: 500, PM_TASK: 501, PM_MILESTONE: 502,
    PM_OUTLINE: 503, PM_CONTEXT: 504, PM_INBOX: 505,
};

let cells = loadJSON('cells.json', []);
let nextId = cells.length > 0 ? Math.max(...cells.map(c => c.id)) + 1 : 1;

function createCell(name, type, value = 0, owner = null) {
    const cell = {
        id: nextId++,
        name, type, value, owner,
        state: PHASE.PENDING,
        trust: 0, evidence: 0, tag: 0,
        links: [], created: Date.now(), modified: Date.now(),
    };
    cells.push(cell);
    saveCells();
    return cell;
}

function findCell(id) { return cells.find(c => c.id === id); }
function findCellsByOwner(owner, type = null) {
    return cells.filter(c => c.owner === owner && (type === null || c.type === type));
}

function addEvidence(cellId) {
    const cell = findCell(cellId);
    if (!cell) return null;
    cell.evidence++;
    cell.modified = Date.now();
    const effective = cell.evidence - cell.tag;
    if (effective >= 3 && cell.state === PHASE.PENDING) {
        cell.state = PHASE.CONFIRMED;
        cell.trust = 100;
        // 신뢰 전파
        propagatePositive(cellId);
    }
    saveCells();
    return cell;
}

function connectCells(fromId, toId, rel = 0) {
    const from = findCell(fromId);
    if (!from) return;
    if (from.links.find(l => l.target === toId)) return;
    from.links.push({ target: toId, rel, created: Date.now() });
    from.modified = Date.now();
    // 신뢰 전파
    const to = findCell(toId);
    if (from.state === PHASE.CONFIRMED && to && to.state === PHASE.PENDING) {
        to.trust = Math.min(100, to.trust + 20);
    }
    saveCells();
}

function propagatePositive(cellId, depth = 0, boost = 20, visited = new Set()) {
    if (depth > 3 || boost <= 0) return;
    visited.add(cellId);
    const cell = findCell(cellId);
    if (!cell) return;
    cell.links.forEach(l => {
        if (visited.has(l.target)) return;
        const target = findCell(l.target);
        if (target && target.state === PHASE.PENDING) {
            target.trust = Math.min(100, target.trust + boost);
        }
        propagatePositive(l.target, depth + 1, Math.floor(boost / 2), visited);
    });
}

function saveCells() { saveJSON('cells.json', cells); }

// ═══ 사용자 관리 ═══

let users = loadJSON('users.json', {});

function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw + 'crowny_salt_2026').digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

const SESSIONS_FILE = pathModule.join(DATA_DIR, 'sessions.json');
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch(e) {}
function saveSessions() { try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions)); } catch(e) {} }

// ═══ 256비트 균형3진법 지갑주소 생성 ═══
// 256비트 → 162트릿 (3^162 > 2^256), 표기: T(+1), 0(0), N(-1)
function generateWalletAddress(username) {
    const hash = crypto.createHash('sha256').update(username + ':crowny:' + Date.now()).digest();
    const trits = [];
    for (let i = 0; i < hash.length; i++) {
        let byte = hash[i];
        // Convert each byte to ~5 balanced trits
        for (let j = 0; j < 5 && trits.length < 162; j++) {
            const rem = byte % 3;
            byte = Math.floor(byte / 3);
            trits.push(rem === 0 ? '0' : rem === 1 ? 'T' : 'N');
        }
    }
    while (trits.length < 162) trits.push('0');
    // Format: CRW + 54 chars (groups of 9 trits = 1 word)
    const addr = 'CRW' + trits.slice(0, 54).join('');
    return addr;
}

function createUser(username, password, displayName) {
    if (users[username]) return { error: '이미 존재하는 아이디입니다' };
    if (!/^[a-z0-9._-]{2,20}$/.test(username)) return { error: '아이디: 영문소문자/숫자/._- 2~20자' };

    const email = `${username}@${DOMAIN}`;

    // 사용자 데이터
    const walletAddress = generateWalletAddress(username);
    users[username] = {
        username,
        email,
        password: hashPassword(password),
        displayName: displayName || username,
        walletAddress,
        created: Date.now(),
        verified: false,
        cellId: null,
    };

    // 셀 생성 (●미확인 — 이메일 인증/프로필/친구 연결로 확정)
    const cell = createCell(displayName || username, TY.PERSON, 0, username);
    users[username].cellId = cell.id;

    // 이메일 셀 연결
    const emailCell = createCell(email, TY.EMAIL, 0, username);
    connectCells(cell.id, emailCell.id, 5);

    // 지갑 셀 자동 생성
    const walletCell = createCell(`${username}_wallet`, TY.WALLET, 0, username);
    connectCells(cell.id, walletCell.id, 2);

    saveJSON('users.json', users);

    // 실제 메일박스 생성 (Postfix/Dovecot 설치된 경우)
    try {
        const { execSync } = require('child_process');
        execSync(`crowny-mailbox create ${username} ${password}`, { timeout: 5000 });
        console.log(`[메일] ${email} 메일박스 생성 완료`);
    } catch (e) {
        console.log(`[메일] 메일박스 생성 건너뜀 (Postfix 미설치): ${e.message.split('\n')[0]}`);
    }

    // CrownyBus.com 계정 연동 (비동기, 실패 시 큐)
    busRegister(username, password, email, displayName).catch(() => {});

    return {
        success: true,
        username,
        email,
        cellId: cell.id,
        walletAddress,
        message: `${email} 생성 완료. 이메일 인증하면 근거+1.`
    };
}

function loginUser(username, password) {
    // 이메일로 로그인 시 username 추출: "user@crowny.org" → "user"
    if (username && username.includes('@')) username = username.split('@')[0];
    const user = users[username];
    if (!user || user.password !== hashPassword(password))
        return { error: '아이디 또는 비밀번호가 틀렸습니다' };

    const token = generateToken();
    sessions[token] = { username, created: Date.now() };
    saveSessions();

    // CrownyBus.com 로그인 연동 (비동기, busToken 갱신)
    if (!user.busToken || !user.busLinked) {
        busLogin(username, password, user.email).then(() => {
            // 로그인 성공 시 클라우드 풀 (iPhone 잠금해제 → iCloud 동기화)
            cloudPull(username).catch(() => {});
        }).catch(() => {});
    } else {
        // 이미 연동된 경우에도 풀 실행
        cloudPull(username).catch(() => {});
    }

    return { success: true, token, username, email: user.email, displayName: user.displayName || username, photoURL: user.photoURL || '', cellId: user.cellId, busLinked: !!user.busLinked };
}

function verifyEmail(username) {
    const user = users[username];
    if (!user || user.verified) return { error: '이미 인증됨' };
    user.verified = true;
    addEvidence(user.cellId);  // 이메일 인증 = 근거1
    saveJSON('users.json', users);
    const cell = findCell(user.cellId);
    return { success: true, evidence: cell.evidence, state: cell.state === 2 ? '확정' : '미확인' };
}

function getUser(token) {
    const session = sessions[token];
    if (!session) return null;
    return users[session.username] || null;
}

// ═══ 연락처 앱 ═══

function addContact(ownerUsername, contactName, phone, relation, extra = {}) {
    const owner = users[ownerUsername];
    if (!owner) return { error: '사용자 없음' };

    const contact = createCell(contactName, TY.CONTACT, 0, ownerUsername);
    contact.phone = phone;
    contact.email = extra.email || '';
    contact.company = extra.company || '';
    contact.position = extra.position || '';
    contact.address = extra.address || '';
    contact.birthday = extra.birthday || '';
    contact.group = extra.group || '';  // 그룹: 가족, 친구, 직장, 고객 등
    contact.notes = extra.notes || '';
    contact.tags = extra.tags || [];    // 태그 배열
    contact.crownyUsername = extra.crownyUsername || '';  // 크라우니 아이디 연동
    contact.lastContact = null;         // 마지막 연락일
    connectCells(owner.cellId, contact.id, relation || 0);
    contact.value = phone ? phone.replace(/\D/g, '') : 0;
    saveCells();

    // ── iCloud Push: 연락처 → CrownyBus ──
    cloudPush(ownerUsername, 'contact_add', 'POST', '/v2/contacts/request', {
        pub_key: contactName, display_name: contactName, phone, email: extra.email || ''
    }).catch(() => {});

    return { success: true, contactId: contact.id, name: contactName };
}

function getContacts(username) {
    return findCellsByOwner(username, TY.CONTACT)
        .filter(c => !c.deleted)
        .map(c => ({
            ...c,
            isUser: !!users[c.name],  // 플랫폼 등록 사용자 여부
        }));
}

// ═══ 메신저 앱 ═══

function sendMessage(fromUsername, toUsername, content, crmmAmount = 0) {
    const from = users[fromUsername];
    const to = users[toUsername];
    if (!from || !to) return { error: '사용자 없음' };

    // CRM tip if specified
    if (crmmAmount > 0) {
        const wallet = getWallet(fromUsername);
        if ((wallet.balances.CRM || 0) < crmmAmount) return { error: 'CRM 잔액 부족' };
        // Process the tip transfer
        walletTransact(fromUsername, 'send', crmmAmount, toUsername, `맘 선물: ${content.slice(0, 20)}`, 'CRM');
    }

    const msg = createCell(content.slice(0, 100), TY.MESSAGE, Date.now(), fromUsername);
    msg.from = fromUsername;
    msg.to = toUsername;
    msg.content = content;
    msg.read = false;
    msg.crmmTip = crmmAmount || 0;

    connectCells(from.cellId, msg.id, 6);

    saveCells();

    // ── iCloud Push: 채팅 → CrownyBus ──
    cloudPush(fromUsername, 'chat_send', 'POST', '/v2/chat/send', {
        chat_id: `${[fromUsername, toUsername].sort().join('_')}`,
        content, msg_type: 'text'
    }).catch(() => {});

    return { success: true, messageId: msg.id, from: fromUsername, to: toUsername, crmmTip: crmmAmount };
}

function getMessages(username, withUser = null) {
    return cells.filter(c =>
        c.type === TY.MESSAGE &&
        (c.from === username || c.to === username) &&
        (withUser === null || c.from === withUser || c.to === withUser)
    ).sort((a, b) => a.created - b.created);
}

function markRead(messageId, username) {
    const msg = findCell(messageId);
    if (!msg || msg.to !== username) return { error: '권한 없음' };
    msg.read = true;
    msg.modified = Date.now();
    // 읽음 = 확정 (메시지가 전달되었다는 근거)
    addEvidence(messageId);
    saveCells();
    return { success: true };
}

// ═══ 바이블퀴즈 앱 (20,000문항 4지선다) ═══
// quiz_20k.json: {i, c(카테고리), d(도메인), l(난이도1-3), q(질문), o[4](선택지), a(정답0-3), r(성경참조)}
// 라운드: 27문제 → 18+ 정답 시 1 CRM 보상 (3진 진행: 27→81→243→729)

const QUIZ_FILE = pathModule.join(DATA_DIR, 'quiz_20k.json');
let BIBLE_QUIZ = [];
try { BIBLE_QUIZ = JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8')); } catch(e) { console.log('퀴즈 데이터 없음:', e.message); }

const CATEGORY_NAMES = { A:'성경 인물', B:'성경 사건', C:'성경 장소', D:'성품/덕목', E:'지혜/잠언', F:'역사/문화', G:'윤리/정의', H:'리더십', I:'적용/실천', N:'성경 숫자', X:'참/거짓' };
const DOMAIN_NAMES = { SP:'영성', HU:'인문학', LW:'법/정의', SV:'주권/통치', HI:'역사', LD:'리더십' };
const ROUND_SIZE = 27;  // 3^3
const PASS_THRESHOLD = 18; // 2/3 of 27

function getQuizState(username) {
    const stateCells = findCellsByOwner(username, TY.QUIZ_SCORE);
    const totalCorrect = stateCells.filter(c => c.correct).length;
    const answeredIds = new Set(stateCells.map(c => c.value));
    // Current round: how many in current round of 27
    const roundAnswered = stateCells.length % ROUND_SIZE;
    const roundCorrect = stateCells.slice(-roundAnswered || stateCells.length).filter(c => c.correct).length;
    const roundsCompleted = Math.floor(stateCells.length / ROUND_SIZE);
    // Level: L1(base), L2(100 CRM cumulative), L3(300), L4(900)
    const crmEarned = roundsCompleted; // 1 CRM per passed round (simplified)
    let level = 1;
    if (crmEarned >= 900) level = 4;
    else if (crmEarned >= 300) level = 3;
    else if (crmEarned >= 100) level = 2;
    return { stateCells, totalCorrect, answeredIds, roundAnswered, roundCorrect, roundsCompleted, level, crmEarned };
}

function getQuiz(username) {
    if (BIBLE_QUIZ.length === 0) return { error: '퀴즈 데이터를 로드할 수 없습니다' };
    const state = getQuizState(username);

    // Filter by level difficulty
    const maxDifficulty = state.level >= 3 ? 3 : state.level >= 2 ? 2 : 1;
    const pool = BIBLE_QUIZ.filter(q => q.l <= maxDifficulty && !state.answeredIds.has(q.i));
    if (pool.length === 0) return { complete: true, total: state.answeredIds.size, correct: state.totalCorrect, rounds: state.roundsCompleted };

    // Pick question with domain balance
    const domains = ['SP','HU','LW','SV','HI','LD'];
    let pick;
    if (pool.length > 6) {
        const domainPool = domains[state.roundAnswered % domains.length];
        const filtered = pool.filter(q => q.d === domainPool);
        pick = (filtered.length > 0 ? filtered : pool)[Math.floor(Math.random() * (filtered.length > 0 ? filtered : pool).length)];
    } else {
        pick = pool[Math.floor(Math.random() * pool.length)];
    }

    return {
        quizId: pick.i,
        question: pick.q,
        options: pick.o,
        category: CATEGORY_NAMES[pick.c] || pick.c,
        domain: DOMAIN_NAMES[pick.d] || pick.d,
        difficulty: pick.l,
        reference: pick.r,
        round: { current: state.roundAnswered + 1, total: ROUND_SIZE, correct: state.roundCorrect },
        level: state.level,
        totalAnswered: state.answeredIds.size,
        totalCorrect: state.totalCorrect,
    };
}

function answerQuiz(username, quizId, selectedIndex) {
    const quiz = BIBLE_QUIZ.find(q => q.i === quizId);
    if (!quiz) return { error: '잘못된 퀴즈' };

    const correct = selectedIndex === quiz.a;
    const scoreCell = createCell(`성경:${quiz.r}`, TY.QUIZ_SCORE, quiz.i, username);
    scoreCell.correct = correct;

    // Knowledge cell for ontological tracking
    let knowledgeCell = findCellsByOwner(username, TY.KNOWLEDGE).find(c => c.name === '성경지식');
    if (!knowledgeCell) {
        knowledgeCell = createCell('성경지식', TY.KNOWLEDGE, 0, username);
        const user = users[username];
        if (user) connectCells(user.cellId, knowledgeCell.id, 2);
    }
    if (correct) addEvidence(knowledgeCell.id);

    // Check round completion
    const state = getQuizState(username);
    let roundResult = null;
    if (state.roundAnswered === 0 && state.answeredIds.size > 0) {
        // Just completed a round (rolled over)
        const prevRoundCells = state.stateCells.slice(-(ROUND_SIZE));
        const prevCorrect = prevRoundCells.filter(c => c.correct).length;
        const passed = prevCorrect >= PASS_THRESHOLD;

        // Daily reward limit check
        const today = new Date().toDateString();
        const todayRewards = cells.filter(c =>
            c.type === TY.TRANSACTION && c.owner === username &&
            c.currency === 'CRM' && c.txType === 'deposit' &&
            c.memo && c.memo.startsWith('퀴즈 보상') &&
            new Date(c.created).toDateString() === today
        );
        const todayCRM = todayRewards.reduce((s, t) => s + t.value, 0);
        const canReward = todayCRM < DAILY_QUIZ_REWARD_CAP;

        // Wallet cap check
        const wallet = getWallet(username);
        const isAdmin = ADMIN_USERS.includes(username);
        const crmmBalance = wallet.balances.CRM || 0;
        const withinCap = isAdmin || crmmBalance < WALLET_CAP_BASIC;

        if (passed && canReward && withinCap) {
            walletTransact(username, 'deposit', 1, null, `퀴즈 보상 (${prevCorrect}/${ROUND_SIZE})`, 'CRM');
        }
        let rewardMsg = passed ? '1 CRM' : null;
        if (passed && !canReward) rewardMsg = `오늘 한도 초과 (${todayCRM}/${DAILY_QUIZ_REWARD_CAP})`;
        if (passed && !withinCap) rewardMsg = `지갑 한도 초과 (${crmmBalance}/${WALLET_CAP_BASIC} CRM)`;
        roundResult = { completed: true, correct: prevCorrect, total: ROUND_SIZE, passed, reward: rewardMsg, dailyEarned: todayCRM };
    }

    saveCells();

    // ── iCloud Push: 퀴즈 → CrownyBus ──
    cloudPush(username, 'quiz_submit', 'POST', '/v2/bible/quiz/submit', {
        answers: [{ question_id: quizId, selected: selectedIndex }]
    }).catch(() => {});
    // 라운드 완료 + 보상 시 claim
    if (roundResult && roundResult.passed && roundResult.reward === '1 CRM') {
        cloudPush(username, 'quiz_claim', 'POST', '/v2/bible/quiz/claim', {
            session_id: `round_${state.roundsCompleted}`
        }).catch(() => {});
    }

    return {
        correct,
        correctAnswer: quiz.o[quiz.a],
        reference: quiz.r,
        round: { current: state.roundAnswered, total: ROUND_SIZE, correct: state.roundCorrect },
        roundResult,
        message: correct ? '정답!' : `오답. 정답: ${quiz.o[quiz.a]}`,
    };
}

// ═══ 지갑 앱 (다중통화) ═══
// 토큰경제:
//   CRN (크라우니): 총 23,100,000,000 (231억), 초기 유통 10% = 2,310,000,000
//   FNC (포네): 총 77,700,000,000 (777억), 초기 유통 10% = 7,770,000,000
//   CRM (맘): 총 77,700,000,000 (777억), 초기 유통 10% = 7,770,000,000
// 가격 기준: 1 CRM = 25.5 KRW, 1 FNC = 2,550 KRW (100 CRM), 1 CRN = 25,500 KRW (10 FNC)
// 스왑: 상향만 허용 (CRM→FNC, FNC→CRN), 역방향 불가

function getWallet(username) {
    const wallets = findCellsByOwner(username, TY.WALLET);
    const txns = findCellsByOwner(username, TY.TRANSACTION);

    let balances = { CRN: 0, FNC: 0, CRM: 0 };
    txns.forEach(t => {
        let currency = t.currency || 'CRN';  // backward compat
        if (!['CRN','FNC','CRM'].includes(currency)) currency = 'CRM'; // legacy fallback
        if (t.txType === 'receive' || t.txType === 'deposit' || t.txType === 'swap_in') balances[currency] += t.value;
        else if (t.txType === 'send' || t.txType === 'withdraw' || t.txType === 'swap_out') balances[currency] -= t.value;
    });

    // DEX prices (simple model with random ±2% variation)
    const baseRates = { CRN: 25500, FNC: 2550, CRM: 25.5 };
    const variation = 1 + (Math.random() * 0.04 - 0.02); // ±2%
    const prices = {
        CRN: Math.round(baseRates.CRN * variation * 100) / 100,
        FNC: Math.round(baseRates.FNC * variation * 100) / 100,
        CRM: Math.round(baseRates.CRM * variation * 100) / 100,
    };

    return {
        wallet: wallets[0] || null,
        walletAddress: users[username]?.walletAddress || '',
        username,
        balances,
        prices,
        totalKRW: Math.round(balances.CRN * prices.CRN + balances.FNC * prices.FNC + balances.CRM * prices.CRM),
        transactions: txns.sort((a, b) => b.created - a.created).slice(0, 30),
    };
}

function walletTransact(username, type, amount, toUser = null, memo = '', currency = 'CRN') {
    const user = users[username];
    if (!user) return { error: '사용자 없음' };
    if (amount <= 0) return { error: '금액은 양수여야 합니다' };
    if (!['CRN','FNC','CRM'].includes(currency)) return { error: '잘못된 통화' };

    const wallet = getWallet(username);

    if ((type === 'send' || type === 'withdraw') && (wallet.balances[currency] || 0) < amount)
        return { error: `${currency} 잔액 부족` };

    const txn = createCell(memo || `${type}:${amount} ${currency}`, TY.TRANSACTION, amount, username);
    txn.txType = type;
    txn.toUser = toUser;
    txn.memo = memo;
    txn.currency = currency;

    if (wallet.wallet) connectCells(wallet.wallet.id, txn.id, 3);

    if (toUser && users[toUser]) {
        const receiveTxn = createCell(memo || `receive:${amount} ${currency}`, TY.TRANSACTION, amount, toUser);
        receiveTxn.txType = 'receive';
        receiveTxn.fromUser = username;
        receiveTxn.memo = memo;
        receiveTxn.currency = currency;
        const toWallet = getWallet(toUser);
        if (toWallet.wallet) connectCells(toWallet.wallet.id, receiveTxn.id, 4);
    }

    saveCells();

    // ── 2단계: CrownyBus 원장 동기화 ──
    if (type === 'send' && toUser) {
        const toAddr = users[toUser]?.walletAddress || toUser;
        syncTransfer(username, currency, amount, toAddr, memo || `send to ${toUser}`);
    } else if (type === 'deposit') {
        syncTransfer(username, currency, amount, users[username]?.walletAddress, memo || 'deposit');
    }

    return { success: true, txnId: txn.id, type, amount, currency, balances: getWallet(username).balances };
}

function swapTokens(username, fromCurrency, toCurrency, amount) {
    const user = users[username];
    if (!user) return { error: '사용자 없음' };
    if (amount <= 0) return { error: '금액은 양수여야 합니다' };

    // Only upward swaps allowed
    const allowed = { 'CRM->FNC': true, 'FNC->CRN': true };
    const key = `${fromCurrency}->${toCurrency}`;
    if (!allowed[key]) return { error: `${fromCurrency} → ${toCurrency} 스왑 불가. 맘→포네, 포네→크라우니만 가능합니다.` };

    const wallet = getWallet(username);
    if ((wallet.balances[fromCurrency] || 0) < amount)
        return { error: `${fromCurrency} 잔액 부족` };

    // Calculate conversion with ±2% slippage
    const slippage = 1 + (Math.random() * 0.04 - 0.02);
    let received;
    if (fromCurrency === 'CRM' && toCurrency === 'FNC') {
        received = Math.floor(amount / 100 * slippage * 1000) / 1000;  // 100 CRM = 1 FNC
    } else if (fromCurrency === 'FNC' && toCurrency === 'CRN') {
        received = Math.floor(amount / 10 * slippage * 1000) / 1000;   // 10 FNC = 1 CRN
    }

    if (received <= 0) return { error: '스왑 금액이 너무 작습니다' };

    // Create out transaction
    const outTxn = createCell(`swap:${amount} ${fromCurrency} → ${received} ${toCurrency}`, TY.TRANSACTION, amount, username);
    outTxn.txType = 'swap_out'; outTxn.currency = fromCurrency; outTxn.memo = `DEX: ${fromCurrency} → ${toCurrency}`;

    // Create in transaction
    const inTxn = createCell(`swap:${received} ${toCurrency}`, TY.TRANSACTION, received, username);
    inTxn.txType = 'swap_in'; inTxn.currency = toCurrency; inTxn.memo = `DEX: ${fromCurrency} → ${toCurrency}`;

    if (wallet.wallet) {
        connectCells(wallet.wallet.id, outTxn.id, 3);
        connectCells(wallet.wallet.id, inTxn.id, 3);
    }

    saveCells();

    // ── 2단계: CrownyBus DEX 동기화 ──
    syncSwap(username, fromCurrency, toCurrency, amount);

    const updated = getWallet(username);
    return { success: true, sent: amount, sentCurrency: fromCurrency, received, receivedCurrency: toCurrency, slippage: Math.round((slippage - 1) * 10000) / 100, balances: updated.balances };
}

// ═══ 메일 시스템 (username@crowny.org 웹메일) ═══

const TY_MAIL = 406;

function sendEmail(fromUsername, toAddress, subject, body, replyTo = null) {
    const from = users[fromUsername];
    if (!from) return { error: '사용자 없음' };

    // Parse recipient: "user" → "user@crowny.org", "user@crowny.org" → "user@crowny.org"
    let toUsername = toAddress.replace(`@${DOMAIN}`, '');
    const toEmail = toAddress.includes('@') ? toAddress : `${toAddress}@${DOMAIN}`;
    const isInternal = toEmail.endsWith(`@${DOMAIN}`);

    const mail = createCell(subject.slice(0, 100), TY_MAIL, Date.now(), fromUsername);
    mail.mailFrom = `${fromUsername}@${DOMAIN}`;
    mail.mailTo = toEmail;
    mail.subject = subject;
    mail.body = body;
    mail.folder = 'sent';
    mail.read = true;
    mail.starred = false;
    mail.replyTo = replyTo;
    mail.threadId = replyTo || mail.id;
    connectCells(from.cellId, mail.id, 5);
    saveCells();

    // 내부 메일: 수신자에게도 셀 생성
    if (isInternal && users[toUsername]) {
        const recv = createCell(subject.slice(0, 100), TY_MAIL, Date.now(), toUsername);
        recv.mailFrom = `${fromUsername}@${DOMAIN}`;
        recv.mailTo = toEmail;
        recv.subject = subject;
        recv.body = body;
        recv.folder = 'inbox';
        recv.read = false;
        recv.starred = false;
        recv.replyTo = replyTo;
        recv.threadId = replyTo || mail.id;
        recv.linkedMailId = mail.id;
        const to = users[toUsername];
        if (to.cellId) connectCells(to.cellId, recv.id, 5);
        saveCells();
    }

    // 외부 메일: 독립 메일 서버 큐에 추가
    if (!isInternal && mailServer) {
        try {
            const extResult = mailServer.apiSendMail(fromUsername, toEmail, subject, body);
            if (extResult.error) console.warn('[MAIL] 외부 발송 큐 오류:', extResult.error);
            else console.log('[MAIL] 외부 발송 큐 추가:', extResult.id);
        } catch (e) {
            console.warn('[MAIL] 외부 발송 큐 실패:', e.message);
        }
    }

    return { success: true, mailId: mail.id, to: toEmail, internal: isInternal };
}

function getMailbox(username, folder = 'inbox') {
    return findCellsByOwner(username, TY_MAIL)
        .filter(m => m.folder === folder)
        .sort((a, b) => b.created - a.created);
}

function getMailCount(username) {
    const all = findCellsByOwner(username, TY_MAIL);
    return {
        inbox: all.filter(m => m.folder === 'inbox').length,
        unread: all.filter(m => m.folder === 'inbox' && !m.read).length,
        sent: all.filter(m => m.folder === 'sent').length,
        starred: all.filter(m => m.starred).length,
        trash: all.filter(m => m.folder === 'trash').length,
    };
}

function readMail(mailId, username) {
    const mail = findCell(mailId);
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: '메일 없음' };
    mail.read = true;
    mail.modified = Date.now();
    saveCells();
    return { success: true, mail };
}

function starMail(mailId, username, starred) {
    const mail = findCell(mailId);
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: '메일 없음' };
    mail.starred = !!starred;
    mail.modified = Date.now();
    saveCells();
    return { success: true };
}

function moveMail(mailId, username, folder) {
    const mail = findCell(mailId);
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: '메일 없음' };
    mail.folder = folder;
    mail.modified = Date.now();
    saveCells();
    return { success: true };
}

// ═══ 프로젝트 관리 (OmniPlan + OmniFocus + OmniOutline 온톨로직) ═══
// 원리:
//   프로젝트 = 셀 (하위 작업 완료 = 근거 → 3개 이상 → 프로젝트 확정)
//   작업 = 셀 (시작일/마감일/의존성/컨텍스트)
//   마일스톤 = 작업의 특수 형태 (기간=0, 확인 포인트)
//   아웃라인 = 셀 계층 (부모→자식 시냅스)
//   인박스 = 미처리 셀 (컨텍스트/프로젝트 미할당)
//   의존성 = 시냅스 (선행→후행, rel=10)
//   리뷰 = 주기적 셀 재검토 (OmniFocus 리뷰 주기)

const REL = { CHILD: 1, DEPEND: 10, CONTEXT: 11, RESOURCE: 12 };
const TASK_STATUS = { ACTIVE: 'active', DONE: 'done', DROPPED: 'dropped', WAITING: 'waiting', DEFERRED: 'deferred' };

function createProject(owner, name, notes = '', color = '#8B6914') {
    const cell = createCell(name, TY.PM_PROJECT, 0, owner);
    cell.notes = notes; cell.color = color;
    cell.startDate = Date.now(); cell.dueDate = null;
    cell.reviewInterval = 7; // 일 단위 리뷰 주기
    cell.lastReview = Date.now();
    cell.status = TASK_STATUS.ACTIVE;
    cell.progress = 0;
    const user = users[owner];
    if (user) connectCells(user.cellId, cell.id, REL.CHILD);
    saveCells();
    return cell;
}

function createTask(owner, projectId, name, opts = {}) {
    const cell = createCell(name, TY.PM_TASK, 0, owner);
    cell.notes = opts.notes || '';
    cell.status = TASK_STATUS.ACTIVE;
    cell.startDate = opts.startDate || Date.now();
    cell.dueDate = opts.dueDate || null;
    cell.deferDate = opts.deferDate || null;
    cell.duration = opts.duration || 0; // 분 단위
    cell.priority = opts.priority || 0; // -1,0,1
    cell.contextId = opts.contextId || null;
    cell.parentId = projectId || null;
    cell.children = [];
    cell.flagged = opts.flagged || false;
    cell.completedDate = null;
    cell.progress = 0;
    // 프로젝트에 연결
    if (projectId) connectCells(projectId, cell.id, REL.CHILD);
    // 의존성
    if (opts.dependsOn) {
        opts.dependsOn.forEach(depId => connectCells(depId, cell.id, REL.DEPEND));
    }
    // 컨텍스트
    if (opts.contextId) connectCells(cell.id, opts.contextId, REL.CONTEXT);
    saveCells();
    return cell;
}

function createMilestone(owner, projectId, name, dueDate) {
    const cell = createCell(name, TY.PM_MILESTONE, 0, owner);
    cell.dueDate = dueDate; cell.duration = 0;
    cell.status = TASK_STATUS.ACTIVE;
    cell.parentId = projectId;
    cell.completedDate = null;
    if (projectId) connectCells(projectId, cell.id, REL.CHILD);
    saveCells();
    return cell;
}

function createContext(owner, name, icon = '') {
    const cell = createCell(name, TY.PM_CONTEXT, 0, owner);
    cell.icon = icon;
    saveCells();
    return cell;
}

function createOutlineNode(owner, parentId, name, notes = '', level = 0) {
    const cell = createCell(name, TY.PM_OUTLINE, level, owner);
    cell.notes = notes; cell.collapsed = false;
    cell.parentId = parentId;
    if (parentId) connectCells(parentId, cell.id, REL.CHILD);
    saveCells();
    return cell;
}

function addToInbox(owner, text) {
    const cell = createCell(text, TY.PM_INBOX, 0, owner);
    cell.status = TASK_STATUS.ACTIVE;
    cell.processedDate = null;
    saveCells();
    return cell;
}

function completeTask(taskId) {
    const task = findCell(taskId);
    if (!task) return null;
    task.status = TASK_STATUS.DONE;
    task.completedDate = Date.now();
    task.state = PHASE.CONFIRMED;
    task.modified = Date.now();
    // 부모 프로젝트에 근거 추가 (하위 완료 = 근거)
    if (task.parentId) {
        addEvidence(task.parentId);
        updateProjectProgress(task.parentId);
    }
    saveCells();
    return task;
}

function updateProjectProgress(projectId) {
    const project = findCell(projectId);
    if (!project) return;
    const children = cells.filter(c =>
        c.owner === project.owner &&
        c.parentId === projectId &&
        (c.type === TY.PM_TASK || c.type === TY.PM_MILESTONE)
    );
    if (children.length === 0) { project.progress = 0; saveCells(); return; }
    const done = children.filter(c => c.status === TASK_STATUS.DONE).length;
    project.progress = Math.round((done / children.length) * 100);
    saveCells();
}

function getProjectTasks(owner, projectId) {
    return cells.filter(c =>
        c.owner === owner && c.parentId === projectId &&
        (c.type === TY.PM_TASK || c.type === TY.PM_MILESTONE)
    ).sort((a, b) => (a.startDate || 0) - (b.startDate || 0));
}

function getGanttData(owner, projectId) {
    const project = findCell(projectId);
    if (!project) return null;
    const tasks = getProjectTasks(owner, projectId);
    // 의존성 맵
    const deps = [];
    tasks.forEach(t => {
        (t.links || []).forEach(l => {
            if (l.rel === REL.DEPEND) deps.push({ from: l.target, to: t.id });
        });
    });
    // 크리티컬 패스 계산 (간단 버전: 가장 긴 경로)
    return {
        project: { id: project.id, name: project.name, start: project.startDate, progress: project.progress },
        tasks: tasks.map(t => ({
            id: t.id, name: t.name, start: t.startDate, due: t.dueDate,
            duration: t.duration, status: t.status, progress: t.progress || 0,
            type: t.type === TY.PM_MILESTONE ? 'milestone' : 'task',
            parentId: t.parentId, priority: t.priority, flagged: t.flagged,
        })),
        dependencies: deps,
    };
}

function getInbox(owner) {
    return cells.filter(c => c.owner === owner && c.type === TY.PM_INBOX && c.status === TASK_STATUS.ACTIVE)
        .sort((a, b) => b.created - a.created);
}

function getReviewItems(owner) {
    const now = Date.now();
    return cells.filter(c => {
        if (c.owner !== owner) return false;
        if (c.type !== TY.PM_PROJECT && c.type !== TY.PM_TASK) return false;
        if (c.status === TASK_STATUS.DONE || c.status === TASK_STATUS.DROPPED) return false;
        const interval = (c.reviewInterval || 7) * 86400000;
        return (now - (c.lastReview || c.created)) >= interval;
    }).sort((a, b) => (a.lastReview || a.created) - (b.lastReview || b.created));
}

function getForecast(owner, days = 14) {
    const now = Date.now();
    const end = now + days * 86400000;
    return cells.filter(c => {
        if (c.owner !== owner) return false;
        if (c.type !== TY.PM_TASK && c.type !== TY.PM_MILESTONE) return false;
        if (c.status === TASK_STATUS.DONE || c.status === TASK_STATUS.DROPPED) return false;
        return c.dueDate && c.dueDate >= now && c.dueDate <= end;
    }).sort((a, b) => a.dueDate - b.dueDate);
}

function getOutlineTree(owner, parentId) {
    const children = cells.filter(c =>
        c.owner === owner && c.type === TY.PM_OUTLINE && c.parentId === parentId
    ).sort((a, b) => a.created - b.created);
    return children.map(c => ({
        ...c,
        children: getOutlineTree(owner, c.id),
    }));
}

function getPerspective(owner, filter) {
    let result = cells.filter(c => c.owner === owner &&
        (c.type === TY.PM_TASK || c.type === TY.PM_MILESTONE));
    if (filter.status) result = result.filter(c => c.status === filter.status);
    if (filter.flagged) result = result.filter(c => c.flagged);
    if (filter.contextId) result = result.filter(c => c.contextId === filter.contextId);
    if (filter.projectId) result = result.filter(c => c.parentId === filter.projectId);
    if (filter.dueSoon) {
        const soon = Date.now() + 3 * 86400000;
        result = result.filter(c => c.dueDate && c.dueDate <= soon);
    }
    if (filter.overdue) {
        result = result.filter(c => c.dueDate && c.dueDate < Date.now() && c.status !== TASK_STATUS.DONE);
    }
    return result.sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));
}

// ═══ 백업/싱크 (파일 복사 = 백업 서버) ═══

function exportAllData() {
    return {
        version: '1.0',
        exported: Date.now(),
        domain: DOMAIN,
        users: users,
        cells: cells,
        nextId: nextId,
    };
}

function importAllData(data) {
    if (!data || !data.version) return { error: '잘못된 데이터 형식' };
    // 머지: 셀 ID 충돌 시 modified가 최신인 쪽 우선 (CRDT 유사)
    let merged = 0, added = 0;
    if (data.cells) {
        data.cells.forEach(incoming => {
            const existing = findCell(incoming.id);
            if (existing) {
                if (incoming.modified > existing.modified) {
                    Object.assign(existing, incoming);
                    merged++;
                }
            } else {
                cells.push(incoming);
                added++;
            }
        });
        nextId = Math.max(nextId, ...cells.map(c => c.id)) + 1;
        saveCells();
    }
    if (data.users) {
        Object.entries(data.users).forEach(([k, v]) => {
            if (!users[k]) { users[k] = v; added++; }
            else if (v.created > users[k].created) { users[k] = v; merged++; }
        });
        saveJSON('users.json', users);
    }
    return { success: true, merged, added };
}

// ═══ HTTP 서버 ═══

function parseBody(req) {
    return new Promise(resolve => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
    });
}

function getAuth(req) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return getUser(token);
}

// ── 트레이딩 데이터 디렉토리 & 헬퍼 ──
const TRADING_DIR = pathModule.join(DATA_DIR, 'trading');
if (!fs.existsSync(TRADING_DIR)) fs.mkdirSync(TRADING_DIR, { recursive: true });

function getTradingData(username) {
    const file = pathModule.join(TRADING_DIR, username + '.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return null; }
}

function saveTradingData(username, data) {
    const file = pathModule.join(TRADING_DIR, username + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── 챌린지 저장소 ──
const CHALLENGES_FILE = pathModule.join(DATA_DIR, 'challenges.json');
function getChallenges() {
    try { return JSON.parse(fs.readFileSync(CHALLENGES_FILE, 'utf8')); } catch(e) { return []; }
}
function saveChallenges(list) {
    fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(list, null, 2));
}

// ── 범용 컬렉션 DB (Firestore 대체) ──
const COLLECTIONS_DIR = pathModule.join(DATA_DIR, 'collections');
if (!fs.existsSync(COLLECTIONS_DIR)) fs.mkdirSync(COLLECTIONS_DIR, { recursive: true });

function getCollection(name) {
    const file = pathModule.join(COLLECTIONS_DIR, name + '.json');
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return {}; }
}

function saveCollection(name, data) {
    const file = pathModule.join(COLLECTIONS_DIR, name + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateDocId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function applyFieldValues(doc, updates) {
    for (const [key, val] of Object.entries(updates)) {
        if (val && typeof val === 'object' && val.__fieldValue) {
            switch (val.__fieldValue) {
                case 'serverTimestamp':
                    doc[key] = new Date().toISOString();
                    break;
                case 'increment':
                    doc[key] = (doc[key] || 0) + (val.operand || 0);
                    break;
                case 'arrayUnion':
                    if (!Array.isArray(doc[key])) doc[key] = [];
                    for (const item of (val.elements || [])) {
                        if (!doc[key].includes(item)) doc[key].push(item);
                    }
                    break;
                case 'arrayRemove':
                    if (Array.isArray(doc[key])) {
                        doc[key] = doc[key].filter(x => !(val.elements || []).includes(x));
                    }
                    break;
                case 'delete':
                    delete doc[key];
                    break;
                default:
                    doc[key] = val;
            }
        } else {
            doc[key] = val;
        }
    }
    return doc;
}

function queryDocs(docs, filters, orderByField, orderDir, limitN) {
    let results = Object.entries(docs).map(([id, data]) => ({ id, data: () => data, exists: true, _data: data }));

    // Apply filters
    for (const f of (filters || [])) {
        results = results.filter(doc => {
            const val = doc._data[f.field];
            switch (f.op) {
                case '==': return val === f.value;
                case '!=': return val !== f.value;
                case '<': return val < f.value;
                case '<=': return val <= f.value;
                case '>': return val > f.value;
                case '>=': return val >= f.value;
                case 'in': return Array.isArray(f.value) && f.value.includes(val);
                case 'array-contains': return Array.isArray(val) && val.includes(f.value);
                default: return true;
            }
        });
    }

    // Sort
    if (orderByField) {
        const dir = orderDir === 'asc' ? 1 : -1;
        results.sort((a, b) => {
            const va = a._data[orderByField], vb = b._data[orderByField];
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
    }

    // Limit
    if (limitN && limitN > 0) results = results.slice(0, limitN);

    return results;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') { res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    // ── 소셜 이미지 서빙 ──
    if (path.startsWith('/social-images/')) {
        const SOCIAL_IMG_DIR = pathModule.join(__dirname, 'social-data', 'images');
        const imgPath = pathModule.join(SOCIAL_IMG_DIR, pathModule.basename(path));
        const safePath = pathModule.resolve(imgPath).startsWith(pathModule.resolve(SOCIAL_IMG_DIR));
        if (safePath && fs.existsSync(imgPath)) {
            const ext = pathModule.extname(imgPath).toLowerCase();
            const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
            res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            fs.createReadStream(imgPath).pipe(res);
        } else { res.statusCode = 404; res.end('not found'); }
        return;
    }

    // ── 업로드 파일 서빙 ──
    if (path.startsWith('/uploads/')) {
        const UPLOADS_DIR = pathModule.join(DATA_DIR, 'uploads');
        const uploadPath = pathModule.join(UPLOADS_DIR, path.replace('/uploads/', ''));
        const safeUpload = pathModule.resolve(uploadPath).startsWith(pathModule.resolve(UPLOADS_DIR));
        if (safeUpload && fs.existsSync(uploadPath) && fs.statSync(uploadPath).isFile()) {
            const ext = pathModule.extname(uploadPath).toLowerCase();
            const mimeMap = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
                '.json': 'application/json', '.txt': 'text/plain', '.csv': 'text/csv'
            };
            res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            fs.createReadStream(uploadPath).pipe(res);
        } else { res.statusCode = 404; res.end('not found'); }
        return;
    }

    // ── 정적 파일 서빙 ──
    if (!path.startsWith('/api') && !path.startsWith('/v2/')) {
        const filePath = pathModule.join(PUBLIC_DIR, path === '/' ? 'index.html' : path);
        const safe = pathModule.resolve(filePath).startsWith(PUBLIC_DIR);
        if (safe && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = pathModule.extname(filePath);
            res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        // SPA fallback
        const index = pathModule.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(index)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            fs.createReadStream(index).pipe(res);
            return;
        }
        res.statusCode = 404;
        res.end('{"error":"Not found"}');
        return;
    }

    const body = (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') ? await parseBody(req) : {};

    try {
        // ── 인증 ──
        if (path === '/api/register' && req.method === 'POST') {
            const result = createUser(body.username, body.password, body.displayName);
            res.end(JSON.stringify(result));
            return;
        }

        if (path === '/api/login' && req.method === 'POST') {
            const result = loginUser(body.username, body.password);
            res.end(JSON.stringify(result));
            return;
        }

        // CrownyOS 호환: /v2/auth/me (crownybus.com 통합 인증)
        if (path === '/v2/auth/me' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"authenticated":false}'); return; }
            res.end(JSON.stringify({
                authenticated: true,
                user: {
                    email: user.email,
                    displayName: user.displayName || user.username,
                    username: user.username,
                    role: user.isAdmin ? 'ADMIN' : 'USER'
                }
            }));
            return;
        }

        if (path === '/api/verify-email' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(verifyEmail(user.username)));
            return;
        }

        if (path === '/api/change-password' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const { oldPassword, newPassword } = body;
            if (!newPassword || newPassword.length < 6) {
                res.end(JSON.stringify({ error: '새 비밀번호는 6자 이상이어야 합니다' }));
                return;
            }
            // oldPassword가 있으면 검증 (비밀번호 변경), 없으면 초기 설정
            if (oldPassword && user.password !== hashPassword(oldPassword)) {
                res.end(JSON.stringify({ error: '현재 비밀번호가 틀렸습니다' }));
                return;
            }
            user.password = hashPassword(newPassword);
            saveJSON('users.json', users);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // ── 프로필 ──
        if (path === '/api/profile' && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (body.displayName !== undefined) user.displayName = body.displayName;
            if (body.statusMessage !== undefined) user.statusMessage = body.statusMessage;
            if (body.photoURL !== undefined) {
                // base64 image → save to social-data/images/
                const match = body.photoURL.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
                if (match) {
                    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                    const imgDir = pathModule.join(__dirname, 'social-data', 'images');
                    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
                    const filename = `profile_${user.username}_${Date.now()}.${ext}`;
                    fs.writeFileSync(pathModule.join(imgDir, filename), Buffer.from(match[2], 'base64'));
                    user.photoURL = `/social-images/${filename}`;
                } else {
                    user.photoURL = body.photoURL;
                }
            }
            saveJSON('users.json', users);
            res.end(JSON.stringify({ success: true, displayName: user.displayName, statusMessage: user.statusMessage || '', photoURL: user.photoURL || '' }));
            return;
        }

        if (path === '/api/profile' && (req.method === 'GET' || req.method === 'POST')) {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const cell = findCell(user.cellId);
            // Generate wallet address for legacy users
            if (!user.walletAddress) {
                user.walletAddress = generateWalletAddress(user.username);
                saveJSON('users.json', users);
            }
            res.end(JSON.stringify({
                username: user.username, email: user.email,
                displayName: user.displayName, verified: user.verified,
                walletAddress: user.walletAddress,
                photoURL: user.photoURL || '',
                statusMessage: user.statusMessage || '',
                isAdmin: ADMIN_USERS.includes(user.username),
                busLinked: !!user.busLinked,
                busLinkedAt: user.busLinkedAt || null,
                cell: cell ? { state: cell.state, trust: cell.trust, evidence: cell.evidence } : null
            }));
            return;
        }

        // ── 연락처 ──
        if (path === '/api/contacts' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getContacts(user.username)));
            return;
        }

        if (path === '/api/contacts' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(addContact(user.username, body.name, body.phone, body.relation, {
                email: body.email, company: body.company, position: body.position,
                address: body.address, birthday: body.birthday, group: body.group,
                notes: body.notes, tags: body.tags, crownyUsername: body.crownyUsername,
            })));
            return;
        }

        if (path.startsWith('/api/contacts/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const contact = findCell(id);
            if (!contact || contact.owner !== user.username || contact.type !== TY.CONTACT) {
                res.end('{"error":"연락처 없음"}'); return;
            }
            ['name','phone','email','company','position','address','birthday','group','notes','tags','lastContact'].forEach(k => {
                if (body[k] !== undefined) contact[k] = body[k];
            });
            contact.modified = Date.now();
            saveCells();
            res.end(JSON.stringify({ success: true, contact }));
            return;
        }

        if (path.startsWith('/api/contacts/') && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const contact = findCell(id);
            if (!contact || contact.owner !== user.username || contact.type !== TY.CONTACT) {
                res.end('{"error":"연락처 없음"}'); return;
            }
            contact.deleted = true;
            saveCells();
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // ── 회원 검색 ──
        if (path === '/api/users/search' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const q = (url.searchParams.get('q') || '').trim().toLowerCase();
            if (q.length < 1) { res.end('[]'); return; }
            const results = Object.values(users)
                .filter(u => u.username !== user.username && (
                    u.username.toLowerCase().includes(q) ||
                    (u.displayName || '').toLowerCase().includes(q)
                ))
                .slice(0, 20)
                .map(u => ({ username: u.username, displayName: u.displayName || u.username, email: u.email }));
            res.end(JSON.stringify(results));
            return;
        }

        // ── 회원 정보 조회 (프로필 사진 등) ──
        if (path === '/api/users/info' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const username = url.searchParams.get('username') || '';
            const target = users[username];
            if (!target) { res.end(JSON.stringify({ error: '회원 없음' })); return; }
            res.end(JSON.stringify({
                username: target.username,
                displayName: target.displayName || target.username,
                email: target.email || '',
                photoURL: target.photoURL || '',
                statusMessage: target.statusMessage || ''
            }));
            return;
        }

        // ── 독립 메신저 (채팅) ──
        if (path === '/api/chat/list' && req.method === 'GET') {
            const user = getAuth(req);
            console.log('[CHAT API] /api/chat/list called, user:', user ? user.username : 'NO AUTH');
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const chatList = chatServer ? chatServer.apiListChats(user.username) : [];
            // 상대방 프로필 사진 첨부
            for (const c of chatList) {
                if (c.type === 'dm' && c.displayName && users[c.displayName]) {
                    c.photoURL = users[c.displayName].photoURL || '';
                }
            }
            res.end(JSON.stringify(chatList));
            return;
        }

        if (path === '/api/chat/create' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (!body.to) { res.statusCode = 400; res.end('{"error":"상대방(to) 필수"}'); return; }
            // 대상 사용자 존재 확인
            if (body.type !== 'group') {
                const target = typeof body.to === 'string' ? body.to : body.to[0];
                if (!users[target]) { res.statusCode = 404; res.end(JSON.stringify({ error: `'${target}' 회원을 찾을 수 없습니다` })); return; }
            } else if (Array.isArray(body.to)) {
                const missing = body.to.filter(t => !users[t]);
                if (missing.length > 0) { res.statusCode = 404; res.end(JSON.stringify({ error: `'${missing.join(', ')}' 회원을 찾을 수 없습니다` })); return; }
            }
            res.end(JSON.stringify(chatServer ? chatServer.apiCreateChat(user.username, body.to, body.type, body.groupName) : { error: '메신저 없음' }));
            return;
        }

        if (path === '/api/chat/search' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(chatServer ? chatServer.apiSearchMessages(user.username, url.searchParams.get('q') || '') : []));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/messages$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const chatId = path.split('/')[3];
            const limit = parseInt(url.searchParams.get('limit') || '50');
            const before = url.searchParams.get('before') ? parseInt(url.searchParams.get('before')) : undefined;
            res.end(JSON.stringify(chatServer ? chatServer.apiGetMessages(chatId, user.username, limit, before) : []));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/info$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiGetChatInfo(chatId, user.username) : { error: '메신저 없음' }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/send$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (!body.text) { res.statusCode = 400; res.end('{"error":"메시지 내용 필수"}'); return; }
            const chatId = path.split('/')[3];
            if (!chatServer) { res.end('{"error":"메신저 없음"}'); return; }
            const chatStore = require('./chat-server/chat-store');
            const chat = chatStore.getChat(chatId);
            if (!chat || !chat.participants.includes(user.username)) { res.statusCode = 403; res.end('{"error":"권한 없음"}'); return; }
            const msg = chatStore.addMessage(chatId, user.username, body.text, body.msgType || 'text', body.replyTo);
            // CRMM 팁
            if (body.crmm && body.crmm > 0) {
                const toUser = chat.participants.find(p => p !== user.username);
                if (toUser) {
                    const tipResult = walletTransact(user.username, 'send', body.crmm, toUser, '메시지 팁', 'CRM');
                    if (!tipResult.error) {
                        msg.crmmTip = body.crmm;
                        // 파일에도 저장
                        const msgPath = require('path').join(chatStore.MSG_DIR, chatId, msg.id + '.json');
                        require('fs').writeFileSync(msgPath, JSON.stringify(msg));
                    }
                }
            }
            // WebSocket으로 실시간 전달
            try {
                const { broadcastToChat, sendTo } = require('./chat-server/ws-server');
                sendTo(user.username, { type: 'chat:sent', msg });
                broadcastToChat(chatId, { type: 'chat:message', msg }, user.username);
            } catch (e) { /* WS 없어도 REST는 동작 */ }
            res.end(JSON.stringify({ success: true, msg }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/group$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiUpdateGroup(chatId, user.username, body) : { error: '메신저 없음' }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+$/) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiDeleteChat(chatId, user.username) : { error: '메신저 없음' }));
            return;
        }

        // ── 레거시 메시지 API (호환) ──
        if (path === '/api/messages' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const withUser = url.searchParams.get('with');
            res.end(JSON.stringify(getMessages(user.username, withUser)));
            return;
        }

        if (path === '/api/messages' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(sendMessage(user.username, body.to, body.content, body.crmmAmount || 0)));
            return;
        }

        if (path === '/api/messages/read' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(markRead(body.messageId, user.username)));
            return;
        }

        // ── 바이블퀴즈 ──
        if (path === '/api/bible/quiz' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getQuiz(user.username)));
            return;
        }

        if (path === '/api/bible/answer' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(answerQuiz(user.username, body.quizId, body.selectedIndex)));
            return;
        }

        // ── 메일 ──
        if (path === '/api/mail/inbox' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const folder = url.searchParams.get('folder') || 'inbox';
            res.end(JSON.stringify(getMailbox(user.username, folder)));
            return;
        }

        if (path === '/api/mail/count' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getMailCount(user.username)));
            return;
        }

        if (path === '/api/mail/send' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (!body.to) { res.statusCode = 400; res.end('{"error":"수신자(to) 필수"}'); return; }
            const r = sendEmail(user.username, body.to, body.subject || '(제목 없음)', body.body || '', body.replyTo);
            res.end(JSON.stringify(r));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const r = readMail(id, user.username);
            res.end(JSON.stringify(r));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+\/star$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            res.end(JSON.stringify(starMail(id, user.username, body.starred)));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+\/move$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            res.end(JSON.stringify(moveMail(id, user.username, body.folder || 'trash')));
            return;
        }

        // ── 외부 메일 (독립 메일 서버) ──
        if (path === '/api/mail/external' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (mailServer) {
                const folder = url.searchParams.get('folder') || 'inbox';
                const mails = mailServer.apiListMails(user.username, folder);
                res.end(JSON.stringify(mails));
            } else {
                res.end('[]');
            }
            return;
        }

        if (path.match(/^\/api\/mail\/ext\//) && (req.method === 'GET' || req.method === 'DELETE')) {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (mailServer) {
                const mailId = path.split('/')[4];
                const folder = url.searchParams.get('folder') || 'inbox';
                if (req.method === 'DELETE') {
                    const ok = mailServer.apiDeleteMail(mailId, folder);
                    res.end(JSON.stringify({ success: ok }));
                } else {
                    const mail = mailServer.apiReadMail(mailId, folder);
                    res.end(JSON.stringify(mail || { error: '메일 없음' }));
                }
            } else {
                res.end('{"error":"메일서버 없음"}');
            }
            return;
        }

        if (path === '/api/mail/stats' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (mailServer) {
                res.end(JSON.stringify(mailServer.apiStats(user.username)));
            } else {
                res.end(JSON.stringify(getMailCount(user.username)));
            }
            return;
        }

        // ── 클라우드 동기화 ──
        if (path === '/api/cloud/pull' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const r = await cloudPull(user.username);
            res.end(JSON.stringify(r));
            return;
        }

        if (path === '/api/cloud/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const u = users[user.username];
            res.end(JSON.stringify({
                busLinked: !!u.busLinked,
                busConnected: busStatus.connected,
                lastCloudPull: u.lastCloudPull || null,
                cloudBalance: u.cloudBalance || null,
                syncQueue: syncQueue.filter(q => q.username === user.username).length,
            }));
            return;
        }

        // ── 지갑 ──
        if (path === '/api/wallet' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getWallet(user.username)));
            return;
        }

        if (path === '/api/wallet/transact' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(walletTransact(user.username, body.type, body.amount, body.to, body.memo, body.currency || 'CRN')));
            return;
        }

        if (path === '/api/wallet/swap' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(swapTokens(user.username, body.from, body.to, body.amount)));
            return;
        }

        // ── 트레이딩 게임 ──
        if (path === '/api/trading/participation' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const data = getTradingData(user.username);
            if (!data) { res.end('{"participation":null}'); return; }
            res.end(JSON.stringify({ participation: data }));
            return;
        }

        if (path === '/api/trading/join' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const existing = getTradingData(user.username);
            if (existing && existing.status === 'active') {
                res.statusCode = 400;
                res.end('{"error":"이미 참가 중입니다"}');
                return;
            }
            const participation = {
                challengeId: 'crowny_default',
                participantId: user.username,
                userId: user.username,
                status: 'active',
                initialBalance: 100000,
                currentBalance: 100000,
                trades: [],
                dailyPnL: 0,
                dailyLocked: false,
                crtdDeposit: body.deposit || 500,
                crtdWithdrawn: 0,
                tradingTier: { MNQ: 3, NQ: 0 },
                dailyLossLimit: 500,
                createdAt: Date.now()
            };
            saveTradingData(user.username, participation);
            res.end(JSON.stringify({ ok: true, participation }));
            return;
        }

        if (path === '/api/trading/update' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const existing = getTradingData(user.username);
            if (!existing) { res.statusCode = 404; res.end('{"error":"참가 데이터 없음"}'); return; }
            const allowed = ['currentBalance', 'trades', 'dailyPnL', 'dailyLocked', 'status', 'tradingTier', 'dailyLossLimit'];
            for (const key of allowed) {
                if (body[key] !== undefined) existing[key] = body[key];
            }
            existing.updatedAt = Date.now();
            saveTradingData(user.username, existing);
            res.end(JSON.stringify({ ok: true, participation: existing }));
            return;
        }

        if (path === '/api/trading/withdraw' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const existing = getTradingData(user.username);
            if (!existing) { res.statusCode = 404; res.end('{"error":"참가 데이터 없음"}'); return; }
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"유효하지 않은 금액"}'); return; }
            const withdrawn = existing.crtdWithdrawn || 0;
            const available = existing.crtdDeposit - withdrawn;
            if (amount > available) { res.statusCode = 400; res.end('{"error":"출금 가능 금액 초과"}'); return; }
            existing.crtdWithdrawn = withdrawn + amount;
            existing.updatedAt = Date.now();
            saveTradingData(user.username, existing);
            res.end(JSON.stringify({ ok: true, withdrawn: amount, crtdWithdrawn: existing.crtdWithdrawn, remaining: existing.crtdDeposit - existing.crtdWithdrawn }));
            return;
        }

        // ── 챌린지 관리 ──
        if (path === '/api/challenges' && req.method === 'GET') {
            const challenges = getChallenges().filter(c => c.status === 'active');
            res.end(JSON.stringify(challenges));
            return;
        }

        if (path === '/api/challenges' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            const challenges = getChallenges();
            const id = 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const challenge = {
                id, ...body,
                participants: 0, totalPool: 0, status: 'active',
                createdBy: user.username, createdAt: Date.now()
            };
            challenges.push(challenge);
            saveChallenges(challenges);
            res.end(JSON.stringify({ ok: true, challenge }));
            return;
        }

        if (path === '/api/challenges/join' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const { challengeId, tierKey } = body;
            const challenges = getChallenges();
            const ch = challenges.find(c => c.id === challengeId && c.status === 'active');
            if (!ch) { res.statusCode = 404; res.end('{"error":"챌린지를 찾을 수 없습니다"}'); return; }

            // 중복 참가 체크
            const existing = getTradingData(user.username);
            if (existing && existing.status === 'active') {
                res.statusCode = 400; res.end('{"error":"이미 참가 중입니다"}'); return;
            }

            const tiers = ch.tiers || {};
            const tier = tiers[tierKey] || { deposit: 100, account: 100000, liquidation: 3000, profitThreshold: 1000, withdrawUnit: 1000, mnqMax: 1, nqMax: 0 };

            const participation = {
                challengeId, participantId: user.username, userId: user.username,
                tier: tierKey, status: 'active',
                crtdDeposit: tier.deposit,
                initialBalance: tier.account, currentBalance: tier.account,
                liquidation: tier.liquidation, profitThreshold: tier.profitThreshold, withdrawUnit: tier.withdrawUnit,
                allowedProduct: ch.allowedProduct || 'MNQ',
                tradingTier: { MNQ: tier.mnqMax || 1, NQ: tier.nqMax || 0 },
                maxContracts: Math.max(tier.mnqMax || 1, tier.nqMax || 0, ch.maxContracts || 1),
                maxPositions: ch.maxPositions || 5,
                dailyLossLimit: ch.dailyLossLimit || 500,
                maxDrawdown: tier.liquidation,
                trades: [], dailyPnL: 0, totalPnL: 0, dailyLocked: false,
                crtdWithdrawn: 0, createdAt: Date.now(), lastEOD: Date.now()
            };
            saveTradingData(user.username, participation);

            // 챌린지 참가자 수 업데이트
            ch.participants = (ch.participants || 0) + 1;
            ch.totalPool = (ch.totalPool || 0) + tier.deposit;
            saveChallenges(challenges);

            res.end(JSON.stringify({ ok: true, participation }));
            return;
        }

        // ── 범용 컬렉션 DB API ──
        if (path.startsWith('/api/db/')) {
            const parts = path.replace('/api/db/', '').split('/');
            const collectionName = parts[0];
            const docId = parts[1] || null;
            const subCollection = parts[2] || null;
            const subDocId = parts[3] || null;

            // Determine actual collection name (for subcollections: parent_docId_sub)
            const actualCollection = subCollection
                ? `${collectionName}_${docId}_${subCollection}`
                : collectionName;
            const actualDocId = subCollection ? subDocId : docId;

            if (req.method === 'GET') {
                const col = getCollection(actualCollection);
                if (actualDocId) {
                    // Get single document
                    const doc = col[actualDocId];
                    if (doc) {
                        res.end(JSON.stringify({ exists: true, id: actualDocId, data: doc }));
                    } else {
                        res.end(JSON.stringify({ exists: false, id: actualDocId, data: {} }));
                    }
                } else {
                    // Query collection
                    const qUrl = new URL(req.url, 'http://localhost');
                    const filters = [];
                    // Parse where params: where=field,op,value (can be multiple)
                    for (const w of qUrl.searchParams.getAll('where')) {
                        const [field, op, ...rest] = w.split(',');
                        let value = rest.join(',');
                        // Try to parse as number/boolean/null
                        if (value === 'true') value = true;
                        else if (value === 'false') value = false;
                        else if (value === 'null') value = null;
                        else if (!isNaN(value) && value !== '') value = Number(value);
                        filters.push({ field, op, value });
                    }
                    const orderBy = qUrl.searchParams.get('orderBy') || null;
                    const orderDir = qUrl.searchParams.get('orderDir') || 'desc';
                    const limit = parseInt(qUrl.searchParams.get('limit')) || 0;

                    const results = queryDocs(col, filters, orderBy, orderDir, limit);
                    res.end(JSON.stringify({
                        empty: results.length === 0,
                        size: results.length,
                        docs: results.map(r => ({ id: r.id, data: r._data }))
                    }));
                }
                return;
            }

            if (req.method === 'POST') {
                // Add new document
                const col = getCollection(actualCollection);
                const id = body._docId || generateDocId();
                delete body._docId;
                applyFieldValues(body, body);
                col[id] = body;
                saveCollection(actualCollection, col);
                res.end(JSON.stringify({ ok: true, id }));
                return;
            }

            if (req.method === 'PUT') {
                // Set or update document
                if (!actualDocId) { res.statusCode = 400; res.end('{"error":"docId required"}'); return; }
                const col = getCollection(actualCollection);
                const existing = col[actualDocId] || {};
                const merge = body._merge !== false;
                delete body._merge;
                if (merge) {
                    applyFieldValues(existing, body);
                    col[actualDocId] = existing;
                } else {
                    applyFieldValues(body, body);
                    col[actualDocId] = body;
                }
                saveCollection(actualCollection, col);
                res.end(JSON.stringify({ ok: true, id: actualDocId }));
                return;
            }

            if (req.method === 'DELETE') {
                if (!actualDocId) { res.statusCode = 400; res.end('{"error":"docId required"}'); return; }
                const col = getCollection(actualCollection);
                delete col[actualDocId];
                saveCollection(actualCollection, col);
                res.end(JSON.stringify({ ok: true }));
                return;
            }
        }

        // ── 파일 업로드 (Firebase Storage 대체) ──
        if (path === '/api/upload' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            // body contains base64 data and metadata
            const uploadDir = pathModule.join(DATA_DIR, 'uploads', user.username);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const fileName = body.fileName || (Date.now() + '_' + Math.random().toString(36).slice(2, 6));
            const filePath = pathModule.join(uploadDir, fileName);
            if (body.base64) {
                const buffer = Buffer.from(body.base64, 'base64');
                fs.writeFileSync(filePath, buffer);
            } else if (body.text) {
                fs.writeFileSync(filePath, body.text);
            }
            const uploadUrl = `/uploads/${user.username}/${fileName}`;
            res.end(JSON.stringify({ ok: true, url: uploadUrl, downloadURL: uploadUrl }));
            return;
        }

        // ── 대시보드 ──
        if (path === '/api/dashboard') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const myCells = cells.filter(c => c.owner === user.username);
            const conf = myCells.filter(c => c.state === 2).length;
            const pend = myCells.filter(c => c.state === 0).length;
            const messages = myCells.filter(c => c.type === TY.MESSAGE).length;
            const contacts = myCells.filter(c => c.type === TY.CONTACT).length;
            const wallet = getWallet(user.username);
            const quizScore = myCells.filter(c => c.type === TY.QUIZ_SCORE).length;

            res.end(JSON.stringify({
                cells: myCells.length, confirmed: conf, pending: pend,
                messages, contacts, balances: wallet.balances, totalKRW: wallet.totalKRW,
                quizScore, totalQuiz: BIBLE_QUIZ.length,
            }));
            return;
        }

        // ── 셀 API ──
        if (path === '/api/cells') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(cells.filter(c => c.owner === user.username)));
            return;
        }

        if (path === '/api/recommend') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const myCells = cells.filter(c => c.owner === user.username);
            const exec = myCells.filter(c => c.state > 0);
            const verify = myCells.filter(c => c.state === 0).sort((a, b) => b.trust - a.trust);
            const review = myCells.filter(c => c.state < 0);
            res.end(JSON.stringify({ execute: exec.slice(0, 5), verify: verify.slice(0, 10), review }));
            return;
        }

        // ── 프로젝트 관리 ──
        if (path === '/api/projects' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const projects = cells.filter(c => c.owner === user.username && c.type === TY.PM_PROJECT && c.status !== TASK_STATUS.DROPPED);
            res.end(JSON.stringify(projects.sort((a, b) => b.modified - a.modified)));
            return;
        }

        if (path === '/api/projects' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const p = createProject(user.username, body.name, body.notes, body.color);
            res.end(JSON.stringify({ success: true, project: p }));
            return;
        }

        if (path.startsWith('/api/projects/') && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const gantt = getGanttData(user.username, id);
            res.end(JSON.stringify(gantt || { error: '프로젝트 없음' }));
            return;
        }

        if (path === '/api/tasks' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const t = createTask(user.username, body.projectId, body.name, {
                notes: body.notes, startDate: body.startDate, dueDate: body.dueDate,
                deferDate: body.deferDate, duration: body.duration, priority: body.priority,
                contextId: body.contextId, dependsOn: body.dependsOn, flagged: body.flagged,
            });
            res.end(JSON.stringify({ success: true, task: t }));
            return;
        }

        if (path.startsWith('/api/tasks/') && path.endsWith('/complete') && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const t = completeTask(id);
            res.end(JSON.stringify(t ? { success: true, task: t } : { error: '작업 없음' }));
            return;
        }

        if (path.startsWith('/api/tasks/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const t = findCell(id);
            if (!t || t.owner !== user.username) { res.end('{"error":"작업 없음"}'); return; }
            ['name','notes','status','startDate','dueDate','deferDate','duration',
             'priority','contextId','flagged','parentId','progress'].forEach(k => {
                if (body[k] !== undefined) t[k] = body[k];
            });
            t.modified = Date.now();
            if (body.status === TASK_STATUS.DONE) t.completedDate = Date.now();
            if (t.parentId) updateProjectProgress(t.parentId);
            saveCells();
            res.end(JSON.stringify({ success: true, task: t }));
            return;
        }

        if (path === '/api/milestones' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const m = createMilestone(user.username, body.projectId, body.name, body.dueDate);
            res.end(JSON.stringify({ success: true, milestone: m }));
            return;
        }

        // ── 인박스 ──
        if (path === '/api/inbox' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getInbox(user.username)));
            return;
        }

        if (path === '/api/inbox' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const item = addToInbox(user.username, body.text);
            res.end(JSON.stringify({ success: true, item }));
            return;
        }

        if (path === '/api/inbox/process' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const item = findCell(body.id);
            if (!item || item.owner !== user.username) { res.end('{"error":"항목 없음"}'); return; }
            // 프로젝트 작업으로 전환 또는 삭제
            if (body.action === 'convert') {
                item.type = TY.PM_TASK; item.status = TASK_STATUS.ACTIVE;
                item.parentId = body.projectId || null;
                item.dueDate = body.dueDate || null;
                item.contextId = body.contextId || null;
                item.processedDate = Date.now();
                if (body.projectId) connectCells(body.projectId, item.id, REL.CHILD);
                saveCells();
            } else if (body.action === 'drop') {
                item.status = TASK_STATUS.DROPPED;
                item.processedDate = Date.now();
                saveCells();
            }
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // ── 컨텍스트 ──
        if (path === '/api/contexts' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(cells.filter(c => c.owner === user.username && c.type === TY.PM_CONTEXT)));
            return;
        }

        if (path === '/api/contexts' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const ctx = createContext(user.username, body.name, body.icon);
            res.end(JSON.stringify({ success: true, context: ctx }));
            return;
        }

        // ── 아웃라인 ──
        if (path === '/api/outline' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const parentId = url.searchParams.get('parent') ? parseInt(url.searchParams.get('parent')) : null;
            res.end(JSON.stringify(getOutlineTree(user.username, parentId)));
            return;
        }

        if (path === '/api/outline' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const node = createOutlineNode(user.username, body.parentId, body.name, body.notes, body.level);
            res.end(JSON.stringify({ success: true, node }));
            return;
        }

        if (path.startsWith('/api/outline/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const node = findCell(id);
            if (!node || node.owner !== user.username) { res.end('{"error":"노드 없음"}'); return; }
            ['name','notes','collapsed','parentId','value'].forEach(k => {
                if (body[k] !== undefined) node[k] = body[k];
            });
            node.modified = Date.now();
            saveCells();
            res.end(JSON.stringify({ success: true, node }));
            return;
        }

        // ── 리뷰 / 예측 / 퍼스펙티브 ──
        if (path === '/api/review') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getReviewItems(user.username)));
            return;
        }

        if (path === '/api/review/done' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const cell = findCell(body.id);
            if (cell && cell.owner === user.username) {
                cell.lastReview = Date.now();
                cell.modified = Date.now();
                saveCells();
            }
            res.end(JSON.stringify({ success: true }));
            return;
        }

        if (path === '/api/forecast') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const days = parseInt(url.searchParams.get('days') || '14');
            res.end(JSON.stringify(getForecast(user.username, days)));
            return;
        }

        if (path === '/api/perspective' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(getPerspective(user.username, body)));
            return;
        }

        // ── 백업/복원/싱크 ──
        if (path === '/api/backup') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(exportAllData()));
            return;
        }

        if (path === '/api/restore' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            res.end(JSON.stringify(importAllData(body)));
            return;
        }

        if (path === '/api/sync' && req.method === 'POST') {
            // 원격 서버와 양방향 싱크
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (!body.remoteUrl) { res.end('{"error":"remoteUrl 필요"}'); return; }
            try {
                const myData = exportAllData();
                // 원격에 내 데이터 보내고 원격 데이터 받기
                const { execSync } = require('child_process');
                const remoteData = JSON.parse(execSync(
                    `curl -s -X POST "${body.remoteUrl}/api/restore" -H "Content-Type:application/json" -H "Authorization:Bearer ${token}" -d '${JSON.stringify(myData).replace(/'/g, "'\\''")}'`,
                    { timeout: 10000 }
                ).toString());
                // 원격 데이터 가져오기
                const remoteBackup = JSON.parse(execSync(
                    `curl -s "${body.remoteUrl}/api/backup" -H "Authorization:Bearer ${token}"`,
                    { timeout: 10000 }
                ).toString());
                const result = importAllData(remoteBackup);
                res.end(JSON.stringify({ success: true, sync: result, remote: remoteData }));
            } catch(e) {
                res.end(JSON.stringify({ error: '싱크 실패: ' + e.message }));
            }
            return;
        }

        // ═══ 한선씨 VM API ═══

        // 한선씨 코드 실행
        if (path === '/api/hanseon/run' && req.method === 'POST') {
            const hsUser = getAuth(req);
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: '로그인 필요' })); return; }
            const code = body.code || '';
            if (!code.trim()) { res.end(JSON.stringify({ error: '코드가 비어 있습니다' })); return; }
            const result = await runHanSeon(code, 'run', body.timeout || 5000);
            res.end(JSON.stringify(result));
            return;
        }

        // 한선씨 디스어셈블
        if (path === '/api/hanseon/dis' && req.method === 'POST') {
            const hsUser = getAuth(req);
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: '로그인 필요' })); return; }
            const code = body.code || '';
            if (!code.trim()) { res.end(JSON.stringify({ error: '코드가 비어 있습니다' })); return; }
            const result = await runHanSeon(code, 'dis');
            res.end(JSON.stringify({ disassembly: result.output, error: result.error }));
            return;
        }

        // 예제 파일 목록
        if (path === '/api/hanseon/examples') {
            try {
                const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.han'));
                const examples = files.map(f => ({
                    name: f,
                    content: fs.readFileSync(pathModule.join(EXAMPLES_DIR, f), 'utf8')
                }));
                res.end(JSON.stringify(examples));
            } catch(e) { res.end(JSON.stringify([])); }
            return;
        }

        // 표준 라이브러리 목록
        if (path === '/api/hanseon/std') {
            try {
                const files = fs.readdirSync(STD_DIR).filter(f => f.endsWith('.han'));
                const modules = files.map(f => ({
                    name: f.replace('.han', ''),
                    content: fs.readFileSync(pathModule.join(STD_DIR, f), 'utf8')
                }));
                res.end(JSON.stringify(modules));
            } catch(e) { res.end(JSON.stringify([])); }
            return;
        }

        // 셀 브릿지: JS 셀 → 한선씨 코드로 처리
        if (path === '/api/hanseon/cell-bridge' && req.method === 'POST') {
            const hsUser = getAuth(req);
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: '로그인 필요' })); return; }
            const cellId = body.cellId;
            const code = body.code || '';
            const cell = cells.find(c => c.id === cellId);
            if (!cell) { res.end(JSON.stringify({ error: '셀을 찾을 수 없습니다' })); return; }

            // JS 셀 → 한선씨 셀 변수 주입
            const stateMap = { 2: '확', 0: '미', '-2': '오', '-1': '음' };
            const st = stateMap[String(cell.state)] || '미';
            const trustTrit = Math.round((cell.trust || 0) / 100 * 13);
            const inject = `// 셀 브릿지 자동 주입\n` +
                `변수 셀이름 = "${cell.name || ''}";\n` +
                `변수 셀상태 = "${st}";\n` +
                `변수 셀근거 = ${cell.evidence || 0};\n` +
                `변수 셀신뢰 = ${trustTrit};\n` +
                `변수 셀타입 = ${cell.type || 0};\n\n` +
                code;
            const result = await runHanSeon(inject, 'run');

            // 출력에서 셀 업데이트 파싱 (선택사항: 출력 중 "셀갱신:상태=확,근거=3" 형식)
            const updateMatch = (result.output || '').match(/셀갱신:상태=(\S+),근거=(\d+)/);
            if (updateMatch) {
                const reverseMap = { '확': 2, '미': 0, '오': -2, '음': -1 };
                cell.state = reverseMap[updateMatch[1]] ?? cell.state;
                cell.evidence = parseInt(updateMatch[2]) || cell.evidence;
                cell.modified = Date.now();
                saveJSON('cells.json', cells);
            }
            res.end(JSON.stringify({ ...result, cell: { id: cell.id, name: cell.name, state: cell.state, evidence: cell.evidence } }));
            return;
        }

        // ── CrownyBus.com 프록시 ──
        if (path.startsWith('/api/bus/')) {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const busPath = '/v2/' + path.slice(9);  // /api/bus/xxx → /v2/xxx
            const busToken = user.busToken || null;
            const r = await crownyBusAPI(req.method, busPath, req.method === 'POST' ? body : null, busToken);
            res.statusCode = r.status || 502;
            res.end(JSON.stringify(r.data));
            return;
        }

        // ── CrownyBus 지갑 동기화 ──
        if (path === '/api/bus/sync-wallet' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            // 로컬 잔액을 crownybus에 동기화 시도
            const wallet = getWallet(user.username);
            const r = await crownyBusAPI('POST', '/v2/transfer', {
                asset: 'CRM', from: 'local', to: user.walletAddress,
                amount: wallet.balances.CRM, memo: 'CrownyTVM sync'
            }, user.busToken);
            res.end(JSON.stringify({ localBalances: wallet.balances, busResponse: r.data, busStatus }));
            return;
        }

        // ── 관리자 API ──
        if (path === '/api/admin/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            res.end(JSON.stringify(getServerStatus()));
            return;
        }

        if (path === '/api/admin/users' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            const userList = Object.values(users).map(u => ({
                username: u.username, email: u.email, displayName: u.displayName,
                walletAddress: u.walletAddress, verified: u.verified, created: u.created,
                isAdmin: ADMIN_USERS.includes(u.username),
                busLinked: !!u.busLinked, busLinkedAt: u.busLinkedAt || null,
                balances: getWallet(u.username).balances,
            }));
            res.end(JSON.stringify(userList));
            return;
        }

        if (path === '/api/admin/bus-check' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            await syncBusStatus();
            res.end(JSON.stringify(busStatus));
            return;
        }

        // 동기화 큐 상태
        if (path === '/api/admin/sync-queue' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            const failed = loadJSON('bus_sync_failed.json', []);
            res.end(JSON.stringify({ pending: syncQueue, failed: failed.slice(-20), pendingCount: syncQueue.length, failedCount: failed.length }));
            return;
        }

        // 수동 큐 처리 트리거
        if (path === '/api/admin/sync-flush' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            await processSyncQueue();
            res.end(JSON.stringify({ success: true, remaining: syncQueue.length }));
            return;
        }

        // 수동 계정 연동
        if (path === '/api/admin/bus-link' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"관리자 권한 필요"}'); return;
            }
            const targetUser = body.username;
            if (!users[targetUser]) { res.end('{"error":"사용자 없음"}'); return; }
            const r = await busLogin(targetUser, body.password || '', users[targetUser].email);
            res.end(JSON.stringify(r));
            return;
        }

        // ═══ 독립 소셜 피드 ═══

        // GET /api/social/feed — 소셜 피드 조회
        if (path === '/api/social/feed' && req.method === 'GET') {
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const page = parseInt(url.searchParams.get('page') || '0');
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
            const sorted = posts.sort((a, b) => (b.ts || 0) - (a.ts || 0));
            const paged = sorted.slice(page * limit, (page + 1) * limit);
            // 사용자 정보 첨부
            const enriched = paged.map(p => ({
                ...p,
                authorName: users[p.author]?.displayName || p.author,
                authorPhotoURL: users[p.author]?.photoURL || '',
            }));
            res.end(JSON.stringify({ posts: enriched, total: posts.length }));
            return;
        }

        // POST /api/social/post — 게시물 작성
        if (path === '/api/social/post' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const text = (body.text || '').trim();
            const youtubeUrl = (body.youtubeUrl || '').trim();
            const imageData = (body.image || '').trim(); // base64 or CIF
            if (!text && !youtubeUrl && !imageData) { res.statusCode = 400; res.end('{"error":"내용을 입력하세요"}'); return; }

            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}

            // YouTube oEmbed 메타데이터 추출
            let ytMeta = null;
            if (youtubeUrl) {
                const ytId = extractYoutubeId(youtubeUrl);
                if (ytId) {
                    ytMeta = { id: ytId, url: youtubeUrl, type: youtubeUrl.includes('/shorts/') ? 'short' : 'video' };
                }
            }

            // 이미지 저장 (base64 → 파일)
            let imagePath = null;
            if (imageData && imageData.startsWith('data:image')) {
                const imgDir = pathModule.join(SOCIAL_DIR, 'images');
                if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
                const ext = imageData.includes('png') ? 'png' : 'jpg';
                const fname = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
                const b64 = imageData.split(',')[1];
                fs.writeFileSync(pathModule.join(imgDir, fname), Buffer.from(b64, 'base64'));
                imagePath = `/social-images/${fname}`;
            }

            const post = {
                id: `p_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                author: user.username,
                text,
                image: imagePath,
                youtube: ytMeta,
                likes: [],
                commentCount: 0,
                ts: Date.now(),
            };
            posts.push(post);
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true, post: { ...post, authorName: user.displayName || user.username } }));
            return;
        }

        // POST /api/social/like — 좋아요 토글
        if (path === '/api/social/like' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const post = posts.find(p => p.id === body.postId);
            if (!post) { res.statusCode = 404; res.end('{"error":"게시물 없음"}'); return; }
            if (!post.likes) post.likes = [];
            const idx = post.likes.indexOf(user.username);
            if (idx >= 0) post.likes.splice(idx, 1);
            else post.likes.push(user.username);
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true, liked: idx < 0, count: post.likes.length }));
            return;
        }

        // GET /api/social/comments?postId= — 댓글 조회
        if (path === '/api/social/comments' && req.method === 'GET') {
            const postId = url.searchParams.get('postId');
            const commFile = pathModule.join(SOCIAL_DIR, `comments_${postId}.json`);
            let comments = [];
            try { comments = JSON.parse(fs.readFileSync(commFile, 'utf8')); } catch(e) {}
            const enriched = comments.map(c => ({ ...c, authorName: users[c.author]?.displayName || c.author }));
            res.end(JSON.stringify(enriched));
            return;
        }

        // POST /api/social/comment — 댓글 작성
        if (path === '/api/social/comment' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            if (!body.postId || !body.text?.trim()) { res.statusCode = 400; res.end('{"error":"내용을 입력하세요"}'); return; }
            const commFile = pathModule.join(SOCIAL_DIR, `comments_${body.postId}.json`);
            let comments = [];
            try { comments = JSON.parse(fs.readFileSync(commFile, 'utf8')); } catch(e) {}
            const comment = {
                id: `c_${Date.now()}`,
                author: user.username,
                text: body.text.trim(),
                ts: Date.now(),
            };
            comments.push(comment);
            fs.writeFileSync(commFile, JSON.stringify(comments, null, 1));
            // 게시물 댓글 수 업데이트
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            try {
                let posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
                const post = posts.find(p => p.id === body.postId);
                if (post) { post.commentCount = comments.length; fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1)); }
            } catch(e) {}
            res.end(JSON.stringify({ ok: true, comment: { ...comment, authorName: user.displayName || user.username } }));
            return;
        }

        // DELETE /api/social/post — 게시물 삭제
        if (path === '/api/social/post' && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"인증필요"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const idx = posts.findIndex(p => p.id === body.postId && p.author === user.username);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"게시물 없음 또는 권한 없음"}'); return; }
            posts.splice(idx, 1);
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── 통계 (공개) ──
        if (path === '/api/stats') {
            res.end(JSON.stringify({
                users: Object.keys(users).length,
                cells: cells.length,
                messages: cells.filter(c => c.type === TY.MESSAGE).length,
            }));
            return;
        }

        // ── API 목록 ──
        res.end(JSON.stringify({
            api: 'CrownyOS Platform v1.0',
            domain: DOMAIN,
            endpoints: {
                auth: ['POST /api/register', 'POST /api/login', 'POST /api/verify-email', 'GET /api/profile'],
                contacts: ['GET /api/contacts', 'POST /api/contacts'],
                messenger: ['GET /api/messages?with=user', 'POST /api/messages', 'POST /api/messages/read'],
                bible: ['GET /api/bible/quiz', 'POST /api/bible/answer'],
                wallet: ['GET /api/wallet', 'POST /api/wallet/transact', 'POST /api/wallet/swap'],
                mail: ['GET /api/mail/inbox?folder=', 'GET /api/mail/count', 'POST /api/mail/send', 'GET /api/mail/:id', 'POST /api/mail/:id/star', 'POST /api/mail/:id/move'],
                cloud: ['POST /api/cloud/pull', 'GET /api/cloud/status'],
                bus: ['ANY /api/bus/* (crownybus.com 프록시)', 'POST /api/bus/sync-wallet'],
                admin: ['GET /api/admin/status', 'GET /api/admin/users', 'GET /api/admin/bus-check', 'GET /api/admin/sync-queue', 'POST /api/admin/sync-flush', 'POST /api/admin/bus-link'],
                hanseon: ['POST /api/hanseon/run', 'POST /api/hanseon/dis', 'GET /api/hanseon/examples', 'GET /api/hanseon/std', 'POST /api/hanseon/cell-bridge'],
                social: ['GET /api/social/feed', 'POST /api/social/post', 'POST /api/social/like', 'GET /api/social/comments', 'POST /api/social/comment', 'DELETE /api/social/post'],
                public: ['GET /api/stats'],
            }
        }));

    } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
    }
});

server.listen(PORT, () => {
    console.log(`▲●▼◆ CrownyOS Platform — http://localhost:${PORT}`);
    console.log(`  도메인: ${DOMAIN}`);
    console.log(`  사용자: ${Object.keys(users).length}명`);
    console.log(`  셀: ${cells.length}개`);
    console.log('');
    console.log('  회원가입: POST /api/register {username, password, displayName}');
    console.log(`  결과: username@${DOMAIN} 이메일 생성`);

    // 독립 메신저 WebSocket 연결
    if (chatServer) {
        try {
            chatServer.attachWebSocket(server, getUser);
            console.log('[CHAT] 독립 메신저 연동 완료');
        } catch (e) {
            console.warn('[CHAT] 메신저 시작 실패:', e.message);
        }
    }

    // 독립 메일 서버 시작
    if (mailServer) {
        try {
            mailServer.init();
            // SMTP 수신 (포트 25 — ISP 차단 시 2525로 대체)
            try { mailServer.startInbound(); } catch (e) {
                console.warn('[MAIL] SMTP 수신 서버:', e.message);
                console.log('[MAIL] 포트 25 사용 불가 — 외부 수신은 DNS MX + 포트포워딩 필요');
            }
            // 발신 큐 프로세서 시작
            mailServer.startOutbound();
            console.log('[MAIL] 독립 메일 서버 연동 완료');
        } catch (e) {
            console.warn('[MAIL] 메일 서버 시작 실패:', e.message);
        }
    }
});
