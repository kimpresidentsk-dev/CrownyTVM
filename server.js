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
const zlib = require('zlib');

// ── .env 로딩 (dotenv 없이 직접 파싱) ──
try {
    const envPath = pathModule.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq > 0) process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
        });
    }
} catch (e) { /* .env is optional */ }

// 독립 메일 서버 (한선씨 고유코드 · 4상균형3진법)
let mailServer = null;
try {
    mailServer = require('./mail-server/index');
} catch (e) {
    console.warn('[MAIL] 독립 메일 서버 로드 실패:', e.message);
}

// CrownyCell Core (27-슬롯 방사형 셀 DB)
let cellCore = null;
try {
    const { CellCore } = require('./cell-core');
    cellCore = new CellCore();
    console.log('[CELL] CrownyCell Core loaded:', cellCore.stats().totalCells, 'cells');
} catch (e) {
    console.warn('[CELL] CrownyCell Core load failed:', e.message);
}

// 독립 메신저 (WebSocket + 파일 저장)
let chatServer = null;
try {
    chatServer = require('./chat-server/index');
} catch (e) {
    console.warn('[CHAT] 독립 메신저 로드 실패:', e.message);
}

// CrownyCell Chain (자체 블록체인)
let chainAdapter = null;
try {
    chainAdapter = require('./chain/adapter');
    chainAdapter.initChain({
        dataDir: pathModule.join(__dirname, 'data', 'chain'),
        legacyDataDir: pathModule.join(__dirname, 'data'),
    });
} catch (e) {
    console.warn('[CHAIN] CrownyCell Chain 로드 실패 (레거시 모드):', e.message);
}

const PORT = 7730;
const DATA_DIR = './data';
const DOMAIN = 'crowny.org';
const PUBLIC_DIR = pathModule.join(__dirname, 'public');
const CROWNYBUS_API = 'https://crownybus.com';
const ADMIN_USERS = (process.env.ADMIN_USERS || 'kps,alice,admin').split(',').map(s => s.trim()).filter(Boolean);
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
            try { fs.unlinkSync(tmpFile); } catch(e) { /* cleanup */ }
            if (err) {
                if (err.killed) resolve({ output: '', error: 'Execution timeout (5s)', timeout: true });
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
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: { error: 'Timeout' } }); });
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
        if (!user || !user.busToken) { item.retries++; item.lastError = 'busToken missing'; changed = true; continue; }

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
    return { success: false, error: r.data?.error || 'Connection failed', queued: true };
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
    return { success: false, error: r.data?.error || 'Connection failed' };
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
    if (!token) return { error: 'busToken missing' };
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
                cloudPullChatMessages(username, chat.chat_id, token).catch(e => console.warn('[BG]', e.message));
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
                try { await cloudPull(username); } catch(e) { console.warn('[BG]', e.message); }
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
            mail: { name: 'Mail Server', status: 'online', info: `${DOMAIN} webmail (${cells.filter(c => c.type === TY_MAIL).length} msgs)` },
            cloud: { name: 'Cloud Sync', status: busStatus.connected ? 'online' : 'offline', info: busStatus.connected ? 'iCloud pattern active' : 'Offline mode' },
            blockchain: { name: 'Blockchain', status: busStatus.connected ? 'online' : 'offline', info: busStatus.connected ? 'crownybus.com connected' : (busStatus.error || 'Not connected') },
            wallet: { name: 'Wallet Server', status: 'online', info: `3 currencies (CRN/FNC/CRM)` },
            chat: { name: 'Chat Server', status: 'online', info: `${cells.filter(c => c.type === TY.MESSAGE).length} msgs` },
            contacts: { name: 'Contacts Server', status: 'online', info: `${cells.filter(c => c.type === TY.CONTACT).length} entries` },
            hanseon: { name: 'HanSeon VM', status: fs.existsSync(CROWNY_BIN) ? 'online' : 'offline', info: fs.existsSync(CROWNY_BIN) ? 'ISA729 ready' : 'Binary not found' },
            quiz: { name: 'Quiz Server', status: BIBLE_QUIZ.length > 0 ? 'online' : 'offline', info: `${BIBLE_QUIZ.length} questions` },
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
    // Atomic write: write to tmp file then rename (prevents corruption on crash)
    const target = `${DATA_DIR}/${file}`;
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
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
// Guard: if users.json was corrupted to array format, convert back to dict
if (Array.isArray(users)) {
    const fixed = {};
    users.forEach(u => { if (u && u.username) { fixed[u.username] = u; if (u.passwordHash && !u.password) u.password = u.passwordHash; } });
    users = fixed;
    saveJSON('users.json', users);
    console.log('[WARN] users.json was array format — auto-converted to dict:', Object.keys(users).length, 'users');
}

// ── 비밀번호 해싱 (scrypt + 랜덤 salt) ──
function hashPasswordSecure(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(pw, salt, 64).toString('hex');
    return `scrypt:${salt}:${derived}`;
}

function verifyPassword(pw, stored) {
    // scrypt 형식: "scrypt:salt:hash"
    if (stored.startsWith('scrypt:')) {
        const [, salt, hash] = stored.split(':');
        const derived = crypto.scryptSync(pw, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
    }
    // 레거시 SHA-256 (마이그레이션 전 기존 사용자)
    const legacy = crypto.createHash('sha256').update(pw + 'crowny_salt_2026').digest('hex');
    return stored === legacy;
}

function hashPassword(pw) {
    return hashPasswordSecure(pw);
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

const SESSIONS_FILE = pathModule.join(DATA_DIR, 'sessions.json');
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7일 만료
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch(e) { /* first run */ }
function saveSessions() { try { const tmp = SESSIONS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(sessions)); fs.renameSync(tmp, SESSIONS_FILE); } catch(e) { console.warn('[SAVE]', e.message); } }

// ── Rate Limiter (인메모리, IP 기반) ──
const _rateLimits = {};
function rateLimit(ip, endpoint, maxPerMin) {
    const key = `${ip}:${endpoint}`;
    const now = Date.now();
    if (!_rateLimits[key]) _rateLimits[key] = [];
    _rateLimits[key] = _rateLimits[key].filter(t => now - t < 60000);
    if (_rateLimits[key].length >= maxPerMin) return false;
    _rateLimits[key].push(now);
    return true;
}
// 5분마다 오래된 항목 정리
setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(_rateLimits)) {
        _rateLimits[key] = _rateLimits[key].filter(t => now - t < 60000);
        if (_rateLimits[key].length === 0) delete _rateLimits[key];
    }
}, 300000);

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

// ═══ E1: OTP / SMS Authentication ═══
const otpStore = {}; // { phone: { code, expires, attempts } }

function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

async function sendOTP(phone, code) {
    // Pluggable SMS provider via env vars
    const provider = process.env.SMS_PROVIDER || 'console';
    if (provider === 'twilio' && process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) {
        const auth = Buffer.from(process.env.TWILIO_SID + ':' + process.env.TWILIO_TOKEN).toString('base64');
        const body = new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: `CROWNY verification: ${code}` });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`, {
            method: 'POST', headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
        });
        return true;
    }
    if (provider === 'africastalking' && process.env.AT_API_KEY && process.env.AT_USERNAME) {
        const body = new URLSearchParams({ username: process.env.AT_USERNAME, to: phone, message: `CROWNY verification: ${code}` });
        await fetch('https://api.africastalking.com/version1/messaging', {
            method: 'POST', headers: { 'apiKey': process.env.AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
        });
        return true;
    }
    // Default: console output (dev mode)
    console.log(`[OTP] ${phone} → ${code}`);
    return true;
}

function createUser(username, password, displayName) {
    if (users[username]) return { error: 'Username already exists' };
    if (!/^[a-z0-9._-]{2,20}$/.test(username)) return { error: 'Username: lowercase letters/numbers/._- 2-20 chars' };

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
        const { execFileSync } = require('child_process');
        execFileSync('crowny-mailbox', ['create', username, password], { timeout: 5000 });
        console.log(`[메일] ${email} 메일박스 생성 완료`);
    } catch (e) {
        console.log(`[메일] 메일박스 생성 건너뜀 (Postfix 미설치): ${e.message.split('\n')[0]}`);
    }

    // CrownyBus.com 계정 연동 (비동기, 실패 시 큐)
    busRegister(username, password, email, displayName).catch(e => console.warn('[BG]', e.message));

    return {
        success: true,
        username,
        email,
        cellId: cell.id,
        walletAddress,
        message: `${email} created. Verify email for +1 trust.`
    };
}

function loginUser(username, password) {
    // 이메일로 로그인 시 username 추출: "user@crowny.org" → "user"
    if (username && username.includes('@')) username = username.split('@')[0];
    const user = users[username];
    if (!user || !verifyPassword(password, user.password))
        return { error: 'Invalid username or password' };

    // 레거시 SHA-256 → scrypt 자동 마이그레이션
    if (!user.password.startsWith('scrypt:')) {
        user.password = hashPasswordSecure(password);
        saveJSON('users.json', users);
    }

    const token = generateToken();
    sessions[token] = { username, created: Date.now() };
    saveSessions();

    // CrownyBus.com 로그인 연동 (비동기, busToken 갱신)
    if (!user.busToken || !user.busLinked) {
        busLogin(username, password, user.email).then(() => {
            // 로그인 성공 시 클라우드 풀 (iPhone 잠금해제 → iCloud 동기화)
            cloudPull(username).catch(e => console.warn('[BG]', e.message));
        }).catch(e => console.warn('[BG]', e.message));
    } else {
        // 이미 연동된 경우에도 풀 실행
        cloudPull(username).catch(e => console.warn('[BG]', e.message));
    }

    return { success: true, token, username, email: user.email, displayName: user.displayName || username, photoURL: user.photoURL || '', cellId: user.cellId, busLinked: !!user.busLinked };
}

function verifyEmail(username) {
    const user = users[username];
    if (!user || user.verified) return { error: 'Already verified' };
    user.verified = true;
    addEvidence(user.cellId);  // 이메일 인증 = 근거1
    saveJSON('users.json', users);
    const cell = findCell(user.cellId);
    return { success: true, evidence: cell.evidence, state: cell.state === 2 ? 'confirmed' : 'unconfirmed' };
}

function getUser(token) {
    const session = sessions[token];
    if (!session) return null;
    // 세션 만료 체크
    if (Date.now() - session.created > SESSION_TTL) {
        delete sessions[token];
        saveSessions();
        return null;
    }
    return users[session.username] || null;
}

// ═══ 연락처 앱 ═══

function addContact(ownerUsername, contactName, phone, relation, extra = {}) {
    const owner = users[ownerUsername];
    if (!owner) return { error: 'User not found' };

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
    }).catch(e => console.warn('[BG]', e.message));

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
    if (!from || !to) return { error: 'User not found' };

    // CRM tip if specified
    if (crmmAmount > 0) {
        const wallet = getWallet(fromUsername);
        if ((wallet.balances.CRM || 0) < crmmAmount) return { error: 'Insufficient CRM balance' };
        // Process the tip transfer
        walletTransact(fromUsername, 'send', crmmAmount, toUsername, `CRM gift: ${content.slice(0, 20)}`, 'CRM');
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
    }).catch(e => console.warn('[BG]', e.message));

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
    if (!msg || msg.to !== username) return { error: 'Permission denied' };
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
    if (BIBLE_QUIZ.length === 0) return { error: 'Unable to load quiz data' };
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

function getAllQuiz(username) {
    if (BIBLE_QUIZ.length === 0) return { error: 'Unable to load quiz data' };
    const state = getQuizState(username);

    const maxDifficulty = state.level >= 3 ? 3 : state.level >= 2 ? 2 : 1;
    const pool = BIBLE_QUIZ.filter(q => q.l <= maxDifficulty && !state.answeredIds.has(q.i));
    if (pool.length === 0) return { complete: true, total: state.answeredIds.size, correct: state.totalCorrect, rounds: state.roundsCompleted };

    // Always return a full round of ROUND_SIZE (27) questions
    const questions = [];
    const used = new Set();
    const domains = ['SP','HU','LW','SV','HI','LD'];

    for (let i = 0; i < ROUND_SIZE && i < pool.length; i++) {
        const domainPref = domains[i % domains.length];
        const available = pool.filter(q => !used.has(q.i));
        if (available.length === 0) break;
        const filtered = available.filter(q => q.d === domainPref);
        const source = filtered.length > 0 ? filtered : available;
        const pick = source[Math.floor(Math.random() * source.length)];
        used.add(pick.i);
        questions.push({
            quizId: pick.i,
            question: pick.q,
            options: pick.o,
            category: CATEGORY_NAMES[pick.c] || pick.c,
            domain: DOMAIN_NAMES[pick.d] || pick.d,
            difficulty: pick.l,
            reference: pick.r,
        });
    }

    return { questions, round: { answered: state.roundAnswered, total: ROUND_SIZE, correct: state.roundCorrect } };
}

function answerQuiz(username, quizId, selectedIndex) {
    const qid = typeof quizId === 'string' ? parseInt(quizId) : quizId;
    const sidx = typeof selectedIndex === 'string' ? parseInt(selectedIndex) : selectedIndex;
    const quiz = BIBLE_QUIZ.find(q => q.i === qid);
    if (!quiz) return { error: 'Invalid quiz' };

    const correct = sidx === quiz.a;
    const scoreCell = createCell(`성경:${quiz.r}`, TY.QUIZ_SCORE, qid, username);
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
            c.memo && (c.memo.startsWith('Quiz reward') || c.memo.startsWith('퀴즈 보상')) &&
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
            walletTransact(username, 'deposit', 1, null, `Quiz reward (${prevCorrect}/${ROUND_SIZE})`, 'CRM');
        }
        let rewardMsg = passed ? '1 CRM' : null;
        if (passed && !canReward) rewardMsg = `Daily limit exceeded (${todayCRM}/${DAILY_QUIZ_REWARD_CAP})`;
        if (passed && !withinCap) rewardMsg = `Wallet cap exceeded (${crmmBalance}/${WALLET_CAP_BASIC} CRM)`;
        roundResult = { completed: true, correct: prevCorrect, total: ROUND_SIZE, passed, reward: rewardMsg, dailyEarned: todayCRM };
    }

    saveCells();

    // ── iCloud Push: 퀴즈 → CrownyBus ──
    cloudPush(username, 'quiz_submit', 'POST', '/v2/bible/quiz/submit', {
        answers: [{ question_id: quizId, selected: selectedIndex }]
    }).catch(e => console.warn('[BG]', e.message));
    // 라운드 완료 + 보상 시 claim
    if (roundResult && roundResult.passed && roundResult.reward === '1 CRM') {
        cloudPush(username, 'quiz_claim', 'POST', '/v2/bible/quiz/claim', {
            session_id: `round_${state.roundsCompleted}`
        }).catch(e => console.warn('[BG]', e.message));
    }

    return {
        correct,
        correctAnswer: quiz.o[quiz.a],
        reference: quiz.r,
        round: { current: state.roundAnswered, total: ROUND_SIZE, correct: state.roundCorrect },
        roundResult,
        message: correct ? 'Correct!' : `Wrong. Answer: ${quiz.o[quiz.a]}`,
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
    // CrownyCell Chain 사용 가능하면 체인에서 조회 (null이면 레거시 폴백)
    if (chainAdapter) {
        try {
            const chainWallet = chainAdapter.chainGetWallet(username);
            if (chainWallet) return chainWallet;
        } catch (e) { console.warn('[CHAIN] getWallet fallback:', e.message); }
    }
    // 레거시 폴백 (JSON 기반)
    const wallets = findCellsByOwner(username, TY.WALLET);
    const txns = findCellsByOwner(username, TY.TRANSACTION);

    let balances = { CRN: 0, FNC: 0, CRM: 0 };
    txns.forEach(t => {
        let currency = t.currency || 'CRN';
        if (!['CRN','FNC','CRM'].includes(currency)) currency = 'CRM';
        if (t.txType === 'receive' || t.txType === 'deposit' || t.txType === 'swap_in') balances[currency] += t.value;
        else if (t.txType === 'send' || t.txType === 'withdraw' || t.txType === 'swap_out') balances[currency] -= t.value;
    });

    const baseRates = { CRN: 25500, FNC: 2550, CRM: 25.5 };
    const variation = 1 + (Math.random() * 0.04 - 0.02);
    const prices = {
        CRN: Math.round(baseRates.CRN * variation * 100) / 100,
        FNC: Math.round(baseRates.FNC * variation * 100) / 100,
        CRM: Math.round(baseRates.CRM * variation * 100) / 100,
    };

    return {
        wallet: wallets[0] || null,
        walletAddress: users[username]?.walletAddress || '',
        username, balances, prices,
        totalKRW: Math.round(balances.CRN * prices.CRN + balances.FNC * prices.FNC + balances.CRM * prices.CRM),
        transactions: txns.sort((a, b) => b.created - a.created).slice(0, 30),
    };
}

function walletTransact(username, type, amount, toUser = null, memo = '', currency = 'CRN') {
    // CrownyCell Chain 사용 가능하면 체인 트랜잭션
    if (chainAdapter) {
        try {
            const result = chainAdapter.chainWalletTransact(username, type, amount, toUser, memo, currency);
            if (result && !result.error) return result;
            // 체인 에러 시 레거시로 폴백
            if (result && result.error) console.warn('[CHAIN] walletTransact error:', result.error);
        } catch (e) { console.warn('[CHAIN] walletTransact fallback:', e.message); }
    }
    // 레거시 폴백
    const user = users[username];
    if (!user) return { error: 'user not found' };
    if (amount <= 0) return { error: 'amount must be positive' };
    if (!['CRN','FNC','CRM'].includes(currency)) return { error: 'invalid currency' };

    const wallet = getWallet(username);
    if ((type === 'send' || type === 'withdraw') && (wallet.balances[currency] || 0) < amount)
        return { error: `insufficient ${currency}` };

    const txn = createCell(memo || `${type}:${amount} ${currency}`, TY.TRANSACTION, amount, username);
    txn.txType = type; txn.toUser = toUser; txn.memo = memo; txn.currency = currency;
    if (wallet.wallet) connectCells(wallet.wallet.id, txn.id, 3);

    if (toUser && users[toUser]) {
        const receiveTxn = createCell(memo || `receive:${amount} ${currency}`, TY.TRANSACTION, amount, toUser);
        receiveTxn.txType = 'receive'; receiveTxn.fromUser = username; receiveTxn.memo = memo; receiveTxn.currency = currency;
        const toWallet = getWallet(toUser);
        if (toWallet.wallet) connectCells(toWallet.wallet.id, receiveTxn.id, 4);
    }
    saveCells();

    if (type === 'send' && toUser) {
        const toAddr = users[toUser]?.walletAddress || toUser;
        syncTransfer(username, currency, amount, toAddr, memo || `send to ${toUser}`);
    }
    return { success: true, txnId: txn.id, type, amount, currency, balances: getWallet(username).balances };
}

function swapTokens(username, fromCurrency, toCurrency, amount) {
    // CrownyCell Chain
    if (chainAdapter) {
        try {
            const result = chainAdapter.chainSwapTokens(username, fromCurrency, toCurrency, amount);
            if (result && !result.error) return result;
            if (result && result.error) console.warn('[CHAIN] swapTokens error:', result.error);
        } catch (e) { console.warn('[CHAIN] swapTokens fallback:', e.message); }
    }
    // 레거시 폴백
    const user = users[username];
    if (!user) return { error: 'user not found' };
    if (amount <= 0) return { error: 'amount must be positive' };

    const SWAP_RULES = {
        'CRM->FNC': { divisor: 100 },
        'FNC->CRN': { divisor: 10 },
        'CRN->FNC': { multiplier: 10,   fee: 0.07 },
        'FNC->CRM': { multiplier: 100,  fee: 0.07 },
        'CRN->CRM': { multiplier: 1000, fee: 0.07 },
    };
    const rule = SWAP_RULES[`${fromCurrency}->${toCurrency}`];
    if (!rule) return { error: `swap ${fromCurrency} → ${toCurrency} not allowed` };

    const wallet = getWallet(username);
    if ((wallet.balances[fromCurrency] || 0) < amount) return { error: `insufficient ${fromCurrency}` };

    const slippage = 1 + (Math.random() * 0.04 - 0.02);
    let received, donation = 0;
    if (rule.divisor) {
        // 상향
        received = Math.floor(amount / rule.divisor * slippage * 1000) / 1000;
    } else {
        // 하향 (7% 기부)
        const gross = amount * rule.multiplier * slippage;
        donation = Math.floor(gross * rule.fee);
        received = Math.floor((gross - donation) * 1000) / 1000;
    }
    if (received <= 0) return { error: 'swap amount too small' };

    const outTxn = createCell(`swap:${amount} ${fromCurrency} → ${received} ${toCurrency}`, TY.TRANSACTION, amount, username);
    outTxn.txType = 'swap_out'; outTxn.currency = fromCurrency;
    const inTxn = createCell(`swap:${received} ${toCurrency}`, TY.TRANSACTION, received, username);
    // 하향 기부금 기록
    if (donation > 0) {
        const donTxn = createCell(`donation:${donation} ${toCurrency} (7% swap fee)`, TY.TRANSACTION, donation, 'donation-pool');
        donTxn.txType = 'donation'; donTxn.currency = toCurrency;
        donTxn.fromUser = username; donTxn.memo = `${fromCurrency}→${toCurrency} downward swap`;
    }
    inTxn.txType = 'swap_in'; inTxn.currency = toCurrency;
    saveCells();
    syncSwap(username, fromCurrency, toCurrency, amount);

    const updated = getWallet(username);
    return { success: true, sent: amount, sentCurrency: fromCurrency, received, receivedCurrency: toCurrency, donation, donationCurrency: donation > 0 ? toCurrency : null, slippage: Math.round((slippage - 1) * 10000) / 100, balances: updated.balances };
}

// ═══ 메일 시스템 (username@crowny.org 웹메일) ═══

const TY_MAIL = 406;

function sendEmail(fromUsername, toAddress, subject, body, replyTo = null) {
    const from = users[fromUsername];
    if (!from) return { error: 'User not found' };

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
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: 'Mail not found' };
    mail.read = true;
    mail.modified = Date.now();
    saveCells();
    return { success: true, mail };
}

function starMail(mailId, username, starred) {
    const mail = findCell(mailId);
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: 'Mail not found' };
    mail.starred = !!starred;
    mail.modified = Date.now();
    saveCells();
    return { success: true };
}

function moveMail(mailId, username, folder) {
    const mail = findCell(mailId);
    if (!mail || mail.owner !== username || mail.type !== TY_MAIL) return { error: 'Mail not found' };
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
    if (!data || !data.version) return { error: 'Invalid data format' };
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

function parseBody(req, maxBytes = 5 * 1024 * 1024) { // 5MB default limit
    return new Promise(resolve => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) { req.destroy(); resolve({}); return; }
            body += chunk;
        });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });
}

// ── 채팅 번역 사전 (Dictionary-based translation) ──
const CHAT_DICT = {
    // Korean → English mappings (common chat phrases)
    'ko': {
        '안녕하세요': 'Hello',
        '안녕': 'Hi',
        '감사합니다': 'Thank you',
        '고마워': 'Thanks',
        '네': 'Yes',
        '아니요': 'No',
        '좋아요': 'Good / Like',
        '알겠습니다': 'I understand',
        '반갑습니다': 'Nice to meet you',
        '죄송합니다': 'I\'m sorry',
        '괜찮아요': 'It\'s okay',
        '어디에 있어요?': 'Where are you?',
        '뭐해요?': 'What are you doing?',
        '잠깐만요': 'Wait a moment',
        '도와주세요': 'Please help me',
        '사랑해요': 'I love you',
        '축하합니다': 'Congratulations',
        '생일 축하해요': 'Happy birthday',
        '잘 지내요?': 'How are you?',
        '잘 지내요': 'I\'m doing well',
        '또 봐요': 'See you again',
        '수고하셨습니다': 'Good job / Well done',
        '화이팅': 'Fighting! / You can do it!',
        '맞아요': 'That\'s right',
        '몰라요': 'I don\'t know',
        '어떻게': 'How',
        '언제': 'When',
        '왜': 'Why',
        '배고파요': 'I\'m hungry',
        '피곤해요': 'I\'m tired',
        '재미있어요': 'It\'s fun',
        'ㅋㅋ': 'haha',
        'ㅋㅋㅋ': 'hahaha',
        'ㅎㅎ': 'hehe',
        'ㅠㅠ': '(crying)',
        'ㅇㅇ': 'yeah',
    },
    // English → Korean
    'en': {
        'hello': '안녕하세요',
        'hi': '안녕',
        'thank you': '감사합니다',
        'thanks': '고마워요',
        'yes': '네',
        'no': '아니요',
        'good': '좋아요',
        'ok': '괜찮아요',
        'okay': '괜찮아요',
        'sorry': '죄송합니다',
        'nice to meet you': '반갑습니다',
        'how are you': '잘 지내요?',
        'i\'m fine': '잘 지내요',
        'see you': '또 봐요',
        'bye': '안녕히 가세요',
        'goodbye': '안녕히 가세요',
        'help': '도와주세요',
        'wait': '잠깐만요',
        'i love you': '사랑해요',
        'happy birthday': '생일 축하해요',
        'congratulations': '축하합니다',
        'i don\'t know': '몰라요',
        'haha': 'ㅋㅋ',
        'lol': 'ㅋㅋㅋ',
    }
};

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function simpleTranslate(text, targetLang) {
    if (!text || !targetLang) return { translated: text, sourceLang: 'unknown' };
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // Detect source language
    const hasKorean = /[\uAC00-\uD7AF\u3130-\u318F]/.test(trimmed);
    const sourceLang = hasKorean ? 'ko' : 'en';

    // If source and target are the same, return as-is
    if (sourceLang === targetLang) return { translated: text, sourceLang, same: true };

    // Try exact match
    const dict = CHAT_DICT[sourceLang] || {};
    const key = hasKorean ? trimmed : lower;
    if (dict[key]) return { translated: dict[key], sourceLang, targetLang };

    // Try partial match (for longer sentences, translate known words)
    let result = trimmed;
    let matched = false;
    const sortedKeys = Object.keys(dict).sort((a, b) => b.length - a.length); // longest first
    for (const phrase of sortedKeys) {
        const searchKey = phrase;
        if (result.includes(searchKey) || result.toLowerCase().includes(searchKey)) {
            result = result.replace(new RegExp(escapeRegex(searchKey), 'gi'), dict[phrase]);
            matched = true;
        }
    }

    if (matched) return { translated: result, sourceLang, targetLang, partial: true };

    // No translation available
    return { translated: text, sourceLang, targetLang, unavailable: true };
}

function getAuth(req) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = getUser(token);
    // 체인 키페어 캐시 (API 호출 시마다 확인)
    if (user && chainAdapter && users[user.username]) {
        try { chainAdapter.onUserLogin(user.username, users[user.username].password); } catch {}
    }
    return user;
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

// ── NQ 가격 백그라운드 캐시 (5초마다 소스에서 갱신, 클라이언트는 0.5초마다 캐시 조회) ──
let _nqCache = { price: null, bid: null, ask: null, source: 'none', ts: 0 };

async function _fetchNQPrice() {
    // 1차: Railway Databento (실시간)
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const r = await fetch('https://web-production-26db6.up.railway.app/api/market/live', { signal: controller.signal });
        clearTimeout(t);
        const d = await r.json();
        if (d && d.price && d.connected !== false) {
            _nqCache = { price: d.price, bid: d.bid, ask: d.ask, source: 'databento', ts: d.timestamp || Date.now() };
            return;
        }
    } catch(e) { /* fallback to next source */ }

    // 2차: Yahoo Finance NQ=F
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=1d', {
            signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        clearTimeout(t);
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
            _nqCache = { price: meta.regularMarketPrice, bid: meta.bid || meta.regularMarketPrice, ask: meta.ask || meta.regularMarketPrice, source: 'yahoo', ts: Date.now() };
            return;
        }
    } catch(e) { /* fallback to next source */ }

    // 3차: TwelveData QQQ → NQ 근사
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://api.twelvedata.com/price?symbol=QQQ&apikey=demo', { signal: controller.signal });
        clearTimeout(t);
        const d = await r.json();
        if (d && d.price) {
            _nqCache = { price: parseFloat(d.price) * 53.5, source: 'twelvedata-qqq', ts: Date.now() };
            return;
        }
    } catch(e) { /* fallback to next source */ }

    // 4차: Railway 캐시값
    try {
        const r = await fetch('https://web-production-26db6.up.railway.app/api/market/live');
        const d = await r.json();
        if (d && d.price) {
            _nqCache = { price: d.price, bid: d.bid, ask: d.ask, source: 'databento-cached', ts: d.timestamp || Date.now() };
        }
    } catch(e) { /* fallback to next source */ }
}

// 서버 시작 시 즉시 1회 + 2초 간격 갱신 (Yahoo rate limit 안전 범위)
_fetchNQPrice();
setInterval(_fetchNQPrice, 2000);

const ALLOWED_ORIGINS = new Set([
    'https://crowny.org', 'https://www.crowny.org', 'https://crownybus.com',
    'http://localhost:7730', 'http://127.0.0.1:7730',
]);

var _activeConnections = 0;
const server = http.createServer(async (req, res) => {
    _activeConnections++;
    res.on('finish', () => { _activeConnections--; });
    // CORS: 화이트리스트 기반 (#7)
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // same-origin 요청 (브라우저가 Origin 안 보냄)은 CORS 헤더 불필요
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 보안 헤더 (#6)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https://crownybus.com wss: ws:; frame-src 'none';");

    if (req.method === 'OPTIONS') { res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = url.pathname;

    // ── /v2/ → /api/ 호환 매핑 (경로만, body 접근 없음) ──
    const isV2 = path.startsWith('/v2/');
    if (path === '/v2/chat/list') path = '/api/chat/list';
    else if (path === '/v2/chat/create' && req.method === 'POST') path = '/api/chat/create'; // body 변환은 파싱 후
    else if (path === '/v2/chat/send' && req.method === 'POST') path = '/_v2_chat_send'; // body 파싱 후 처리
    else if (path.startsWith('/v2/chat/') && path.endsWith('/messages')) path = '/api/chat/' + path.split('/')[3] + '/messages';
    else if (path.startsWith('/v2/chat/')) path = '/api/chat/' + path.slice(9);
    else if (path === '/v2/contacts') path = '/api/contacts';
    else if (path === '/v2/contacts/pending') { res.end(JSON.stringify({ contacts: [] })); return; }
    else if (path.startsWith('/v2/contacts/')) {
        const parts = path.split('/');
        if (parts[4] === 'accept' || parts[4] === 'block') { res.end(JSON.stringify({ success: true })); return; }
        path = '/api/contacts';
    }
    // ── v2 API 스텁 (CrownyOS Rust 서버 대체) ──
    else if (path.startsWith('/v2/bible/')) {
        // Bible → CrownyTVM quiz 시스템으로 매핑
        if (path.includes('/quiz/today')) path = '/api/bible/quiz';
        else if (path.includes('/quiz/history')) { res.end(JSON.stringify({ history: [] })); return; }
        else if (path.includes('/quiz/stats')) { res.end(JSON.stringify({ total: 0, correct: 0 })); return; }
        else if (path.includes('/reflections')) { res.end(JSON.stringify({ reflections: [] })); return; }
        else if (path.includes('/stats')) { res.end(JSON.stringify({ days: 0 })); return; }
        else { res.end('{}'); return; }
    }
    else if (path.startsWith('/v2/chain/')) {
        // Chain → CrownyTVM chain API로 매핑
        if (path.includes('/info') || path.includes('/stats')) path = '/api/chain/status';
        else if (path.includes('/blocks')) { path = '/api/chain/block'; }
        else { res.end('{}'); return; }
    }
    else if (path.startsWith('/v2/trading/')) { res.end(JSON.stringify({ profiles: [], trades: [] })); return; }
    else if (path.startsWith('/v2/devops/')) { res.end(JSON.stringify({ items: [] })); return; }
    else if (path.startsWith('/v2/project/')) { res.end(JSON.stringify({ projects: [] })); return; }
    else if (path.startsWith('/v2/mind/')) { res.end(JSON.stringify({ usage: { tokens: 0 } })); return; }
    else if (path.startsWith('/v2/binance/')) { res.end(JSON.stringify({ klines: [] })); return; }
    else if (path.startsWith('/v2/crm/')) { res.end(JSON.stringify({ persons: [] })); return; }

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
    if (!path.startsWith('/api') && !path.startsWith('/v2/') && !path.startsWith('/_v2_')) {
        const filePath = pathModule.join(PUBLIC_DIR, path === '/' ? 'index.html' : path);
        const safe = pathModule.resolve(filePath).startsWith(PUBLIC_DIR);
        if (safe && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = pathModule.extname(filePath);
            res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
            // 캐시: ?v= 쿼리스트링으로 버스팅, 장기 캐시 적용
            if (['.js', '.css'].includes(ext)) {
                res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days (busted by ?v=)
            } else if (ext === '.html') {
                res.setHeader('Cache-Control', 'no-cache'); // always revalidate HTML
            } else if (ext === '.json' && filePath.includes('/lang/')) {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // lang files 1 day
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff2', '.woff', '.ttf'].includes(ext)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
            }
            // gzip compression for text-based files
            const compressible = ['.js', '.css', '.html', '.json', '.svg'];
            const acceptEncoding = req.headers['accept-encoding'] || '';
            if (compressible.includes(ext) && acceptEncoding.includes('gzip')) {
                res.setHeader('Content-Encoding', 'gzip');
                fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
            } else {
                fs.createReadStream(filePath).pipe(res);
            }
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

    // ── v2 body 변환 (body 파싱 후) ──
    if (path === '/_v2_chat_send' && body.chat_id) {
        path = '/api/chat/' + body.chat_id + '/send';
        body.text = body.content || body.text || '';
    } else if (path === '/_v2_chat_send') {
        path = '/api/chat/list';
    }
    if (isV2 && path === '/api/chat/create') {
        if (body.participants && body.participants.length > 0) body.to = body.participants.length === 1 ? body.participants[0] : body.participants;
        if (body.chat_type) body.type = body.chat_type === 'dm' ? 'dm' : 'group';
        if (body.name) body.groupName = body.name;
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

    try {
        // ── Health check ──
        if (path === '/api/health') {
            res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB', connections: _activeConnections || 0, timestamp: Date.now() }));
            return;
        }

        // ── YouTube thumbnail proxy (no external dependency on client) ──
        if (path.startsWith('/api/yt-thumb/') && req.method === 'GET') {
            const videoId = path.split('/api/yt-thumb/')[1];
            if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) { res.statusCode = 400; res.end('bad id'); return; }
            if (!rateLimit(clientIp, 'yt-thumb', 60)) { res.statusCode = 429; res.end('rate limited'); return; }
            const ytUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
            https.get(ytUrl, (upstream) => {
                res.writeHead(upstream.statusCode, { 'Content-Type': upstream.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
                upstream.pipe(res);
            }).on('error', () => { res.statusCode = 502; res.end('proxy error'); });
            return;
        }

        // ── IPFS proxy ──
        if (path.startsWith('/api/ipfs/') && req.method === 'GET') {
            const cid = path.split('/api/ipfs/')[1];
            if (!cid || cid.length < 10 || cid.length > 100) { res.statusCode = 400; res.end('bad cid'); return; }
            if (!rateLimit(clientIp, 'ipfs', 10)) { res.statusCode = 429; res.end('rate limited'); return; }
            const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;
            https.get(ipfsUrl, (upstream) => {
                res.writeHead(upstream.statusCode, { 'Content-Type': upstream.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'public, max-age=604800' });
                upstream.pipe(res);
            }).on('error', () => { res.statusCode = 502; res.end('proxy error'); });
            return;
        }

        // ── Market candles proxy (polygon.io) ──
        if (path === '/api/market/candles' && req.method === 'GET') {
            if (!rateLimit(clientIp, 'market-candles', 10)) { res.statusCode = 429; res.end('{}'); return; }
            const params = new URL(req.url, 'http://localhost').searchParams;
            const ticker = params.get('ticker') || 'C:NQ';
            const from = params.get('from');
            const to = params.get('to');
            if (!from || !to) { res.statusCode = 400; res.end('{"error":"missing from/to"}'); return; }
            const apiKey = (process.env.POLYGON_API_KEY || (typeof MASSIVE_CONFIG !== 'undefined' && MASSIVE_CONFIG.apiKey) || '');
            if (!apiKey) { res.statusCode = 503; res.end('{"error":"no api key"}'); return; }
            const polyUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/5/minute/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;
            https.get(polyUrl, (upstream) => {
                let d = '';
                upstream.on('data', c => d += c);
                upstream.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }); res.end(d); });
            }).on('error', () => { res.statusCode = 502; res.end('{"error":"upstream error"}'); });
            return;
        }

        // I2: Client error reporting — collect browser errors for monitoring
        if (path === '/api/client-error' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'client-error', 30)) { res.statusCode = 429; res.end('{}'); return; }
            const errLog = { ts: new Date().toISOString(), ip: clientIp, ua: (req.headers['user-agent'] || '').substring(0, 200), msg: String(body.message || '').substring(0, 500), src: String(body.source || '').substring(0, 200), line: body.line, col: body.col };
            try { fs.appendFileSync('logs/client-errors.log', JSON.stringify(errLog) + '\n'); } catch(e) {}
            res.end('{"ok":true}');
            return;
        }

        // I3: Performance metrics from clients
        if (path === '/api/metrics' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'metrics', 10)) { res.statusCode = 429; res.end('{}'); return; }
            const m = { ts: new Date().toISOString(), lang: String(body.lang || '').substring(0, 5), conn: String(body.connection || '').substring(0, 20), loadTime: Number(body.loadTime) || 0, fcp: Number(body.fcp) || 0, dataSaver: !!body.dataSaver };
            try { fs.appendFileSync('logs/perf-metrics.log', JSON.stringify(m) + '\n'); } catch(e) {}
            res.end('{"ok":true}');
            return;
        }

        // ── E1: OTP endpoints ──
        if (path === '/api/otp/send' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'otp-send', 3)) { res.statusCode = 429; res.end('{"error":"Too many OTP requests. Wait 1 minute."}'); return; }
            const phone = String(body.phone || '').replace(/[^0-9+]/g, '');
            if (!phone || phone.length < 8 || phone.length > 16) { res.end('{"error":"Invalid phone number"}'); return; }
            const code = generateOTP();
            otpStore[phone] = { code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 };
            try {
                await sendOTP(phone, code);
                res.end(JSON.stringify({ success: true, message: 'OTP sent', expiresIn: 300 }));
            } catch (e) {
                res.end(JSON.stringify({ error: 'Failed to send OTP: ' + e.message }));
            }
            return;
        }

        if (path === '/api/otp/verify' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'otp-verify', 10)) { res.statusCode = 429; res.end('{"error":"Too many attempts."}'); return; }
            const phone = String(body.phone || '').replace(/[^0-9+]/g, '');
            const code = String(body.code || '');
            const entry = otpStore[phone];
            if (!entry) { res.end('{"error":"No OTP sent for this number"}'); return; }
            if (Date.now() > entry.expires) { delete otpStore[phone]; res.end('{"error":"OTP expired"}'); return; }
            entry.attempts++;
            if (entry.attempts > 5) { delete otpStore[phone]; res.end('{"error":"Too many attempts. Request a new OTP."}'); return; }
            if (entry.code !== code) { res.end('{"error":"Incorrect OTP"}'); return; }
            // OTP verified — create or login user by phone
            delete otpStore[phone];
            const phoneUser = 'u' + phone.replace(/\+/g, '');
            if (!users[phoneUser]) {
                const result = createUser(phoneUser, crypto.randomBytes(16).toString('hex'), phone);
                if (result.error) { res.end(JSON.stringify(result)); return; }
                users[phoneUser].phone = phone;
                users[phoneUser].verified = true;
                saveJSON('users.json', users);
            }
            const token = generateToken();
            sessions[token] = { username: phoneUser, created: Date.now() };
            saveSessions();
            res.end(JSON.stringify({ success: true, token, username: phoneUser, phone }));
            return;
        }

        // ── 인증 ──
        if (path === '/api/register' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'register', 5)) { res.statusCode = 429; res.end('{"error":"Too many requests. Try again later."}'); return; }
            const result = createUser(body.username, body.password, body.displayName);
            res.end(JSON.stringify(result));
            return;
        }

        if (path === '/api/login' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'login', 10)) { res.statusCode = 429; res.end('{"error":"Too many attempts. Try again later."}'); return; }
            const result = loginUser(body.username, body.password);
            // 로그인 성공 시 체인 어댑터에 키페어 캐시
            if (result.token && chainAdapter && users[body.username]) {
                try { chainAdapter.onUserLogin(body.username, users[body.username].password); } catch {}
            }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(verifyEmail(user.username)));
            return;
        }

        if (path === '/api/change-password' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { oldPassword, newPassword } = body;
            if (!newPassword || newPassword.length < 6) {
                res.end(JSON.stringify({ error: 'New password must be at least 6 characters' }));
                return;
            }
            // oldPassword가 있으면 검증 (비밀번호 변경), 없으면 초기 설정
            if (oldPassword && !verifyPassword(oldPassword, user.password)) {
                res.end(JSON.stringify({ error: 'Current password is incorrect' }));
                return;
            }
            user.password = hashPasswordSecure(newPassword);
            saveJSON('users.json', users);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // ── 프로필 ──
        if (path === '/api/profile' && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
                nickname: user.displayName || user.username,
                notificationSettings: user.notificationSettings || {},
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const contacts = getContacts(user.username);
            // v2 호환: CrownyOS 필드 매핑
            if (isV2) {
                const v2contacts = contacts.map(c => ({
                    ...c,
                    pub_key: c.crownyUsername || c.id,
                    username: c.crownyUsername || c.name,
                    display_name: c.name,
                    nickname: c.name,
                    email: c.email || '',
                }));
                res.end(JSON.stringify({ contacts: v2contacts }));
            } else {
                res.end(JSON.stringify(contacts));
            }
            return;
        }

        if (path === '/api/contacts' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(addContact(user.username, body.name, body.phone, body.relation, {
                email: body.email, company: body.company, position: body.position,
                address: body.address, birthday: body.birthday, group: body.group,
                notes: body.notes, tags: body.tags, crownyUsername: body.crownyUsername,
            })));
            return;
        }

        if (path.startsWith('/api/contacts/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const contact = findCell(id);
            if (!contact || contact.owner !== user.username || contact.type !== TY.CONTACT) {
                res.end('{"error":"Contact not found"}'); return;
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const contact = findCell(id);
            if (!contact || contact.owner !== user.username || contact.type !== TY.CONTACT) {
                res.end('{"error":"Contact not found"}'); return;
            }
            contact.deleted = true;
            saveCells();
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // ── 회원 검색 ──
        if (path === '/api/users/search' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const q = (url.searchParams.get('q') || '').trim().toLowerCase();
            if (q.length < 1) { res.end('[]'); return; }
            const results = Object.values(users)
                .filter(u => u.username !== user.username && (
                    u.username.toLowerCase().includes(q) ||
                    (u.displayName || '').toLowerCase().includes(q)
                ))
                .slice(0, 20)
                .map(u => ({ username: u.username, displayName: u.displayName || u.username, email: u.email, photoURL: u.photoURL || '', statusMessage: u.statusMessage || '' }));
            res.end(JSON.stringify(results));
            return;
        }

        // ── 회원 정보 조회 (프로필 사진 등) ──
        if (path === '/api/users/info' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const username = url.searchParams.get('username') || '';
            const target = users[username];
            if (!target) { res.end(JSON.stringify({ error: 'Member not found' })); return; }
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

            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatList = chatServer ? chatServer.apiListChats(user.username) : [];
            for (const c of chatList) {
                if (c.type === 'dm' && c.displayName && users[c.displayName]) {
                    c.photoURL = users[c.displayName].photoURL || '';
                }
            }
            // v2 호환: CrownyOS 형식으로 변환
            if (isV2) {
                const v2List = chatList.map(c => ({
                    ...c,
                    name: c.displayName || c.groupName || c.id,
                    chat_type: c.type || 'dm',
                    created_at: c.created ? new Date(c.created).toISOString() : null,
                }));
                res.end(JSON.stringify({ chats: v2List }));
            } else {
                res.end(JSON.stringify(chatList));
            }
            return;
        }

        if (path === '/api/chat/create' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.to) { res.statusCode = 400; res.end('{"error":"Recipient (to) required"}'); return; }
            // 대상 사용자 존재 확인
            if (body.type !== 'group') {
                const target = typeof body.to === 'string' ? body.to : body.to[0];
                if (!users[target]) { res.statusCode = 404; res.end(JSON.stringify({ error: `User '${target}' not found` })); return; }
            } else if (Array.isArray(body.to)) {
                const missing = body.to.filter(t => !users[t]);
                if (missing.length > 0) { res.statusCode = 404; res.end(JSON.stringify({ error: `User(s) '${missing.join(', ')}' not found` })); return; }
            }
            res.end(JSON.stringify(chatServer ? chatServer.apiCreateChat(user.username, body.to, body.type, body.groupName) : { error: 'Messenger unavailable' }));
            return;
        }

        if (path === '/api/chat/search' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(chatServer ? chatServer.apiSearchMessages(user.username, url.searchParams.get('q') || '') : []));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/messages$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
            const before = url.searchParams.get('before') ? parseInt(url.searchParams.get('before')) : undefined;
            const msgs = chatServer ? chatServer.apiGetMessages(chatId, user.username, limit, before) : [];
            // v2 호환: CrownyOS 형식으로 변환
            if (isV2 && Array.isArray(msgs)) {
                const v2Msgs = msgs.map(m => ({
                    ...m,
                    content: m.text || '',
                    sender_pub_key: m.senderId || '',
                    created_at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
                    from: m.senderId || '',
                }));
                res.end(JSON.stringify({ messages: v2Msgs }));
            } else {
                res.end(JSON.stringify(msgs));
            }
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/info$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiGetChatInfo(chatId, user.username) : { error: 'Messenger unavailable' }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/read$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            if (!chatServer) { res.end('{"error":"Messenger unavailable"}'); return; }
            const chatStore = require('./chat-server/chat-store');
            const count = chatStore.markRead(chatId, user.username);
            res.end(JSON.stringify({ success: true, marked: count }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/send$/) && req.method === 'POST') {
            if (!rateLimit(clientIp, 'chat-send', 30)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.text && !body.fileUrl) { res.statusCode = 400; res.end('{"error":"Message content required"}'); return; }
            const chatId = path.split('/')[3];
            if (!chatServer) { res.end('{"error":"Messenger unavailable"}'); return; }
            const chatStore = require('./chat-server/chat-store');
            const chat = chatStore.getChat(chatId);
            if (!chat || !chat.participants.includes(user.username)) { res.statusCode = 403; res.end('{"error":"Permission denied"}'); return; }
            // replyTo 텍스트 가져오기
            let replyToText = null;
            if (body.replyTo) {
                const replyMsg = chatStore.getMessage(chatId, body.replyTo);
                if (replyMsg) replyToText = (replyMsg.text || '').slice(0, 60);
            }
            const extra = {};
            if (body.fileUrl) extra.fileUrl = body.fileUrl;
            if (body.fileName) extra.fileName = body.fileName;
            if (body.fileSize) extra.fileSize = body.fileSize;
            if (replyToText) extra.replyToText = replyToText;
            const msg = chatStore.addMessage(chatId, user.username, body.text || '', body.msgType || 'text', body.replyTo, extra);
            // CRMM 팁
            if (body.crmm && body.crmm > 0) {
                const toUser = chat.participants.find(p => p !== user.username);
                if (toUser) {
                    const tipResult = walletTransact(user.username, 'send', body.crmm, toUser, 'Message tip', 'CRM');
                    if (!tipResult.error) {
                        msg.crmmTip = body.crmm;
                        const msgPath = require('path').join(chatStore.MSG_DIR, chatId, msg.id + '.json');
                        require('fs').writeFileSync(msgPath, JSON.stringify(msg));
                    }
                }
            }
            // WebSocket으로 실시간 전달
            try {
                const { broadcastToChat, sendTo, connections } = require('./chat-server/ws-server');
                console.log('[CHAT] Broadcasting msg', msg.id, 'from', user.username, 'to chat', chatId, '| WS connections:', connections.size);
                sendTo(user.username, { type: 'chat:sent', msg });
                broadcastToChat(chatId, { type: 'chat:message', msg }, user.username);
            } catch (e) { console.error('[CHAT WS] broadcast error:', e); }
            res.end(JSON.stringify({ success: true, msg }));
            return;
        }

        // ── 메시지 번역 (간단 사전 기반) ──
        if (path === '/api/chat/translate' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const text = (body.text || '').trim();
            const targetLang = (body.targetLang || 'en').slice(0, 5);
            if (!text) { res.end('{"translated":"","sourceLang":"unknown"}'); return; }
            const result = simpleTranslate(text, targetLang);
            res.end(JSON.stringify(result));
            return;
        }

        // ── 메시지 삭제 ──
        if (path.match(/^\/api\/chat\/[^/]+\/delete-msg$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            if (!chatServer) { res.end('{"error":"Messenger unavailable"}'); return; }
            const result = chatServer.apiDeleteMessage(chatId, user.username, body.msgId);
            if (result.success) {
                try {
                    const { broadcastToChat, sendTo } = require('./chat-server/ws-server');
                    const delData = { type: 'chat:deleted', chatId, msgId: body.msgId };
                    sendTo(user.username, delData);
                    broadcastToChat(chatId, delData, user.username);
                } catch (e) { console.error('[CHAT WS] delete broadcast error:', e); }
            }
            res.end(JSON.stringify(result));
            return;
        }

        // ── 메시지 수정 ──
        if (path.match(/^\/api\/chat\/[^/]+\/edit$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            if (!chatServer) { res.end('{"error":"Messenger unavailable"}'); return; }
            const result = chatServer.apiEditMessage(chatId, user.username, body.msgId, body.text);
            if (result.success) {
                try {
                    const { broadcastToChat, sendTo } = require('./chat-server/ws-server');
                    const editData = { type: 'chat:edited', chatId, msgId: body.msgId, text: body.text };
                    sendTo(user.username, editData);
                    broadcastToChat(chatId, editData, user.username);
                } catch (e) { console.error('[CHAT WS] edit broadcast error:', e); }
            }
            res.end(JSON.stringify(result));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+\/group$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiUpdateGroup(chatId, user.username, body) : { error: 'Messenger unavailable' }));
            return;
        }

        if (path.match(/^\/api\/chat\/[^/]+$/) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const chatId = path.split('/')[3];
            res.end(JSON.stringify(chatServer ? chatServer.apiDeleteChat(chatId, user.username) : { error: 'Messenger unavailable' }));
            return;
        }

        // ── 레거시 메시지 API (호환) ──
        if (path === '/api/messages' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const withUser = url.searchParams.get('with');
            res.end(JSON.stringify(getMessages(user.username, withUser)));
            return;
        }

        if (path === '/api/messages' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(sendMessage(user.username, body.to, body.content, body.crmmAmount || 0)));
            return;
        }

        if (path === '/api/messages/read' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(markRead(body.messageId, user.username)));
            return;
        }

        // ── 바이블퀴즈 ──
        if (path === '/api/bible/quiz' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getQuiz(user.username)));
            return;
        }

        if (path === '/api/bible/quiz/all' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getAllQuiz(user.username)));
            return;
        }

        if (path === '/api/bible/answer' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(answerQuiz(user.username, body.quizId, body.selectedIndex)));
            return;
        }

        // ── 메일 ──
        if (path === '/api/mail/inbox' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const folder = url.searchParams.get('folder') || 'inbox';
            res.end(JSON.stringify(getMailbox(user.username, folder)));
            return;
        }

        if (path === '/api/mail/count' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getMailCount(user.username)));
            return;
        }

        if (path === '/api/mail/send' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.to) { res.statusCode = 400; res.end('{"error":"Recipient (to) required"}'); return; }
            const r = sendEmail(user.username, body.to, body.subject || '(No subject)', body.body || '', body.replyTo);
            res.end(JSON.stringify(r));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+$/) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const r = readMail(id, user.username);
            res.end(JSON.stringify(r));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+\/star$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            res.end(JSON.stringify(starMail(id, user.username, body.starred)));
            return;
        }

        if (path.match(/^\/api\/mail\/\d+\/move$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            res.end(JSON.stringify(moveMail(id, user.username, body.folder || 'trash')));
            return;
        }

        // ── 외부 메일 (독립 메일 서버) ──
        if (path === '/api/mail/external' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (mailServer) {
                const mailId = path.split('/')[4];
                const folder = url.searchParams.get('folder') || 'inbox';
                if (req.method === 'DELETE') {
                    const ok = mailServer.apiDeleteMail(mailId, folder);
                    res.end(JSON.stringify({ success: ok }));
                } else {
                    const mail = mailServer.apiReadMail(mailId, folder);
                    res.end(JSON.stringify(mail || { error: 'Mail not found' }));
                }
            } else {
                res.end('{"error":"Mail server unavailable"}');
            }
            return;
        }

        if (path === '/api/mail/stats' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const r = await cloudPull(user.username);
            res.end(JSON.stringify(r));
            return;
        }

        if (path === '/api/cloud/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
        // ═══ E3: Mobile Money Payment Integration ═══
        if (path === '/api/payment/initiate' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'payment', 5)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { provider, phone, amount, currency } = body;
            if (!provider || !phone || !amount) { res.end('{"error":"provider, phone, amount required"}'); return; }
            const amt = Number(amount);
            if (!Number.isFinite(amt) || amt <= 0 || amt > 100000) { res.end('{"error":"Invalid amount"}'); return; }

            const txId = 'pay_' + crypto.randomBytes(8).toString('hex');
            const payment = { txId, username: user.username, provider, phone, amount: amt, currency: currency || 'USD', status: 'pending', created: Date.now() };

            // Store pending payment
            const payments = loadJSON('payments.json', {});
            payments[txId] = payment;
            saveJSON('payments.json', payments);

            // Provider-specific initiation
            try {
                if (provider === 'mpesa' && process.env.MPESA_KEY && process.env.MPESA_SECRET) {
                    // M-Pesa STK Push (Safaricom)
                    payment.providerRef = 'mpesa_pending';
                    // Actual M-Pesa integration would go here
                } else if (provider === 'bkash' && process.env.BKASH_APP_KEY) {
                    payment.providerRef = 'bkash_pending';
                } else if (provider === 'upi' && process.env.UPI_VPA) {
                    payment.providerRef = 'upi_pending';
                } else {
                    // Dev mode: auto-approve after 5s for testing
                    payment.status = 'dev_pending';
                    console.log(`[PAYMENT] Dev mode: ${txId} ${provider} ${amt} ${currency || 'USD'} from ${phone}`);
                }
                saveJSON('payments.json', payments);
                res.end(JSON.stringify({ success: true, txId, status: payment.status }));
            } catch (e) {
                payment.status = 'failed';
                payment.error = e.message;
                saveJSON('payments.json', payments);
                res.end(JSON.stringify({ error: 'Payment initiation failed: ' + e.message }));
            }
            return;
        }

        if (path === '/api/payment/confirm' && req.method === 'POST') {
            // Webhook or manual confirmation
            const { txId, providerRef } = body;
            const payments = loadJSON('payments.json', {});
            const payment = payments[txId];
            if (!payment) { res.end('{"error":"Payment not found"}'); return; }
            if (payment.status === 'completed') { res.end('{"error":"Already completed"}'); return; }
            payment.status = 'completed';
            payment.providerRef = providerRef || payment.providerRef;
            payment.completedAt = Date.now();
            saveJSON('payments.json', payments);
            // Credit wallet
            const creditResult = walletTransact(payment.username, 'earn', payment.amount, 'payment', `${payment.provider} deposit`, payment.currency === 'KES' ? 'CRM' : 'CRN');
            res.end(JSON.stringify({ success: true, txId, wallet: creditResult }));
            return;
        }

        if (path === '/api/payment/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const txId = url.searchParams.get('txId');
            const payments = loadJSON('payments.json', {});
            const payment = payments[txId];
            if (!payment || payment.username !== user.username) { res.end('{"error":"Not found"}'); return; }
            res.end(JSON.stringify({ txId, status: payment.status, amount: payment.amount, provider: payment.provider }));
            return;
        }

        if (path === '/api/wallet' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getWallet(user.username)));
            return;
        }

        if (path === '/api/wallet/transact' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'wallet-transact', 10)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const txAmt = Number(body.amount);
            if (!Number.isFinite(txAmt) || txAmt <= 0 || txAmt > 1000000) { res.statusCode = 400; res.end('{"error":"Invalid amount (0 < amount ≤ 1,000,000)"}'); return; }
            body.amount = Math.round(txAmt * 100) / 100;
            res.end(JSON.stringify(walletTransact(user.username, body.type, body.amount, body.to, body.memo, body.currency || 'CRN')));
            return;
        }

        if (path === '/api/wallet/earn' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'wallet-earn', 20)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { token: tokenKey, amount, reason } = body;
            if (!tokenKey || !amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid request"}'); return; }
            const profile = users[user.username] || {};
            if (!profile.offchainBalances) profile.offchainBalances = {};
            profile.offchainBalances[tokenKey] = (profile.offchainBalances[tokenKey] || 0) + amount;
            users[user.username] = profile;
            saveUsers();
            res.end(JSON.stringify({ ok: true, balance: profile.offchainBalances[tokenKey] }));
            return;
        }

        if (path === '/api/wallet/spend' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'wallet-spend', 20)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { token: tokenKey, amount, reason } = body;
            if (!tokenKey || !amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid request"}'); return; }
            const profile = users[user.username] || {};
            if (!profile.offchainBalances) profile.offchainBalances = {};
            const current = profile.offchainBalances[tokenKey] || 0;
            if (current < amount) { res.statusCode = 400; res.end('{"error":"Insufficient balance"}'); return; }
            profile.offchainBalances[tokenKey] = current - amount;
            users[user.username] = profile;
            saveUsers();
            res.end(JSON.stringify({ ok: true, balance: profile.offchainBalances[tokenKey] }));
            return;
        }

        if (path === '/api/wallet/swap' && req.method === 'POST') {
            if (!rateLimit(clientIp, 'wallet-swap', 10)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const swapAmt = Number(body.amount);
            if (!Number.isFinite(swapAmt) || swapAmt <= 0 || swapAmt > 1000000) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            res.end(JSON.stringify(swapTokens(user.username, body.from, body.to, Math.round(swapAmt * 100) / 100)));
            return;
        }

        // ══════════════════════════════════════
        // ── 크레딧 시스템 API ──
        // ══════════════════════════════════════
        const CREDIT_DIR = pathModule.join(DATA_DIR, 'credit');
        if (!fs.existsSync(CREDIT_DIR)) fs.mkdirSync(CREDIT_DIR, { recursive: true });

        function loadCredit(file, def = []) {
            const p = pathModule.join(CREDIT_DIR, file);
            try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { /* first run */ }
            return def;
        }
        function saveCredit(file, data) {
            fs.writeFileSync(pathModule.join(CREDIT_DIR, file), JSON.stringify(data, null, 2));
        }

        // ── 품앗이 (Pumasi) ──
        if (path === '/api/credit/pumasi' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const list = loadCredit('pumasi.json', []).filter(p => p.status === 'active' || p.requesterId === user.username);
            res.end(JSON.stringify({ items: list }));
            return;
        }

        if (path === '/api/credit/pumasi' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { amount, reason, days, target } = body;
            const amt = Number(amount);
            if (!Number.isFinite(amt) || amt <= 0 || amt > 100000) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            if (!reason) { res.statusCode = 400; res.end('{"error":"Reason required"}'); return; }

            const list = loadCredit('pumasi.json', []);
            const item = {
                id: crypto.randomBytes(8).toString('hex'),
                requesterId: user.username,
                requesterName: users[user.username]?.displayName || user.username,
                targetId: target || '',
                amount: amt, reason,
                days: Math.min(Number(days) || 30, 365),
                interest: 0,
                raised: 0, backers: [],
                dueDate: Date.now() + (Math.min(Number(days) || 30, 365)) * 86400000,
                status: 'active',
                createdAt: Date.now()
            };
            list.push(item);
            saveCredit('pumasi.json', list);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (path === '/api/credit/pumasi/contribute' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { pumasiId, amount } = body;
            const amt = Number(amount);
            if (!pumasiId || !Number.isFinite(amt) || amt <= 0) { res.statusCode = 400; res.end('{"error":"Invalid"}'); return; }

            const profile = users[user.username];
            if (!profile || !profile.offchainBalances) { res.statusCode = 400; res.end('{"error":"No wallet"}'); return; }
            if ((profile.offchainBalances.crtd || 0) < amt) { res.statusCode = 400; res.end('{"error":"Insufficient CRTD"}'); return; }

            const list = loadCredit('pumasi.json', []);
            const item = list.find(p => p.id === pumasiId && p.status === 'active');
            if (!item) { res.statusCode = 404; res.end('{"error":"Not found"}'); return; }

            // 차감 + 기여
            profile.offchainBalances.crtd = (profile.offchainBalances.crtd || 0) - amt;
            item.raised += amt;
            item.backers.push({ userId: user.username, amount: amt, at: Date.now() });

            // 목표 달성 시 수혜자에게 지급
            if (item.raised >= item.amount) {
                const target = users[item.requesterId];
                if (target) {
                    if (!target.offchainBalances) target.offchainBalances = {};
                    target.offchainBalances.crtd = (target.offchainBalances.crtd || 0) + item.amount;
                }
                item.status = 'funded';
            }
            saveCredit('pumasi.json', list);
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true, raised: item.raised, status: item.status }));
            return;
        }

        // ── 보험 (Insurance) ──
        if (path === '/api/credit/insurance' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const list = loadCredit('insurance.json', []);
            const isAdmin = ADMIN_USERS.includes(user.username);
            const result = isAdmin ? list : list.filter(i => i.requesterId === user.username);
            res.end(JSON.stringify({ items: result, isAdmin }));
            return;
        }

        if (path === '/api/credit/insurance' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { type, amount, reason } = body;
            const amt = Number(amount);
            if (!Number.isFinite(amt) || amt <= 0 || amt > 1000000) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            if (!reason) { res.statusCode = 400; res.end('{"error":"Reason required"}'); return; }

            const list = loadCredit('insurance.json', []);
            const item = {
                id: crypto.randomBytes(8).toString('hex'),
                requesterId: user.username,
                requesterName: users[user.username]?.displayName || user.username,
                type: type || 'other', amount: amt, reason,
                status: 'pending',
                approvedBy: null, funded: 0,
                createdAt: Date.now()
            };
            list.push(item);
            saveCredit('insurance.json', list);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (path === '/api/credit/insurance/approve' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { insuranceId, approved } = body;

            const list = loadCredit('insurance.json', []);
            const item = list.find(i => i.id === insuranceId);
            if (!item) { res.statusCode = 404; res.end('{"error":"Not found"}'); return; }

            if (approved) {
                item.status = 'approved';
                item.approvedBy = user.username;
                // 수혜자에게 CRNY 지급
                const target = users[item.requesterId];
                if (target) {
                    if (!target.balances) target.balances = { crny: 0, fnc: 0, crfn: 0 };
                    target.balances.crny = (target.balances.crny || 0) + item.amount;
                }
                saveJSON('users.json', users);
            } else {
                item.status = 'rejected';
                item.approvedBy = user.username;
            }
            saveCredit('insurance.json', list);
            res.end(JSON.stringify({ ok: true, status: item.status }));
            return;
        }

        // ── 기부 (Donate) ──
        if (path === '/api/credit/donate' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { amount, targetUsername, targetType } = body;
            const amt = Number(amount);
            if (!Number.isFinite(amt) || amt <= 0 || amt > 100000) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }

            const profile = users[user.username];
            if (!profile || !profile.offchainBalances || (profile.offchainBalances.crtd || 0) < amt) {
                res.statusCode = 400; res.end('{"error":"Insufficient CRTD"}'); return;
            }

            // 차감
            profile.offchainBalances.crtd -= amt;

            // 지정 대상이면 지급
            if (targetType === 'designated' && targetUsername && users[targetUsername]) {
                const target = users[targetUsername];
                if (!target.offchainBalances) target.offchainBalances = {};
                target.offchainBalances.crtd = (target.offchainBalances.crtd || 0) + amt;
            }

            // 기부 기록 저장
            const donations = loadCredit('donations.json', []);
            donations.push({
                id: crypto.randomBytes(8).toString('hex'),
                donorId: user.username, amount: amt, token: 'CRTD',
                targetType: targetType || 'open',
                targetId: targetUsername || '',
                createdAt: Date.now()
            });
            saveCredit('donations.json', donations);
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (path === '/api/credit/donations' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const donations = loadCredit('donations.json', []).filter(d => d.donorId === user.username);
            res.end(JSON.stringify({ items: donations }));
            return;
        }

        // ── 계모임 (Gye) ──
        if (path === '/api/credit/gye' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const list = loadCredit('gye.json', []).filter(g => g.status === 'recruiting' || g.status === 'active' || g.members.some(m => m.userId === user.username));
            res.end(JSON.stringify({ items: list }));
            return;
        }

        if (path === '/api/credit/gye' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { name, monthlyAmount, maxMembers } = body;
            const amt = Number(monthlyAmount);
            if (!name || !Number.isFinite(amt) || amt <= 0) { res.statusCode = 400; res.end('{"error":"Name and amount required"}'); return; }

            const list = loadCredit('gye.json', []);
            const item = {
                id: crypto.randomBytes(8).toString('hex'),
                name, monthlyAmount: amt,
                maxMembers: Math.min(Number(maxMembers) || 10, 50),
                currentRound: 0,
                members: [{ userId: user.username, name: users[user.username]?.displayName || user.username }],
                organizerId: user.username,
                token: 'CRTD', status: 'recruiting',
                createdAt: Date.now()
            };
            list.push(item);
            saveCredit('gye.json', list);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (path === '/api/credit/gye/join' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { gyeId } = body;
            const list = loadCredit('gye.json', []);
            const gye = list.find(g => g.id === gyeId);
            if (!gye) { res.statusCode = 404; res.end('{"error":"Not found"}'); return; }
            if (gye.members.some(m => m.userId === user.username)) { res.statusCode = 400; res.end('{"error":"Already joined"}'); return; }
            if (gye.members.length >= gye.maxMembers) { res.statusCode = 400; res.end('{"error":"Full"}'); return; }

            gye.members.push({ userId: user.username, name: users[user.username]?.displayName || user.username });
            if (gye.members.length >= gye.maxMembers) gye.status = 'active';
            saveCredit('gye.json', list);
            res.end(JSON.stringify({ ok: true, members: gye.members.length, status: gye.status }));
            return;
        }

        // ── 계모임 라운드 실행 ──
        if (path === '/api/credit/gye/round' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { gyeId } = body;
            const list = loadCredit('gye.json', []);
            const gye = list.find(g => g.id === gyeId);
            if (!gye) { res.statusCode = 404; res.end('{"error":"Not found"}'); return; }
            if (gye.organizerId !== user.username) { res.statusCode = 403; res.end('{"error":"Organizer only"}'); return; }
            if (gye.members.length < 2) { res.statusCode = 400; res.end('{"error":"Min 2 members"}'); return; }
            if (gye.currentRound >= gye.members.length) { res.statusCode = 400; res.end('{"error":"All rounds done"}'); return; }

            const recipient = gye.members[gye.currentRound];
            const totalPot = gye.monthlyAmount * gye.members.length;

            // 각 멤버 잔액 확인
            for (const member of gye.members) {
                if (member.userId === recipient.userId) continue;
                const mProfile = users[member.userId];
                if (!mProfile || (mProfile.offchainBalances?.crtd || 0) < gye.monthlyAmount) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: (member.name || member.userId) + ' insufficient balance' }));
                    return;
                }
            }

            // 차감 및 지급
            for (const member of gye.members) {
                if (member.userId === recipient.userId) continue;
                users[member.userId].offchainBalances.crtd -= gye.monthlyAmount;
            }
            if (!users[recipient.userId]) { res.statusCode = 400; res.end('{"error":"Recipient not found"}'); return; }
            if (!users[recipient.userId].offchainBalances) users[recipient.userId].offchainBalances = {};
            users[recipient.userId].offchainBalances.crtd = (users[recipient.userId].offchainBalances.crtd || 0) + totalPot;

            gye.currentRound += 1;
            if (gye.currentRound >= gye.members.length) gye.status = 'completed';
            saveCredit('gye.json', list);
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true, round: gye.currentRound, recipient: recipient.name || recipient.userId, totalPot, status: gye.status }));
            return;
        }

        // ── 크레딧 점수 ──
        if (path === '/api/credit/score' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const profile = users[user.username] || {};
            const crtd = profile.offchainBalances?.crtd || 0;
            const donations = loadCredit('donations.json', []).filter(d => d.donorId === user.username);
            const pumasi = loadCredit('pumasi.json', []);
            const activePumasi = pumasi.filter(p => p.requesterId === user.username && p.status === 'active');
            const fundedPumasi = pumasi.filter(p => p.requesterId === user.username && p.status === 'funded');
            const contributions = pumasi.reduce((sum, p) => sum + (p.backers || []).filter(b => b.userId === user.username).reduce((s, b) => s + b.amount, 0), 0);
            const totalDonated = donations.reduce((sum, d) => sum + d.amount, 0);

            // 크레딧 점수 계산
            let score = 300;
            score += Math.min(crtd * 0.1, 100);         // CRTD 보유 (최대 +100)
            score += Math.min(totalDonated * 0.5, 150);  // 기부 (최대 +150)
            score += Math.min(contributions * 0.3, 100);  // 품앗이 기여 (최대 +100)
            score += fundedPumasi.length * 20;            // 상환 완료 (건당 +20)
            score += Math.min(donations.length * 5, 50);  // 기부 횟수 (최대 +50)
            score = Math.min(Math.round(score), 850);

            res.end(JSON.stringify({
                score,
                activeLoans: activePumasi.length,
                totalDonated,
                totalContributions: contributions,
                donationCount: donations.length,
                breakdown: {
                    base: 300,
                    crtdHolding: Math.min(Math.round(crtd * 0.1), 100),
                    donationScore: Math.min(Math.round(totalDonated * 0.5), 150),
                    contributionScore: Math.min(Math.round(contributions * 0.3), 100),
                    repaymentScore: Math.min(fundedPumasi.length * 20, 100),
                    frequencyScore: Math.min(donations.length * 5, 50)
                }
            }));
            return;
        }

        // ── 트레이딩 게임 ──
        if (path === '/api/trading/participation' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const data = getTradingData(user.username);
            if (!data) { res.end('{"participation":null}'); return; }
            res.end(JSON.stringify({ participation: data }));
            return;
        }

        if (path === '/api/trading/join' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const existing = getTradingData(user.username);
            if (existing && existing.status === 'active') {
                res.statusCode = 400;
                res.end('{"error":"Already participating"}');
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const existing = getTradingData(user.username);
            if (!existing) { res.statusCode = 404; res.end('{"error":"Participation data not found"}'); return; }
            const allowed = ['currentBalance', 'trades', 'dailyPnL', 'dailyLocked', 'status', 'tradingTier', 'dailyLossLimit', 'crtdWithdrawn', 'lastDailyReset', 'maxDrawdown', 'defaultSL', 'defaultTP', 'adminSuspended', 'liquidatedAt', 'finalPnL'];
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const existing = getTradingData(user.username);
            if (!existing) { res.statusCode = 404; res.end('{"error":"Participation data not found"}'); return; }
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            const withdrawn = existing.crtdWithdrawn || 0;
            const available = existing.crtdDeposit - withdrawn;
            if (amount > available) { res.statusCode = 400; res.end('{"error":"Exceeds available withdrawal amount"}'); return; }
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
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { challengeId, tierKey } = body;
            const challenges = getChallenges();
            const ch = challenges.find(c => c.id === challengeId && c.status === 'active');
            if (!ch) { res.statusCode = 404; res.end('{"error":"Challenge not found"}'); return; }

            // 중복 참가 체크
            const existing = getTradingData(user.username);
            if (existing && existing.status === 'active') {
                res.statusCode = 400; res.end('{"error":"Already participating"}'); return;
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
                    const limit = Math.min(parseInt(qUrl.searchParams.get('limit')) || 100, 1000);

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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }

            // 허용 확장자 화이트리스트
            const ALLOWED_EXT = new Set(['.jpg','.jpeg','.png','.webp','.gif','.svg','.mp4','.mp3','.pdf','.txt','.csv','.json']);
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

            // 파일명 sanitize: basename만 취하고 특수문자 제거
            let rawName = body.fileName || (Date.now() + '_' + Math.random().toString(36).slice(2, 6));
            rawName = pathModule.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
            const ext = pathModule.extname(rawName).toLowerCase();
            if (ext && !ALLOWED_EXT.has(ext)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'File type not allowed: ' + ext }));
                return;
            }
            const fileName = rawName || (Date.now() + '.bin');

            const uploadDir = pathModule.join(DATA_DIR, 'uploads', user.username);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filePath = pathModule.join(uploadDir, fileName);

            // 경로 탐색 방지
            if (!pathModule.resolve(filePath).startsWith(pathModule.resolve(uploadDir))) {
                res.statusCode = 400;
                res.end('{"error":"invalid path"}');
                return;
            }

            if (body.base64) {
                const buffer = Buffer.from(body.base64, 'base64');
                if (buffer.length > MAX_FILE_SIZE) {
                    res.statusCode = 413;
                    res.end(JSON.stringify({ error: 'File too large (max 10MB)' }));
                    return;
                }
                fs.writeFileSync(filePath, buffer);
            } else if (body.text) {
                if (Buffer.byteLength(body.text) > MAX_FILE_SIZE) {
                    res.statusCode = 413;
                    res.end(JSON.stringify({ error: 'File too large (max 10MB)' }));
                    return;
                }
                fs.writeFileSync(filePath, body.text);
            }
            const uploadUrl = `/uploads/${user.username}/${fileName}`;
            res.end(JSON.stringify({ ok: true, url: uploadUrl, downloadURL: uploadUrl }));
            return;
        }

        // ── AI 프록시 (Gemini) ── API 키를 서버에서만 관리
        if (path === '/api/ai/gemini' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) { res.statusCode = 500; res.end('{"error":"GEMINI_API_KEY not configured"}'); return; }
            const model = body.model || 'gemini-2.0-flash';
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const postData = JSON.stringify({ contents: body.contents, generationConfig: body.generationConfig });
            const opts = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
                timeout: 30000,
            };
            const proxyReq = https.request(opts, (proxyRes) => {
                let data = '';
                proxyRes.on('data', d => data += d);
                proxyRes.on('end', () => { res.statusCode = proxyRes.statusCode; res.end(data); });
            });
            proxyReq.on('error', e => { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); });
            proxyReq.on('timeout', () => { proxyReq.destroy(); res.statusCode = 504; res.end('{"error":"timeout"}'); });
            proxyReq.write(postData);
            proxyReq.end();
            return;
        }

        // ── GIPHY 프록시 ── API 키를 서버에서만 관리
        if (path === '/api/ai/giphy' && req.method === 'GET') {
            const giphyKey = process.env.GIPHY_API_KEY;
            if (!giphyKey) { res.statusCode = 500; res.end('{"error":"GIPHY_API_KEY not configured"}'); return; }
            const q = url.searchParams.get('q') || '';
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
            const giphyPath = q
                ? `/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g`
                : `/v1/gifs/trending?api_key=${giphyKey}&limit=${limit}&rating=g`;
            const opts = { hostname: 'api.giphy.com', path: giphyPath, method: 'GET', timeout: 8000 };
            const proxyReq = https.request(opts, (proxyRes) => {
                let data = '';
                proxyRes.on('data', d => data += d);
                proxyRes.on('end', () => { res.statusCode = proxyRes.statusCode; res.end(data); });
            });
            proxyReq.on('error', e => { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); });
            proxyReq.on('timeout', () => { proxyReq.destroy(); res.statusCode = 504; res.end('{"error":"timeout"}'); });
            proxyReq.end();
            return;
        }

        // ── NQ 가격 (캐시에서 즉시 응답, 0.5초 간격 클라이언트 지원) ──
        if (path === '/api/market/nq' && req.method === 'GET') {
            if (_nqCache.price) {
                res.end(JSON.stringify(_nqCache));
            } else {
                res.end(JSON.stringify({ price: null, error: 'not yet fetched', source: 'none' }));
            }
            return;
        }

        // ── NQ 캔들/틱 프록시 (Railway + Yahoo Finance 보완) ──
        if (path === '/api/market/candles' && req.method === 'GET') {
            try {
                const qs = req.url.includes('?') ? req.url.split('?')[1] : '';
                let candles = [];

                // 1. Try Railway first
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    const r = await fetch(`https://web-production-26db6.up.railway.app/api/market/candles?${qs}`, { signal: controller.signal });
                    clearTimeout(timeout);
                    const d = await r.json();
                    if (d && d.candles && d.candles.length > 0) {
                        candles = d.candles;
                    }
                } catch(e) { /* fallback to next source */ }

                // 2. Check if Railway data is stale or insufficient
                const now = Math.floor(Date.now() / 1000);
                const lastCandleTime = candles.length > 0 ? candles[candles.length - 1].time : 0;
                const isStale = (now - lastCandleTime) > 600; // >10 min old

                if (isStale || candles.length < 30) {
                    // Fetch Yahoo Finance 1m chart data
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 5000);
                        const yr = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=5d', {
                            signal: controller.signal,
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        });
                        clearTimeout(timeout);
                        const yd = await yr.json();
                        const result = yd?.chart?.result?.[0];
                        if (result && result.timestamp && result.indicators?.quote?.[0]) {
                            const ts = result.timestamp;
                            const q = result.indicators.quote[0];
                            const yahooCandles = [];
                            for (let i = 0; i < ts.length; i++) {
                                if (q.open[i] != null && q.close[i] != null && q.high[i] != null && q.low[i] != null) {
                                    yahooCandles.push({
                                        time: ts[i],
                                        open: q.open[i],
                                        high: q.high[i],
                                        low: q.low[i],
                                        close: q.close[i],
                                        volume: q.volume[i] || 1,
                                        tick_count: 1
                                    });
                                }
                            }
                            if (yahooCandles.length > 0) {
                                // Merge: prefer Yahoo candles (more complete), then add any Railway candles not covered
                                const yahooTimeSet = new Set(yahooCandles.map(c => c.time));
                                const extraRailway = candles.filter(c => !yahooTimeSet.has(c.time) && c.time > yahooCandles[0].time);
                                candles = [...yahooCandles, ...extraRailway].sort((a, b) => a.time - b.time);
                            }
                        }
                    } catch(e) { /* fallback to next source */ }
                }

                // 3. Add current price candle if latest candle is old
                if (candles.length > 0 && _nqCache.price) {
                    const lastTime = candles[candles.length - 1].time;
                    const nowMin = now - (now % 60);
                    if (nowMin > lastTime) {
                        candles.push({
                            time: nowMin,
                            open: _nqCache.price,
                            high: _nqCache.price,
                            low: _nqCache.price,
                            close: _nqCache.price,
                            volume: 1,
                            tick_count: 1
                        });
                    }
                } else if (candles.length === 0 && _nqCache.price) {
                    const nowMin = now - (now % 60);
                    candles.push({
                        time: nowMin,
                        open: _nqCache.price,
                        high: _nqCache.price,
                        low: _nqCache.price,
                        close: _nqCache.price,
                        volume: 1,
                        tick_count: 1
                    });
                }

                // Limit to most recent 1440 candles (24 hours of 1m data)
                if (candles.length > 1440) candles = candles.slice(-1440);
                res.end(JSON.stringify({ candles, count: candles.length, interval: '1m', symbol: 'NQ' }));
            } catch(e) {
                if (_nqCache.price) {
                    const now = Math.floor(Date.now() / 1000);
                    res.end(JSON.stringify({ candles: [{ time: now, open: _nqCache.price, high: _nqCache.price, low: _nqCache.price, close: _nqCache.price, volume: 1 }], count: 1, symbol: 'NQ' }));
                } else {
                    res.end(JSON.stringify({ candles: [], count: 0, error: e.message }));
                }
            }
            return;
        }

        if (path === '/api/market/ticks' && req.method === 'GET') {
            try {
                const qs = req.url.includes('?') ? req.url.split('?')[1] : '';
                const r = await fetch(`https://web-production-26db6.up.railway.app/api/market/ticks?${qs}`);
                const d = await r.json();
                res.end(JSON.stringify(d));
            } catch(e) {
                res.end(JSON.stringify({ ticks: [], count: 0 }));
            }
            return;
        }

        // ── 대시보드 ──
        if (path === '/api/dashboard') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(cells.filter(c => c.owner === user.username)));
            return;
        }

        if (path === '/api/recommend') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const projects = cells.filter(c => c.owner === user.username && c.type === TY.PM_PROJECT && c.status !== TASK_STATUS.DROPPED);
            res.end(JSON.stringify(projects.sort((a, b) => b.modified - a.modified)));
            return;
        }

        if (path === '/api/projects' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const p = createProject(user.username, body.name, body.notes, body.color);
            res.end(JSON.stringify({ success: true, project: p }));
            return;
        }

        if (path.startsWith('/api/projects/') && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const gantt = getGanttData(user.username, id);
            res.end(JSON.stringify(gantt || { error: 'Project not found' }));
            return;
        }

        if (path === '/api/tasks' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const t = completeTask(id);
            res.end(JSON.stringify(t ? { success: true, task: t } : { error: 'Task not found' }));
            return;
        }

        if (path.startsWith('/api/tasks/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const t = findCell(id);
            if (!t || t.owner !== user.username) { res.end('{"error":"Task not found"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const m = createMilestone(user.username, body.projectId, body.name, body.dueDate);
            res.end(JSON.stringify({ success: true, milestone: m }));
            return;
        }

        // ── 인박스 ──
        if (path === '/api/inbox' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getInbox(user.username)));
            return;
        }

        if (path === '/api/inbox' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const item = addToInbox(user.username, body.text);
            res.end(JSON.stringify({ success: true, item }));
            return;
        }

        if (path === '/api/inbox/process' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const item = findCell(body.id);
            if (!item || item.owner !== user.username) { res.end('{"error":"Item not found"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(cells.filter(c => c.owner === user.username && c.type === TY.PM_CONTEXT)));
            return;
        }

        if (path === '/api/contexts' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const ctx = createContext(user.username, body.name, body.icon);
            res.end(JSON.stringify({ success: true, context: ctx }));
            return;
        }

        // ── 아웃라인 ──
        if (path === '/api/outline' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const parentId = url.searchParams.get('parent') ? parseInt(url.searchParams.get('parent')) : null;
            res.end(JSON.stringify(getOutlineTree(user.username, parentId)));
            return;
        }

        if (path === '/api/outline' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const node = createOutlineNode(user.username, body.parentId, body.name, body.notes, body.level);
            res.end(JSON.stringify({ success: true, node }));
            return;
        }

        if (path.startsWith('/api/outline/') && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = parseInt(path.split('/')[3]);
            const node = findCell(id);
            if (!node || node.owner !== user.username) { res.end('{"error":"Node not found"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getReviewItems(user.username)));
            return;
        }

        if (path === '/api/review/done' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const days = parseInt(url.searchParams.get('days') || '14');
            res.end(JSON.stringify(getForecast(user.username, days)));
            return;
        }

        if (path === '/api/perspective' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(getPerspective(user.username, body)));
            return;
        }

        // ── 스마트 컨트랙트 API ──
        if (path === '/api/chain/contract/deploy' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.code) { res.statusCode = 400; res.end('{"error":"code required"}'); return; }
            try {
                const { ContractStore } = require('./chain/contract');
                const store = new ContractStore(pathModule.join(__dirname, 'data', 'chain'));
                const addr = chainAdapter ? chainAdapter.getUserAddress(user.username) : user.username;
                const result = store.deploy(body.code, addr, body.name);
                res.end(JSON.stringify(result));
            } catch (e) { res.end(JSON.stringify({ error: e.message })); }
            return;
        }
        if (path === '/api/chain/contract/execute' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.code && !body.contractId) { res.statusCode = 400; res.end('{"error":"code or contractId required"}'); return; }
            try {
                const { executeContract, ContractStore } = require('./chain/contract');
                let code = body.code;
                if (!code && body.contractId) {
                    const store = new ContractStore(pathModule.join(__dirname, 'data', 'chain'));
                    const c = store.get(body.contractId);
                    if (!c) { res.end('{"error":"contract not found"}'); return; }
                    code = c.code;
                    store.incrementCalls(body.contractId);
                }
                const result = executeContract(code, body.args || []);
                res.end(JSON.stringify(result));
            } catch (e) { res.end(JSON.stringify({ error: e.message })); }
            return;
        }
        if (path === '/api/chain/contract/list' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            try {
                const { ContractStore } = require('./chain/contract');
                const store = new ContractStore(pathModule.join(__dirname, 'data', 'chain'));
                res.end(JSON.stringify(store.list()));
            } catch (e) { res.end(JSON.stringify([])); }
            return;
        }

        // ── 백업/복원/싱크 (관리자 전용) ──
        if (path === '/api/backup') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(exportAllData()));
            return;
        }

        if (path === '/api/restore' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(importAllData(body)));
            return;
        }

        if (path === '/api/sync' && req.method === 'POST') {
            // 원격 서버와 양방향 싱크 (관리자 전용)
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            if (!body.remoteUrl) { res.end('{"error":"remoteUrl required"}'); return; }
            // URL 검증: https만 허용, 도메인 화이트리스트
            try {
                const syncUrl = new URL(body.remoteUrl);
                if (syncUrl.protocol !== 'https:') throw new Error('HTTPS only');
            } catch(e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid URL: ' + e.message })); return; }
            const token = req.headers.authorization?.replace('Bearer ', '') || '';
            try {
                const myData = exportAllData();
                const https = require('https');
                // 원격에 내 데이터 보내기
                const restoreResp = await fetch(body.remoteUrl + '/api/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(myData),
                    signal: AbortSignal.timeout(10000)
                });
                const remoteData = await restoreResp.json();
                // 원격 데이터 가져오기
                const backupResp = await fetch(body.remoteUrl + '/api/backup', {
                    headers: { 'Authorization': 'Bearer ' + token },
                    signal: AbortSignal.timeout(10000)
                });
                const remoteBackup = await backupResp.json();
                const result = importAllData(remoteBackup);
                res.end(JSON.stringify({ success: true, sync: result, remote: remoteData }));
            } catch(e) {
                res.end(JSON.stringify({ error: 'Sync failed: ' + e.message }));
            }
            return;
        }

        // ═══ 한선씨 VM API ═══

        // 한선씨 코드 실행
        if (path === '/api/hanseon/run' && req.method === 'POST') {
            const hsUser = getAuth(req);
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Login required' })); return; }
            const code = body.code || '';
            if (!code.trim()) { res.end(JSON.stringify({ error: 'Code is empty' })); return; }
            const result = await runHanSeon(code, 'run', body.timeout || 5000);
            res.end(JSON.stringify(result));
            return;
        }

        // 한선씨 디스어셈블
        if (path === '/api/hanseon/dis' && req.method === 'POST') {
            const hsUser = getAuth(req);
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Login required' })); return; }
            const code = body.code || '';
            if (!code.trim()) { res.end(JSON.stringify({ error: 'Code is empty' })); return; }
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
            if (!hsUser) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Login required' })); return; }
            const cellId = body.cellId;
            const code = body.code || '';
            const cell = cells.find(c => c.id === cellId);
            if (!cell) { res.end(JSON.stringify({ error: 'Cell not found' })); return; }

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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            // 로컬 잔액을 crownybus에 동기화 시도
            const wallet = getWallet(user.username);
            const r = await crownyBusAPI('POST', '/v2/transfer', {
                asset: 'CRM', from: 'local', to: user.walletAddress,
                amount: wallet.balances.CRM, memo: 'CrownyTVM sync'
            }, user.busToken);
            res.end(JSON.stringify({ localBalances: wallet.balances, busResponse: r.data, busStatus }));
            return;
        }

        // ── 클라이언트 서명 트랜잭션 ──
        if (path === '/api/wallet/signed-tx' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            // 클라이언트가 서명한 트랜잭션 수신
            if (!body.signature || !body.senderPubKey || !body.senderAddress) {
                res.end('{"error":"missing signature or public key"}'); return;
            }
            // 서명 검증은 향후 Ed25519 verify로 — 현재는 pubKey+address 일치 확인
            console.log('[SIGNED-TX] from:', body.senderAddress?.slice(0, 20), 'type:', body.type, 'amount:', body.amount);
            // 체인 트랜잭션으로 처리
            if (body.type === 'transfer' && body.to && body.amount) {
                const result = walletTransact(user.username, 'send', body.amount, body.to, body.memo || 'signed', body.currency || 'CRM');
                result.clientSigned = true;
                result.senderAddress = body.senderAddress;
                res.end(JSON.stringify(result));
            } else {
                res.end(JSON.stringify({ success: true, clientSigned: true, received: true }));
            }
            return;
        }

        // ── 클라이언트 지갑 등록 ──
        if (path === '/api/wallet/register-key' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.publicKey || !body.address) { res.end('{"error":"missing key or address"}'); return; }
            // 사용자에게 클라이언트 공개키 연결
            if (users[user.username]) {
                users[user.username].clientPubKey = body.publicKey;
                users[user.username].clientAddress = body.address;
                saveJSON('users.json', users);
                console.log('[WALLET] Client key registered for', user.username, ':', body.address?.slice(0, 20));
            }
            res.end(JSON.stringify({ success: true, address: body.address }));
            return;
        }

        // ── CrownyCell Core API (27-슬롯 셀 CRUD) ──
        if (path === '/api/cell/create' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('{"error":"cell core not initialized"}'); return; }
            const cell = cellCore.create(body.type || 1, body.subject || user.username, body.object, body);
            res.end(JSON.stringify(cellCore.toJSON(cell)));
            return;
        }
        if (path === '/api/cell/query' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('[]'); return; }
            const filters = {
                type: url.searchParams.get('type') ? parseInt(url.searchParams.get('type')) : undefined,
                owner: url.searchParams.get('owner') || undefined,
                subject: url.searchParams.get('subject') || undefined,
                category: url.searchParams.get('category') || undefined,
                limit: parseInt(url.searchParams.get('limit') || '50'),
                offset: parseInt(url.searchParams.get('offset') || '0'),
            };
            // undefined 키 제거
            Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);
            const cells = cellCore.query(filters).map(c => cellCore.toJSON(c));
            res.end(JSON.stringify(cells));
            return;
        }
        if (path === '/api/cell/get' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('{"error":"not found"}'); return; }
            const id = parseInt(url.searchParams.get('id') || '0');
            const cell = cellCore.get(id);
            res.end(JSON.stringify(cell ? cellCore.toJSON(cell) : { error: 'not found' }));
            return;
        }
        if (path === '/api/cell/update' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore || !body.id) { res.end('{"error":"invalid"}'); return; }
            const cell = cellCore.update(body.id, body.updates || {});
            res.end(JSON.stringify(cell ? cellCore.toJSON(cell) : { error: 'not found' }));
            return;
        }
        if (path === '/api/cell/delete' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('{"error":"invalid"}'); return; }
            const ok = cellCore.delete(body.id);
            res.end(JSON.stringify({ success: ok }));
            return;
        }
        if (path === '/api/cell/link' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('{"error":"invalid"}'); return; }
            const ok = cellCore.link(body.from, body.to, body.direction || 'synapse');
            res.end(JSON.stringify({ success: ok }));
            return;
        }
        if (path === '/api/cell/graph' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!cellCore) { res.end('{}'); return; }
            const id = parseInt(url.searchParams.get('id') || '0');
            const depth = parseInt(url.searchParams.get('depth') || '1');
            res.end(JSON.stringify(cellCore.graph(id, depth)));
            return;
        }
        if (path === '/api/cell/stats' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(cellCore ? cellCore.stats() : { totalCells: 0 }));
            return;
        }

        // ── CrownyCell Chain API ──
        if (path === '/api/chain/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            res.end(JSON.stringify(chainAdapter ? chainAdapter.getChainStatus() : { error: 'chain not initialized' }));
            return;
        }
        if (path === '/api/chain/block' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const height = parseInt(url.searchParams.get('height') || '-1');
            if (height < 0 && chainAdapter) {
                res.end(JSON.stringify(chainAdapter.getChain()?.chain.getLatestBlock() || {}));
            } else if (chainAdapter) {
                res.end(JSON.stringify(chainAdapter.getChainBlock(height) || { error: 'block not found' }));
            } else {
                res.end('{"error":"chain not initialized"}');
            }
            return;
        }
        if (path === '/api/chain/account' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const addr = url.searchParams.get('address') || (chainAdapter ? chainAdapter.getUserAddress(user.username) : '');
            if (chainAdapter) {
                res.end(JSON.stringify(chainAdapter.getChain()?.chain.getAccount(addr) || {}));
            } else {
                res.end('{"error":"chain not initialized"}');
            }
            return;
        }

        // ── 관리자 API ──
        // E5: Monitoring dashboard API
        if (path === '/api/admin/monitoring' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"Admin access required"}'); return; }
            const result = { errors: [], metrics: [], summary: {} };
            try {
                const errFile = pathModule.join(__dirname, 'logs', 'client-errors.log');
                if (fs.existsSync(errFile)) {
                    const lines = fs.readFileSync(errFile, 'utf8').trim().split('\n').filter(Boolean);
                    result.errors = lines.slice(-100).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
                    // Error summary: count by message
                    const errCounts = {};
                    lines.forEach(l => { try { const e = JSON.parse(l); const k = (e.msg || '').substring(0, 80); errCounts[k] = (errCounts[k] || 0) + 1; } catch {} });
                    result.summary.errorCounts = Object.entries(errCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
                    result.summary.totalErrors = lines.length;
                }
            } catch (e) { result.errors = []; }
            try {
                const metFile = pathModule.join(__dirname, 'logs', 'perf-metrics.log');
                if (fs.existsSync(metFile)) {
                    const lines = fs.readFileSync(metFile, 'utf8').trim().split('\n').filter(Boolean);
                    result.metrics = lines.slice(-200).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
                    // Metrics summary
                    const loadTimes = result.metrics.map(m => m.loadTime).filter(t => t > 0);
                    const fcpTimes = result.metrics.map(m => m.fcp).filter(t => t > 0);
                    const connTypes = {};
                    result.metrics.forEach(m => { connTypes[m.conn || 'unknown'] = (connTypes[m.conn || 'unknown'] || 0) + 1; });
                    result.summary.totalPageLoads = lines.length;
                    result.summary.avgLoadTime = loadTimes.length ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length) : 0;
                    result.summary.avgFCP = fcpTimes.length ? Math.round(fcpTimes.reduce((a, b) => a + b, 0) / fcpTimes.length) : 0;
                    result.summary.p95LoadTime = loadTimes.length ? loadTimes.sort((a, b) => a - b)[Math.floor(loadTimes.length * 0.95)] : 0;
                    result.summary.connectionTypes = connTypes;
                    result.summary.dataSaverUsers = result.metrics.filter(m => m.dataSaver).length;
                }
            } catch (e) { result.metrics = []; }
            result.summary.serverUptime = process.uptime();
            result.summary.serverMemory = Math.round(process.memoryUsage().rss / 1024 / 1024);
            result.summary.activeConnections = _activeConnections || 0;
            result.summary.totalUsers = Object.keys(users).length;
            res.end(JSON.stringify(result));
            return;
        }

        if (path === '/api/admin/status' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
            }
            res.end(JSON.stringify(getServerStatus()));
            return;
        }

        if (path === '/api/admin/users' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
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
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
            }
            await syncBusStatus();
            res.end(JSON.stringify(busStatus));
            return;
        }

        // 동기화 큐 상태
        if (path === '/api/admin/sync-queue' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
            }
            const failed = loadJSON('bus_sync_failed.json', []);
            res.end(JSON.stringify({ pending: syncQueue, failed: failed.slice(-20), pendingCount: syncQueue.length, failedCount: failed.length }));
            return;
        }

        // 수동 큐 처리 트리거
        if (path === '/api/admin/sync-flush' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
            }
            await processSyncQueue();
            res.end(JSON.stringify({ success: true, remaining: syncQueue.length }));
            return;
        }

        // 수동 계정 연동
        if (path === '/api/admin/bus-link' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"Admin access required"}'); return;
            }
            const targetUser = body.username;
            if (!users[targetUser]) { res.end('{"error":"User not found"}'); return; }
            const r = await busLogin(targetUser, body.password || '', users[targetUser].email);
            res.end(JSON.stringify(r));
            return;
        }

        // ═══ 관리자 확장 API (admin.js migration) ═══

        // GET /api/admin/dashboard-stats
        if (path === '/api/admin/dashboard-stats' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const forceRefresh = url.searchParams.get('force') === '1';
            const cacheFile = 'admin_dashboard_cache.json';
            const CACHE_TTL = 5 * 60 * 1000;
            if (!forceRefresh) {
                const cached = loadJSON(cacheFile, null);
                if (cached && cached.cachedAt && Date.now() - cached.cachedAt < CACHE_TTL) { res.end(JSON.stringify(cached)); return; }
            }
            const stats = {};
            const todayStart = new Date(); todayStart.setHours(0,0,0,0);
            const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const allU = Object.values(users); stats.totalUsers = allU.length;
            let todayU = 0, weekU = 0;
            const signups7d = {};
            for (let i = 6; i >= 0; i--) { const d = new Date(todayStart); d.setDate(d.getDate() - i); signups7d[d.toISOString().slice(0,10)] = 0; }
            allU.forEach(u => { const c = u.created ? new Date(u.created) : null; if (c) { if (c >= todayStart) todayU++; if (c >= weekStart) weekU++; const k = c.toISOString().slice(0,10); if (k in signups7d) signups7d[k]++; } });
            stats.todayUsers = todayU; stats.weekUsers = weekU; stats.signups7d = signups7d;
            const offTxArr = Object.values(getCollection('offchain_transactions'));
            stats.totalTx = offTxArr.length; let todayTx = 0; const txByToken = {};
            offTxArr.forEach(tx => { const ts = tx.timestamp ? new Date(tx.timestamp) : null; if (ts && ts >= todayStart) todayTx++; const tk = (tx.token || 'unknown').toUpperCase(); txByToken[tk] = (txByToken[tk] || 0) + Math.abs(tx.amount || 0); });
            stats.todayTx = todayTx; stats.txByToken = txByToken;
            const sections = {};
            const productsArr = Object.values(getCollection('products')); const ordersArr = Object.values(getCollection('orders'));
            let mallRev = 0; ordersArr.forEach(o => { mallRev += o.totalPrice || o.price || 0; });
            sections.mall = { icon: 'shopping-cart', label: 'MALL', items: [{ label: 'Total Products', value: productsArr.length }, { label: 'Total Orders', value: ordersArr.length }, { label: 'Total Revenue', value: mallRev.toLocaleString() + ' pt' }] };
            const artArr = Object.values(getCollection('artworks')); let artS = 0; artArr.forEach(a => { artS += a.sold || 0; });
            sections.art = { icon: 'theater', label: 'ART', items: [{ label: 'Total Artworks', value: artArr.length }, { label: 'Total Sold', value: artS }] };
            const bookArr = Object.values(getCollection('books')); let bookS = 0; bookArr.forEach(b => { bookS += b.sold || 0; });
            sections.books = { icon: 'book', label: 'BOOKS', items: [{ label: 'Total Books', value: bookArr.length }, { label: 'Total Sold', value: bookS }] };
            const chList = getChallenges(); const actCh = chList.filter(c => c.status === 'active');
            let totP = 0; actCh.forEach(c => { totP += c.participants || 0; });
            sections.trading = { icon: 'bar-chart-3', label: 'TRADING', items: [{ label: 'Active Challenges', value: actCh.length }, { label: 'Participants', value: totP }] };
            let pCnt = 0; try { pCnt = JSON.parse(fs.readFileSync(pathModule.join(SOCIAL_DIR, 'posts.json'), 'utf8')).length; } catch(e) {}
            sections.social = { icon: 'message-circle', label: 'SOCIAL', items: [{ label: 'Total Posts', value: pCnt }] };
            stats.sections = sections; stats.cachedAt = Date.now(); saveJSON(cacheFile, stats);
            res.end(JSON.stringify(stats)); return;
        }

        // POST /api/admin/mint-offchain
        if (path === '/api/admin/mint-offchain' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { email, tokenKey, amount, reason } = body;
            if (!email || !tokenKey || !amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"email, tokenKey, amount required"}'); return; }
            const tu = Object.values(users).find(u => u.email === email);
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            if (!tu.offchainBalances) tu.offchainBalances = {};
            tu.offchainBalances[tokenKey] = (tu.offchainBalances[tokenKey] || 0) + amount;
            saveJSON('users.json', users);
            const otx = getCollection('offchain_transactions');
            otx[generateDocId()] = { from: 'ADMIN', fromEmail: user.email, to: tu.username, toEmail: email, token: tokenKey, amount, type: 'admin_mint', reason: reason || 'Admin mint', adminLevel: 6, timestamp: Date.now() };
            saveCollection('offchain_transactions', otx);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'offchain_mint', adminEmail: user.email, adminLevel: 6, targetEmail: email, token: tokenKey.toUpperCase(), amount, reason: reason || '', timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true, newBalance: tu.offchainBalances[tokenKey] })); return;
        }

        // POST /api/admin/burn-offchain
        if (path === '/api/admin/burn-offchain' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { email, tokenKey, amount, reason } = body;
            if (!email || !tokenKey || !amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"email, tokenKey, amount required"}'); return; }
            const tu = Object.values(users).find(u => u.email === email);
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            if (!tu.offchainBalances) tu.offchainBalances = {};
            const cur = tu.offchainBalances[tokenKey] || 0;
            if (amount > cur) { res.statusCode = 400; res.end(JSON.stringify({ error: 'insufficient balance', current: cur })); return; }
            tu.offchainBalances[tokenKey] = cur - amount;
            saveJSON('users.json', users);
            const otx = getCollection('offchain_transactions');
            otx[generateDocId()] = { from: tu.username, fromEmail: email, to: 'ADMIN', toEmail: user.email, token: tokenKey, amount: -amount, type: 'admin_burn', reason: reason || 'Admin burn', adminLevel: 6, timestamp: Date.now() };
            saveCollection('offchain_transactions', otx);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'offchain_burn', adminEmail: user.email, adminLevel: 6, targetEmail: email, token: tokenKey.toUpperCase(), amount: -amount, reason: reason || '', timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true, newBalance: tu.offchainBalances[tokenKey] })); return;
        }

        // POST /api/admin/batch-distribute
        if (path === '/api/admin/batch-distribute' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { tokenKey, amount, reason, emails } = body;
            if (!tokenKey || !amount || amount <= 0 || !emails || !Array.isArray(emails)) { res.statusCode = 400; res.end('{"error":"tokenKey, amount, emails[] required"}'); return; }
            let suc = 0, fai = 0; const fl = [];
            const otx = getCollection('offchain_transactions');
            for (const em of emails) { const tu = Object.values(users).find(u => u.email === em); if (!tu) { fai++; fl.push(em + ' (not found)'); continue; } if (!tu.offchainBalances) tu.offchainBalances = {}; tu.offchainBalances[tokenKey] = (tu.offchainBalances[tokenKey] || 0) + amount; otx[generateDocId()] = { from: 'ADMIN', fromEmail: user.email, to: tu.username, toEmail: em, token: tokenKey, amount, type: 'admin_batch_mint', reason: reason || 'Batch', adminLevel: 6, timestamp: Date.now() }; suc++; }
            saveJSON('users.json', users); saveCollection('offchain_transactions', otx);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'batch_distribute', adminEmail: user.email, adminLevel: 6, token: tokenKey.toUpperCase(), amountPerUser: amount, totalAmount: amount * suc, successCount: suc, failCount: fai, reason: reason || '', timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true, success: suc, fail: fai, failList: fl })); return;
        }

        // GET /api/admin/all-emails
        if (path === '/api/admin/all-emails' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const emails = Object.values(users).map(u => u.email).filter(Boolean);
            res.end(JSON.stringify({ emails, count: emails.length })); return;
        }

        // GET /api/admin/offchain-lookup
        if (path === '/api/admin/offchain-lookup' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const email = url.searchParams.get('email');
            if (!email) { res.statusCode = 400; res.end('{"error":"email required"}'); return; }
            const tu = Object.values(users).find(u => u.email === email);
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            res.end(JSON.stringify({ username: tu.username, email: tu.email, nickname: tu.displayName || tu.nickname || '', offchainBalances: tu.offchainBalances || {} })); return;
        }

        // GET /api/admin/offchain-tx-log
        if (path === '/api/admin/offchain-tx-log' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const arr = Object.entries(getCollection('offchain_transactions')).map(([id, tx]) => ({ id, ...tx }));
            arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            res.end(JSON.stringify({ items: arr.slice(0, 30) })); return;
        }

        // GET /api/admin/user-list
        if (path === '/api/admin/user-list' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const allU = Object.values(users).map(u => ({ id: u.username, username: u.username, email: u.email, nickname: u.displayName || u.nickname || '', adminLevel: u.adminLevel ?? (ADMIN_USERS.includes(u.username) ? 6 : -1), adminCountry: u.adminCountry || [], adminBusiness: u.adminBusiness || [], adminService: u.adminService || [], adminStartDate: u.adminStartDate || null, adminEndDate: u.adminEndDate || null, appointedBy: u.appointedBy || null, created: u.created || null, isAdmin: ADMIN_USERS.includes(u.username) }));
            allU.sort((a, b) => (b.adminLevel || -1) - (a.adminLevel || -1));
            const acfg = loadJSON('admin_config_settings.json', { quotas: {} });
            res.end(JSON.stringify({ users: allU, quotas: acfg.quotas || {} })); return;
        }

        // POST /api/admin/set-admin-level
        if (path === '/api/admin/set-admin-level' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { targetEmail, level } = body;
            if (!targetEmail || level === undefined) { res.statusCode = 400; res.end('{"error":"targetEmail, level required"}'); return; }
            const tu = Object.values(users).find(u => u.email === targetEmail);
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            const prev = tu.adminLevel ?? -1;
            tu.adminLevel = level; tu.appointedBy = user.email; tu.appointedByLevel = 6; tu.appointedAt = Date.now();
            saveJSON('users.json', users);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'set_admin_level', adminEmail: user.email, adminLevel: 6, targetEmail, prevLevel: prev, newLevel: level, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true, prevLevel: prev, newLevel: level })); return;
        }

        // POST /api/admin/edit-admin
        if (path === '/api/admin/edit-admin' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { targetUsername, level, country, business, service, startDate, endDate } = body;
            if (!targetUsername) { res.statusCode = 400; res.end('{"error":"targetUsername required"}'); return; }
            const tu = users[targetUsername];
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            const prev = tu.adminLevel ?? -1;
            tu.adminLevel = level ?? prev; tu.adminCountry = country || []; tu.adminBusiness = business || [];
            tu.adminService = service || []; tu.adminStartDate = startDate || null; tu.adminEndDate = endDate || null;
            tu.appointedBy = user.email; tu.appointedByLevel = 6; tu.appointedAt = Date.now();
            saveJSON('users.json', users);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'admin_edit', adminEmail: user.email, adminLevel: 6, targetEmail: tu.email, prevLevel: prev, newLevel: tu.adminLevel, country: country || [], business: business || [], service: service || [], timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // POST /api/admin/save-quotas
        if (path === '/api/admin/save-quotas' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const cfg = loadJSON('admin_config_settings.json', {}); cfg.quotas = body.quotas || {};
            saveJSON('admin_config_settings.json', cfg);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET /api/admin/admin-stats
        if (path === '/api/admin/admin-stats' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const st = {};
            for (let lv = 1; lv <= 5; lv++) st[lv] = Object.values(users).filter(u => (u.adminLevel || -1) === lv).length;
            res.end(JSON.stringify(st)); return;
        }

        // GET /api/admin/log
        if (path === '/api/admin/log' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const fa = url.searchParams.get('action') || null;
            let arr = Object.entries(getCollection('admin_log')).map(([id, l]) => ({ id, ...l }));
            if (fa) arr = arr.filter(l => l.action === fa);
            arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            res.end(JSON.stringify({ items: arr.slice(0, parseInt(url.searchParams.get('limit') || '20')) })); return;
        }

        // GET /api/admin/giving-pool
        if (path === '/api/admin/giving-pool' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const pool = loadJSON('giving_pool.json', { totalAmount: 0, lastUpdated: null });
            const logsArr = Object.values(getCollection('giving_pool_logs')).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20);
            res.end(JSON.stringify({ pool, logs: logsArr })); return;
        }

        // POST /api/admin/giving-distribute
        if (path === '/api/admin/giving-distribute' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { email, amount } = body;
            if (!email || !amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"email, amount required"}'); return; }
            const pool = loadJSON('giving_pool.json', { totalAmount: 0 });
            if (amount > pool.totalAmount) { res.statusCode = 400; res.end(JSON.stringify({ error: 'insufficient pool', current: pool.totalAmount })); return; }
            const tu = Object.values(users).find(u => u.email === email);
            if (!tu) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            if (!tu.offchainBalances) tu.offchainBalances = {};
            tu.offchainBalances.crgc = (tu.offchainBalances.crgc || 0) + amount;
            pool.totalAmount -= amount; pool.lastUpdated = Date.now();
            saveJSON('users.json', users); saveJSON('giving_pool.json', pool);
            const otx = getCollection('offchain_transactions');
            otx[generateDocId()] = { from: 'GIVING_POOL', fromEmail: 'giving_pool', to: tu.username, toEmail: email, token: 'crgc', amount, type: 'giving_distribute', adminEmail: user.email, timestamp: Date.now() };
            saveCollection('offchain_transactions', otx);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'giving_distribute', adminEmail: user.email, adminLevel: 6, targetEmail: email, amount, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true, poolRemaining: pool.totalAmount })); return;
        }

        // GET/POST /api/admin/exchange-rate
        if (path === '/api/admin/exchange-rate' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(loadJSON('admin_exchange_rate.json', { rates: { crtd: 100, crac: 100, crgc: 100, creb: 100 }, rate: 100, history: [] }))); return;
        }
        if (path === '/api/admin/exchange-rate' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { rates, reason, changes } = body;
            if (!rates) { res.statusCode = 400; res.end('{"error":"rates required"}'); return; }
            const rd = loadJSON('admin_exchange_rate.json', { rates: {}, rate: 100, history: [] });
            if (changes && Array.isArray(changes)) { for (const c of changes) rd.history.push({ ...c, reason: reason || '', adminEmail: user.email, adminLevel: 6, timestamp: Date.now() }); }
            rd.rates = rates; rd.rate = rates.crtd || 100; rd.lastChangedBy = user.email; rd.lastChangedAt = Date.now();
            saveJSON('admin_exchange_rate.json', rd);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'exchange_rate_change', adminEmail: user.email, adminLevel: 6, changes: changes || [], reason: reason || '', timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET/POST /api/admin/coupons
        if (path === '/api/admin/coupons' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const arr = Object.entries(getCollection('coupons')).map(([id, c]) => ({ id, ...c }));
            arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ items: arr })); return;
        }
        if (path === '/api/admin/coupons' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { name, code, tokenKey, amount, maxUses, expiresAt, description } = body;
            if (!name || !code || !tokenKey || !amount) { res.statusCode = 400; res.end('{"error":"name, code, tokenKey, amount required"}'); return; }
            const coupons = getCollection('coupons');
            if (Object.values(coupons).find(c => c.code === code.toUpperCase())) { res.statusCode = 409; res.end('{"error":"code exists"}'); return; }
            const id = generateDocId();
            coupons[id] = { name, code: code.toUpperCase(), tokenKey, amount, maxUses: maxUses || 0, usedCount: 0, expiresAt: expiresAt || null, createdBy: user.username, createdAt: Date.now(), enabled: true, description: description || '' };
            saveCollection('coupons', coupons);
            res.end(JSON.stringify({ ok: true, id })); return;
        }

        // POST /api/admin/coupons/:id/toggle
        if (/^\/api\/admin\/coupons\/[^/]+\/toggle$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const cid = path.split('/')[4]; const cps = getCollection('coupons');
            if (!cps[cid]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            cps[cid].enabled = body.enabled !== undefined ? body.enabled : !cps[cid].enabled;
            saveCollection('coupons', cps);
            res.end(JSON.stringify({ ok: true, enabled: cps[cid].enabled })); return;
        }

        // DELETE /api/admin/coupons/:id
        if (/^\/api\/admin\/coupons\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const cid = path.split('/')[4]; const cps = getCollection('coupons');
            if (!cps[cid]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            delete cps[cid]; saveCollection('coupons', cps);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET /api/admin/coupon-log/:id
        if (/^\/api\/admin\/coupon-log\/[^/]+$/.test(path) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const cid = path.split('/')[4];
            const arr = Object.values(getCollection('coupon_logs')).filter(l => l.couponId === cid);
            arr.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
            res.end(JSON.stringify({ items: arr })); return;
        }

        // GET /api/admin/pending-products
        if (path === '/api/admin/pending-products' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const pending = Object.entries(getCollection('products')).filter(([, p]) => p.status === 'pending').map(([id, p]) => ({ id, ...p }));
            pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ items: pending.slice(0, 50) })); return;
        }

        // POST /api/admin/approve-product
        if (path === '/api/admin/approve-product' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const products = getCollection('products');
            if (!products[body.productId]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            products[body.productId].status = 'active'; products[body.productId].approvedAt = Date.now(); products[body.productId].approvedBy = user.username;
            saveCollection('products', products);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // POST /api/admin/reject-product
        if (path === '/api/admin/reject-product' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const products = getCollection('products');
            if (!products[body.productId]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            products[body.productId].status = 'rejected'; products[body.productId].rejectedAt = Date.now();
            products[body.productId].rejectedBy = user.username; products[body.productId].rejectReason = body.reason || '';
            saveCollection('products', products);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET /api/admin/reports
        if (path === '/api/admin/reports' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const pending = Object.entries(getCollection('reports')).filter(([, r]) => r.status === 'pending').map(([id, r]) => ({ id, ...r }));
            pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ items: pending.slice(0, 50) })); return;
        }

        // POST /api/admin/handle-report
        if (path === '/api/admin/handle-report' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { reportId, action } = body;
            const reports = getCollection('reports');
            if (!reports[reportId]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            reports[reportId].status = action; reports[reportId].handledBy = user.username; reports[reportId].handledAt = Date.now();
            if (action === 'confirmed' && reports[reportId].targetId) {
                const r = reports[reportId];
                if (r.targetType === 'product') { const p = getCollection('products'); if (p[r.targetId]) { p[r.targetId].status = 'removed'; p[r.targetId].removedAt = Date.now(); saveCollection('products', p); } }
                else if (r.targetType === 'review') { const rv = getCollection('product_reviews'); delete rv[r.targetId]; saveCollection('product_reviews', rv); }
            }
            saveCollection('reports', reports);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET/POST /api/admin/referral-config
        if (path === '/api/admin/referral-config' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(loadJSON('admin_referral_rewards.json', { signupRewards: { crtd: 30, crac: 20, crgc: 30, creb: 20 } }))); return;
        }
        if (path === '/api/admin/referral-config' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { signupRewards } = body;
            if (!signupRewards) { res.statusCode = 400; res.end('{"error":"signupRewards required"}'); return; }
            const cfg = loadJSON('admin_referral_rewards.json', {}); cfg.signupRewards = signupRewards; cfg.updatedAt = Date.now(); cfg.updatedBy = user.email;
            saveJSON('admin_referral_rewards.json', cfg);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'referral_reward_config_change', newConfig: signupRewards, adminEmail: user.email, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET/POST /api/admin/token-registry
        if (path === '/api/admin/token-registry' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(loadJSON('admin_tokens.json', { registry: {} }))); return;
        }
        if (path === '/api/admin/token-registry' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { action: tAct, key, tokenData } = body;
            const tokens = loadJSON('admin_tokens.json', { registry: {} });
            if (tAct === 'create' && key && tokenData) { if (tokens.registry[key]) { res.statusCode = 409; res.end('{"error":"exists"}'); return; } tokens.registry[key] = { ...tokenData, createdBy: user.email, createdAt: Date.now() }; }
            else if (tAct === 'delete' && key) { delete tokens.registry[key]; }
            else { res.statusCode = 400; res.end('{"error":"action, key required"}'); return; }
            saveJSON('admin_tokens.json', tokens);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: tAct === 'create' ? 'create_token' : 'delete_token', adminEmail: user.email, tokenKey: key, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET/POST /api/admin/reward-settings
        if (path === '/api/admin/reward-settings' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const rs = loadJSON('admin_reward_settings.json', { signupEnabled: true, signupTiers: [{maxUsers:1000,amount:100},{maxUsers:10000,amount:30},{maxUsers:100000,amount:10}], inviteEnabled: true, inviteAmount: 0.5, inviteMaxPerUser: 100 });
            const is = loadJSON('admin_invite_settings.json', {});
            const logsArr = Object.entries(getCollection('reward_logs')).map(([id, l]) => ({ id, ...l })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ rewardSettings: rs, inviteSettings: is, logs: logsArr.slice(0, 50) })); return;
        }
        if (path === '/api/admin/reward-settings' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { rewardSettings, inviteSettings } = body;
            if (rewardSettings) { rewardSettings.updatedAt = Date.now(); rewardSettings.updatedBy = user.email; saveJSON('admin_reward_settings.json', rewardSettings); }
            if (inviteSettings) { inviteSettings.updatedAt = Date.now(); inviteSettings.updatedBy = user.email; saveJSON('admin_invite_settings.json', inviteSettings); }
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'reward_settings_change', adminEmail: user.email, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET/POST /api/admin/super-wallets
        if (path === '/api/admin/super-wallets' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            res.end(JSON.stringify(loadJSON('admin_super_wallets_' + user.username + '.json', { original: null, operating: null, default: null, activeWallet: 'default' }))); return;
        }
        if (path === '/api/admin/super-wallets' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { action: wAct, type, toType, tokenKey, amount } = body;
            const fn = 'admin_super_wallets_' + user.username + '.json';
            const w = loadJSON(fn, { original: null, operating: null, default: null, activeWallet: 'default' });
            if (wAct === 'create' && type) { w[type] = { type, offchainBalances: {}, balances: {}, createdAt: Date.now(), createdBy: user.email }; }
            else if (wAct === 'switch' && type) { w.activeWallet = type; }
            else if (wAct === 'transfer' && type && toType && tokenKey && amount > 0) {
                if (!w[type]) { res.statusCode = 400; res.end('{"error":"source not found"}'); return; }
                const fb = (w[type].offchainBalances || {})[tokenKey] || 0;
                if (fb < amount) { res.statusCode = 400; res.end(JSON.stringify({ error: 'insufficient', current: fb })); return; }
                if (!w[toType]) w[toType] = { type: toType, offchainBalances: {}, balances: {}, createdAt: Date.now() };
                w[type].offchainBalances[tokenKey] = fb - amount;
                if (!w[toType].offchainBalances) w[toType].offchainBalances = {};
                w[toType].offchainBalances[tokenKey] = (w[toType].offchainBalances[tokenKey] || 0) + amount;
                const al = getCollection('admin_log');
                al[generateDocId()] = { action: 'super_internal_transfer', adminEmail: user.email, fromWallet: type, toWallet: toType, token: tokenKey, amount, timestamp: Date.now() };
                saveCollection('admin_log', al);
            } else { res.statusCode = 400; res.end('{"error":"invalid action"}'); return; }
            saveJSON(fn, w);
            res.end(JSON.stringify({ ok: true, wallets: w })); return;
        }

        // POST /api/admin/register-product
        if (path === '/api/admin/register-product' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { title, description, category, price, stock, images } = body;
            if (!title || !price) { res.statusCode = 400; res.end('{"error":"title, price required"}'); return; }
            const products = getCollection('products'); const id = generateDocId();
            products[id] = { title, description: description || '', category: category || 'other', price, priceToken: 'CRGC', stock: stock || 1, images: images || [], imageData: (images && images[0]) || '', sellerId: user.username, sellerEmail: user.email, sellerNickname: user.displayName || user.nickname || '', sold: 0, status: ADMIN_USERS.includes(user.username) ? 'active' : 'pending', createdAt: Date.now() };
            saveCollection('products', products);
            res.end(JSON.stringify({ ok: true, id })); return;
        }

        // POST /api/admin/referral-generate
        if (path === '/api/admin/referral-generate' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            if (user.referralCode) { res.end(JSON.stringify({ code: user.referralCode, nickname: user.referralNickname || '' })); return; }
            let code; let ex = true;
            while (ex) { code = 'CR-' + Math.random().toString(36).slice(2, 8).toUpperCase(); ex = Object.values(users).some(u => u.referralCode === code); }
            user.referralCode = code; user.referralNickname = (body.nickname || '').trim() || user.displayName || '';
            user.referralCount = 0; user.referralEarnings = { crny: 0, fnc: 0, crfn: 0, crtd: 0, crac: 0, crgc: 0, creb: 0 };
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true, code })); return;
        }

        // POST /api/admin/challenge-participant-update
        if (path === '/api/admin/challenge-participant-update' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const { challengeId, participantId, updates } = body;
            if (!challengeId || !participantId || !updates) { res.statusCode = 400; res.end('{"error":"challengeId, participantId, updates required"}'); return; }
            const td = getTradingData(participantId);
            if (!td) { res.statusCode = 404; res.end('{"error":"participant not found"}'); return; }
            const allowed = ['currentBalance', 'dailyLocked', 'adminSuspended', 'suspendReason', 'suspendedAt', 'suspendedBy', 'dailyPnL', 'dailyLossLimit', 'maxDrawdown', 'copyAccounts', 'tradingTier'];
            for (const [k, v] of Object.entries(updates)) { if (allowed.includes(k)) td[k] = v; }
            saveTradingData(participantId, td);
            const al = getCollection('admin_log');
            al[generateDocId()] = { action: 'challenge_participant_update', adminEmail: user.email, adminLevel: 6, participantId, challengeId, updates, timestamp: Date.now() };
            saveCollection('admin_log', al);
            res.end(JSON.stringify({ ok: true })); return;
        }

        // GET /api/admin/challenge-participants
        if (path === '/api/admin/challenge-participants' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user || !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"admin only"}'); return; }
            const chs = getChallenges().filter(c => c.status === 'active').slice(0, 5);
            const result = [];
            for (const ch of chs) {
                const parts = [];
                if (ch.participantList && Array.isArray(ch.participantList)) { for (const pU of ch.participantList) { const td = getTradingData(pU); if (td) parts.push({ id: pU, ...td }); } }
                result.push({ id: ch.id, title: ch.name || ch.title || 'Challenge', participants: parts });
            }
            res.end(JSON.stringify({ challenges: result })); return;
        }

        // ═══ 설정 / 알림 ═══

        // POST /api/profile/settings — 알림 설정 저장
        if (path === '/api/profile/settings' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            if (body.notificationSettings) user.notificationSettings = body.notificationSettings;
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/profile/deactivate — 계정 비활성화 요청
        if (path === '/api/profile/deactivate' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const deactFile = pathModule.join(DATA_DIR, 'deactivation_requests.json');
            const reqs = fs.existsSync(deactFile) ? JSON.parse(fs.readFileSync(deactFile, 'utf8')) : [];
            reqs.push({ username: user.username, email: user.email, requestedAt: Date.now() });
            fs.writeFileSync(deactFile, JSON.stringify(reqs, null, 2));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/notifications — 알림 목록
        if (path === '/api/notifications' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const all = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            const mine = all.filter(n => n.userId === user.username).slice(-50);
            res.end(JSON.stringify({ items: mine }));
            return;
        }

        // POST /api/notifications — 알림 생성
        if (path === '/api/notifications' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { userId, type, message, data } = body;
            if (!userId || !type) { res.statusCode = 400; res.end('{"error":"userId and type required"}'); return; }
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const all = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            const notif = { id: crypto.randomBytes(8).toString('hex'), userId, type, message: message || '', data: data || {}, read: false, createdAt: Date.now() };
            all.push(notif);
            // keep max 1000
            if (all.length > 1000) all.splice(0, all.length - 1000);
            fs.writeFileSync(notifFile, JSON.stringify(all, null, 2));
            res.end(JSON.stringify({ ok: true, notif }));
            return;
        }

        // POST /api/notifications/read — 알림 읽음 처리
        if (path === '/api/notifications/read' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { notifId, all: markAll } = body;
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const list = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            if (markAll) {
                list.forEach(n => { if (n.userId === user.username) n.read = true; });
            } else if (notifId) {
                const n = list.find(n => n.id === notifId && n.userId === user.username);
                if (n) n.read = true;
            }
            fs.writeFileSync(notifFile, JSON.stringify(list, null, 2));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ═══ 친구 & 팔로우 시스템 ═══

        // GET /api/friends/list — 친구 목록
        if (path === '/api/friends/list' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const friends = loadJSON('friends.json', {});
            const myFriends = friends[user.username] || [];
            const enriched = myFriends.map(f => ({
                uid: f.uid,
                nickname: users[f.uid]?.displayName || f.uid,
                photoURL: users[f.uid]?.photoURL || '',
                statusMessage: users[f.uid]?.statusMessage || '',
                addedAt: f.addedAt
            }));
            res.end(JSON.stringify(enriched));
            return;
        }

        // GET /api/friends/requests — 받은 친구 요청 목록
        if (path === '/api/friends/requests' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const requests = loadJSON('friend_requests.json', []);
            const pending = requests.filter(r => r.to === user.username && r.status === 'pending');
            const enriched = pending.map(r => ({
                id: r.id,
                from: r.from,
                nickname: users[r.from]?.displayName || r.from,
                photoURL: users[r.from]?.photoURL || '',
                timestamp: r.timestamp
            }));
            res.end(JSON.stringify(enriched));
            return;
        }

        // POST /api/friends/request — 친구 요청 보내기
        if (path === '/api/friends/request' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const targetUid = body.targetUid;
            if (!targetUid || targetUid === user.username) { res.statusCode = 400; res.end('{"error":"invalid target"}'); return; }
            if (!users[targetUid]) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }

            const friends = loadJSON('friends.json', {});
            const myFriends = friends[user.username] || [];
            if (myFriends.some(f => f.uid === targetUid)) { res.end(JSON.stringify({ ok: true, status: 'already_friends' })); return; }

            const requests = loadJSON('friend_requests.json', []);
            const existing = requests.find(r => r.from === user.username && r.to === targetUid && r.status === 'pending');
            if (existing) { res.end(JSON.stringify({ ok: true, status: 'already_sent' })); return; }

            // Check reverse request (auto-accept)
            const reverse = requests.find(r => r.from === targetUid && r.to === user.username && r.status === 'pending');
            if (reverse) {
                reverse.status = 'accepted';
                if (!friends[user.username]) friends[user.username] = [];
                if (!friends[targetUid]) friends[targetUid] = [];
                friends[user.username].push({ uid: targetUid, addedAt: Date.now() });
                friends[targetUid].push({ uid: user.username, addedAt: Date.now() });
                saveJSON('friends.json', friends);
                saveJSON('friend_requests.json', requests);
                res.end(JSON.stringify({ ok: true, status: 'auto_accepted' }));
                return;
            }

            const reqId = `fr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            requests.push({ id: reqId, from: user.username, to: targetUid, status: 'pending', timestamp: Date.now() });
            saveJSON('friend_requests.json', requests);

            // Create notification
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const notifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            notifs.push({ id: `n_${Date.now()}`, userId: targetUid, type: 'friend_request', fromUid: user.username, read: false, createdAt: Date.now() });
            fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2));

            res.end(JSON.stringify({ ok: true, status: 'sent', requestId: reqId }));
            return;
        }

        // POST /api/friends/accept — 친구 요청 수락
        if (path === '/api/friends/accept' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const requests = loadJSON('friend_requests.json', []);
            const req_ = requests.find(r => r.id === body.requestId && r.to === user.username && r.status === 'pending');
            if (!req_) { res.statusCode = 404; res.end('{"error":"request not found"}'); return; }

            req_.status = 'accepted';
            const friends = loadJSON('friends.json', {});
            if (!friends[user.username]) friends[user.username] = [];
            if (!friends[req_.from]) friends[req_.from] = [];
            if (!friends[user.username].some(f => f.uid === req_.from)) {
                friends[user.username].push({ uid: req_.from, addedAt: Date.now() });
            }
            if (!friends[req_.from].some(f => f.uid === user.username)) {
                friends[req_.from].push({ uid: user.username, addedAt: Date.now() });
            }
            saveJSON('friends.json', friends);
            saveJSON('friend_requests.json', requests);

            // Notify the requester
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const notifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            notifs.push({ id: `n_${Date.now()}`, userId: req_.from, type: 'friend_accepted', fromUid: user.username, read: false, createdAt: Date.now() });
            fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2));

            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/friends/reject — 친구 요청 거절
        if (path === '/api/friends/reject' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const requests = loadJSON('friend_requests.json', []);
            const req_ = requests.find(r => r.id === body.requestId && r.to === user.username && r.status === 'pending');
            if (!req_) { res.statusCode = 404; res.end('{"error":"request not found"}'); return; }
            req_.status = 'rejected';
            saveJSON('friend_requests.json', requests);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/friends/remove — 친구 삭제
        if (path === '/api/friends/remove' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const friendUid = body.friendUid;
            if (!friendUid) { res.statusCode = 400; res.end('{"error":"missing friendUid"}'); return; }
            const friends = loadJSON('friends.json', {});
            if (friends[user.username]) friends[user.username] = friends[user.username].filter(f => f.uid !== friendUid);
            if (friends[friendUid]) friends[friendUid] = friends[friendUid].filter(f => f.uid !== user.username);
            saveJSON('friends.json', friends);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/friends/check?uid= — 친구 여부 확인
        if (path === '/api/friends/check' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const targetUid = url.searchParams.get('uid');
            const friends = loadJSON('friends.json', {});
            const myFriends = friends[user.username] || [];
            res.end(JSON.stringify({ isFriend: myFriends.some(f => f.uid === targetUid) }));
            return;
        }

        // POST /api/follow — 팔로우/언팔로우 토글
        if (path === '/api/follow' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const targetUid = body.targetUid;
            if (!targetUid || targetUid === user.username) { res.statusCode = 400; res.end('{"error":"invalid target"}'); return; }
            const follows = loadJSON('follows.json', {});
            if (!follows.following) follows.following = {};
            if (!follows.followers) follows.followers = {};
            if (!follows.following[user.username]) follows.following[user.username] = [];
            if (!follows.followers[targetUid]) follows.followers[targetUid] = [];

            const idx = follows.following[user.username].indexOf(targetUid);
            let followed;
            if (idx >= 0) {
                follows.following[user.username].splice(idx, 1);
                follows.followers[targetUid] = follows.followers[targetUid].filter(u => u !== user.username);
                followed = false;
            } else {
                follows.following[user.username].push(targetUid);
                follows.followers[targetUid].push(user.username);
                followed = true;
                // Notification
                const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
                const notifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
                notifs.push({ id: `n_${Date.now()}`, userId: targetUid, type: 'new_follower', fromUid: user.username, read: false, createdAt: Date.now() });
                fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2));
            }
            saveJSON('follows.json', follows);
            res.end(JSON.stringify({ ok: true, followed }));
            return;
        }

        // GET /api/follow/check?uid= — 팔로우 여부 확인
        if (path === '/api/follow/check' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const targetUid = url.searchParams.get('uid');
            const follows = loadJSON('follows.json', {});
            const myFollowing = (follows.following || {})[user.username] || [];
            res.end(JSON.stringify({ isFollowing: myFollowing.includes(targetUid) }));
            return;
        }

        // GET /api/follow/counts?uid= — 팔로워/팔로잉 수
        if (path === '/api/follow/counts' && req.method === 'GET') {
            const targetUid = url.searchParams.get('uid');
            const follows = loadJSON('follows.json', {});
            const followers = ((follows.followers || {})[targetUid] || []).length;
            const following = ((follows.following || {})[targetUid] || []).length;
            res.end(JSON.stringify({ followers, following }));
            return;
        }

        // GET /api/users/profile?uid= — 유저 프로필 상세 (친구수, 게시물수 포함)
        if (path === '/api/users/profile' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const targetUid = url.searchParams.get('uid');
            const target = users[targetUid];
            if (!target) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }

            const friends = loadJSON('friends.json', {});
            const friendCount = (friends[targetUid] || []).length;

            const follows = loadJSON('follows.json', {});
            const followersCount = ((follows.followers || {})[targetUid] || []).length;
            const followingCount = ((follows.following || {})[targetUid] || []).length;

            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let postCount = 0;
            try {
                const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
                postCount = posts.filter(p => p.author === targetUid).length;
            } catch(e) {}

            const myFriends = friends[user.username] || [];
            const isFriend = myFriends.some(f => f.uid === targetUid);
            const myFollowing = ((follows.following || {})[user.username] || []);
            const isFollowing = myFollowing.includes(targetUid);

            res.end(JSON.stringify({
                username: target.username,
                nickname: target.displayName || target.username,
                photoURL: target.photoURL || '',
                statusMessage: target.statusMessage || '',
                friendCount, followersCount, followingCount, postCount,
                isFriend, isFollowing
            }));
            return;
        }

        // POST /api/social/save — 게시물 저장/해제 토글
        if (path === '/api/social/save' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const postId = body.postId;
            if (!postId) { res.statusCode = 400; res.end('{"error":"missing postId"}'); return; }
            const saved = loadJSON('saved_posts.json', {});
            if (!saved[user.username]) saved[user.username] = [];
            const idx = saved[user.username].indexOf(postId);
            let isSaved;
            if (idx >= 0) { saved[user.username].splice(idx, 1); isSaved = false; }
            else { saved[user.username].push(postId); isSaved = true; }
            saveJSON('saved_posts.json', saved);
            res.end(JSON.stringify({ ok: true, saved: isSaved }));
            return;
        }

        // GET /api/social/save/check?postId= — 저장 여부 확인
        if (path === '/api/social/save/check' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const postId = url.searchParams.get('postId');
            const saved = loadJSON('saved_posts.json', {});
            const userSaved = saved[user.username] || [];
            res.end(JSON.stringify({ saved: userSaved.includes(postId) }));
            return;
        }

        // POST /api/social/repost — 리포스트
        if (path === '/api/social/repost' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const postId = body.postId;
            if (!postId) { res.statusCode = 400; res.end('{"error":"missing postId"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const original = posts.find(p => p.id === postId);
            if (!original) { res.statusCode = 404; res.end('{"error":"post not found"}'); return; }
            const repost = {
                id: `p_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                author: user.username,
                text: original.text || '',
                image: original.image || null,
                youtube: original.youtube || null,
                likes: [],
                commentCount: 0,
                repostOf: postId,
                originalAuthor: original.author,
                ts: Date.now(),
            };
            posts.push(repost);
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true, post: repost }));
            return;
        }

        // POST /api/social/comment/like — 댓글 좋아요 토글
        if (path === '/api/social/comment/like' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { postId, commentId } = body;
            if (!postId || !commentId) { res.statusCode = 400; res.end('{"error":"missing ids"}'); return; }
            const commFile = pathModule.join(SOCIAL_DIR, `comments_${postId}.json`);
            let comments = [];
            try { comments = JSON.parse(fs.readFileSync(commFile, 'utf8')); } catch(e) {}
            const comment = comments.find(c => c.id === commentId);
            if (!comment) { res.statusCode = 404; res.end('{"error":"comment not found"}'); return; }
            if (!comment.likes) comment.likes = [];
            const idx = comment.likes.indexOf(user.username);
            if (idx >= 0) comment.likes.splice(idx, 1);
            else comment.likes.push(user.username);
            fs.writeFileSync(commFile, JSON.stringify(comments, null, 1));
            res.end(JSON.stringify({ ok: true, liked: idx < 0, count: comment.likes.length }));
            return;
        }

        // POST /api/social/share — 공유 카운트 증가
        if (path === '/api/social/share' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const postId = body.postId;
            if (!postId) { res.statusCode = 400; res.end('{"error":"missing postId"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const post = posts.find(p => p.id === postId);
            if (!post) { res.statusCode = 404; res.end('{"error":"post not found"}'); return; }
            post.shareCount = (post.shareCount || 0) + 1;
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true, shareCount: post.shareCount }));
            return;
        }

        // GET /api/social/user-posts?uid=&tab= — 사용자별 게시물 조회
        if (path === '/api/social/user-posts' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const uid = url.searchParams.get('uid') || user.username;
            const tab = url.searchParams.get('tab') || 'posts';
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}

            let result = [];
            if (tab === 'posts') {
                result = posts.filter(p => p.author === uid).sort((a, b) => (b.ts || 0) - (a.ts || 0));
            } else if (tab === 'media') {
                result = posts.filter(p => p.author === uid && (p.image || p.youtube || p.videoUrl)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
            } else if (tab === 'saved') {
                const saved = loadJSON('saved_posts.json', {});
                const savedIds = saved[uid] || [];
                result = posts.filter(p => savedIds.includes(p.id)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
            }
            const enriched = result.map(p => ({
                ...p,
                authorName: users[p.author]?.displayName || p.author,
                authorPhotoURL: users[p.author]?.photoURL || '',
            }));
            res.end(JSON.stringify({ posts: enriched }));
            return;
        }

        // PATCH /api/social/post — 게시물 수정
        if (path === '/api/social/post' && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { postId, text } = body;
            if (!postId || !text) { res.statusCode = 400; res.end('{"error":"missing postId or text"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) {}
            const post = posts.find(p => p.id === postId);
            if (!post) { res.statusCode = 404; res.end('{"error":"post not found"}'); return; }
            if (post.author !== user.username) { res.statusCode = 403; res.end('{"error":"not your post"}'); return; }
            post.text = text;
            post.editedAt = Date.now();
            fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
            res.end(JSON.stringify({ ok: true, post }));
            return;
        }

        // ═══ 채널 (Channels) ═══

        // GET /api/channels — 채널 목록
        if (path === '/api/channels' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const channels = loadJSON('channels.json', []);
            res.end(JSON.stringify(channels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))));
            return;
        }

        // POST /api/channels — 채널 생성
        if (path === '/api/channels' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { name, description } = body;
            if (!name) { res.statusCode = 400; res.end('{"error":"missing name"}'); return; }
            const channels = loadJSON('channels.json', []);
            const channel = {
                id: `ch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                name: name.trim(),
                description: description || '',
                ownerId: user.username,
                subscribers: [user.username],
                createdAt: Date.now()
            };
            channels.push(channel);
            saveJSON('channels.json', channels);
            res.end(JSON.stringify({ ok: true, channel }));
            return;
        }

        // GET /api/channels/:id/messages — 채널 메시지 조회
        if (/^\/api\/channels\/[^/]+\/messages$/.test(path) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const chId = path.split('/')[3];
            const msgFile = pathModule.join(DATA_DIR, `channel_msgs_${chId}.json`);
            let msgs = [];
            try { msgs = JSON.parse(fs.readFileSync(msgFile, 'utf8')); } catch(e) {}
            res.end(JSON.stringify(msgs));
            return;
        }

        // POST /api/channels/:id/messages — 채널 메시지 보내기
        if (/^\/api\/channels\/[^/]+\/messages$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const chId = path.split('/')[3];
            const channels = loadJSON('channels.json', []);
            const channel = channels.find(c => c.id === chId);
            if (!channel) { res.statusCode = 404; res.end('{"error":"channel not found"}'); return; }
            if (channel.ownerId !== user.username) { res.statusCode = 403; res.end('{"error":"only owner can post"}'); return; }
            const msgFile = pathModule.join(DATA_DIR, `channel_msgs_${chId}.json`);
            let msgs = [];
            try { msgs = JSON.parse(fs.readFileSync(msgFile, 'utf8')); } catch(e) {}
            const msg = {
                id: `cm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
                senderId: user.username,
                text: body.text || '',
                type: body.type || 'text',
                timestamp: Date.now()
            };
            msgs.push(msg);
            fs.writeFileSync(msgFile, JSON.stringify(msgs, null, 1));
            res.end(JSON.stringify({ ok: true, message: msg }));
            return;
        }

        // POST /api/channels/:id/subscribe — 구독/구독취소 토글
        if (/^\/api\/channels\/[^/]+\/subscribe$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const chId = path.split('/')[3];
            const channels = loadJSON('channels.json', []);
            const channel = channels.find(c => c.id === chId);
            if (!channel) { res.statusCode = 404; res.end('{"error":"channel not found"}'); return; }
            if (!channel.subscribers) channel.subscribers = [];
            const idx = channel.subscribers.indexOf(user.username);
            let subscribed;
            if (idx >= 0) { channel.subscribers.splice(idx, 1); subscribed = false; }
            else { channel.subscribers.push(user.username); subscribed = true; }
            saveJSON('channels.json', channels);
            res.end(JSON.stringify({ ok: true, subscribed, subscriberCount: channel.subscribers.length }));
            return;
        }

        // ═══ ART MODULE API ═══

        // --- Art: Image Upload (base64) ---
        if (path === '/api/art/upload-image' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { imageData, thumbnailData, artworkId } = body;
            if (!imageData) { res.writeHead(400); res.end(JSON.stringify({ error: 'imageData required' })); return; }
            // Store images as base64 in data/art_images/
            const imgDir = pathModule.join(DATA_DIR, 'art_images');
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
            const id = artworkId || `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            fs.writeFileSync(pathModule.join(imgDir, id + '_main.txt'), imageData);
            if (thumbnailData) fs.writeFileSync(pathModule.join(imgDir, id + '_thumb.txt'), thumbnailData);
            res.end(JSON.stringify({ ok: true, imageUrl: `/api/art/image/${id}_main`, thumbnailUrl: thumbnailData ? `/api/art/image/${id}_thumb` : `/api/art/image/${id}_main`, isBase64: true }));
            return;
        }

        // --- Art: Serve stored image ---
        if (path.startsWith('/api/art/image/') && req.method === 'GET') {
            const imgId = path.replace('/api/art/image/', '');
            const imgFile = pathModule.join(DATA_DIR, 'art_images', imgId + '.txt');
            if (fs.existsSync(imgFile)) {
                const data = fs.readFileSync(imgFile, 'utf8');
                // data is a data URL like data:image/jpeg;base64,...
                if (data.startsWith('data:')) {
                    const match = data.match(/^data:(image\/[^;]+);base64,(.+)$/);
                    if (match) {
                        res.writeHead(200, { 'Content-Type': match[1], 'Cache-Control': 'public, max-age=31536000' });
                        res.end(Buffer.from(match[2], 'base64'));
                        return;
                    }
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(data);
            } else {
                res.writeHead(404); res.end('Not found');
            }
            return;
        }

        // --- Art: Artist profiles ---
        if (path === '/api/art/artist-profile' && req.method === 'GET') {
            const artistId = params.get('artistId');
            if (!artistId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artistId required' })); return; }
            const profiles = loadJSON('art_artist_profiles.json', {});
            res.end(JSON.stringify({ ok: true, profile: profiles[artistId] || null }));
            return;
        }

        if (path === '/api/art/artist-profile' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artistId, updateData, initData } = body;
            if (!artistId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artistId required' })); return; }
            const profiles = loadJSON('art_artist_profiles.json', {});
            if (!profiles[artistId] && initData) {
                profiles[artistId] = { userId: artistId, nickname: '', email: '', bio: '', profileImage: '', totalWorks: 0, totalWorksCount: 0, totalSales: 0, totalSoldCount: 0, totalRevenue: 0, totalLikes: 0, totalDonationContribution: 0, baseWeightMultiplier: 1.0, weightMultiplier: 1.0, verified: false, createdAt: new Date().toISOString(), ...initData };
            }
            if (profiles[artistId] && updateData) {
                // Handle increment operations
                for (const [k, v] of Object.entries(updateData)) {
                    if (typeof v === 'object' && v && v._inc !== undefined) {
                        profiles[artistId][k] = (profiles[artistId][k] || 0) + v._inc;
                    } else {
                        profiles[artistId][k] = v;
                    }
                }
            }
            saveJSON('art_artist_profiles.json', profiles);
            res.end(JSON.stringify({ ok: true, profile: profiles[artistId] }));
            return;
        }

        // --- Art: Recalculate artist weight ---
        if (path === '/api/art/recalculate-weight' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artistId } = body;
            if (!artistId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artistId required' })); return; }
            const profiles = loadJSON('art_artist_profiles.json', {});
            if (!profiles[artistId]) { res.end(JSON.stringify({ ok: true, weight: 1.0 })); return; }
            const data = profiles[artistId];
            const totalSoldCount = data.totalSoldCount || data.totalSales || 0;
            const totalDonationContribution = data.totalDonationContribution || 0;
            let weight = 1.0 + (totalSoldCount * 0.05) + (totalDonationContribution * 0.01);
            weight = Math.max(1.0, Math.min(10.0, weight));
            weight = Math.round(weight * 100) / 100;
            profiles[artistId].weightMultiplier = weight;
            saveJSON('art_artist_profiles.json', profiles);
            res.end(JSON.stringify({ ok: true, weight }));
            return;
        }

        // --- Art: Gallery (list artworks) ---
        if (path === '/api/art/gallery' && req.method === 'GET') {
            const artworks = loadJSON('art_gallery.json', {});
            const filterCat = params.get('category') || 'all';
            const filterSort = params.get('sort') || 'newest';
            const filterNFT = params.get('nft') || 'all';
            const limit = parseInt(params.get('limit')) || 40;
            let items = Object.entries(artworks).map(([id, data]) => ({ id, ...data })).filter(a => a.status === 'active');
            if (filterCat !== 'all') items = items.filter(a => a.category === filterCat);
            if (filterNFT === 'nft') items = items.filter(a => a.isNFT);
            if (filterNFT === 'non-nft') items = items.filter(a => !a.isNFT);
            if (filterSort === 'popular') items.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            else if (filterSort === 'price-low') items.sort((a, b) => (a.price || 0) - (b.price || 0));
            else if (filterSort === 'price-high') items.sort((a, b) => (b.price || 0) - (a.price || 0));
            else items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            if (filterSort === 'auction') items = items.filter(a => a.saleType === 'auction');
            res.end(JSON.stringify({ ok: true, items: items.slice(0, limit) }));
            return;
        }

        // --- Art: Get single artwork ---
        if (path === '/api/art/artwork' && req.method === 'GET') {
            const artId = params.get('id');
            if (!artId) { res.writeHead(400); res.end(JSON.stringify({ error: 'id required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const art = artworks[artId];
            if (!art) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            res.end(JSON.stringify({ ok: true, id: artId, ...art }));
            return;
        }

        // --- Art: Create artwork ---
        if (path === '/api/art/artwork' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artwork } = body;
            if (!artwork) { res.writeHead(400); res.end(JSON.stringify({ error: 'artwork required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const artId = `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            artwork.createdAt = new Date().toISOString();
            artworks[artId] = artwork;
            saveJSON('art_gallery.json', artworks);
            res.end(JSON.stringify({ ok: true, id: artId }));
            return;
        }

        // --- Art: Update artwork ---
        if (path === '/api/art/artwork' && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { id, updateData } = body;
            if (!id) { res.writeHead(400); res.end(JSON.stringify({ error: 'id required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            if (!artworks[id]) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            for (const [k, v] of Object.entries(updateData || {})) {
                if (typeof v === 'object' && v && v._inc !== undefined) {
                    artworks[id][k] = (artworks[id][k] || 0) + v._inc;
                } else {
                    artworks[id][k] = v;
                }
            }
            saveJSON('art_gallery.json', artworks);
            res.end(JSON.stringify({ ok: true, artwork: artworks[id] }));
            return;
        }

        // --- Art: Like artwork ---
        if (path === '/api/art/like' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artId } = body;
            if (!artId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artId required' })); return; }
            const likes = loadJSON('art_likes.json', {});
            const key = `${artId}_${user.username}`;
            if (likes[key]) { res.end(JSON.stringify({ ok: false, alreadyLiked: true })); return; }
            likes[key] = { userId: user.username, artId, timestamp: new Date().toISOString() };
            saveJSON('art_likes.json', likes);
            // Increment likes on artwork
            const artworks = loadJSON('art_gallery.json', {});
            if (artworks[artId]) { artworks[artId].likes = (artworks[artId].likes || 0) + 1; saveJSON('art_gallery.json', artworks); }
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- Art: Delete artwork (soft) ---
        if (path === '/api/art/delete' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artId } = body;
            if (!artId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artId required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            if (!artworks[artId]) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            if (artworks[artId].artistId !== user.username) { res.writeHead(403); res.end(JSON.stringify({ error: 'not owner' })); return; }
            artworks[artId].status = 'deleted';
            saveJSON('art_gallery.json', artworks);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- Art: NFT records ---
        if (path === '/api/art/nft-record' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { record } = body;
            if (!record) { res.writeHead(400); res.end(JSON.stringify({ error: 'record required' })); return; }
            const records = loadJSON('art_nft_records.json', {});
            const recId = `nft_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            record.createdAt = new Date().toISOString();
            records[recId] = record;
            saveJSON('art_nft_records.json', records);
            res.end(JSON.stringify({ ok: true, id: recId }));
            return;
        }

        // --- Art: Buy artwork ---
        if (path === '/api/art/buy' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artId } = body;
            if (!artId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artId required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const art = artworks[artId];
            if (!art) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            if (art.status !== 'active') { res.end(JSON.stringify({ ok: false, error: 'not active' })); return; }
            if (art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0) { res.end(JSON.stringify({ ok: false, error: 'sold out' })); return; }
            const effectivePrice = art.price || Math.round((art.basePrice || 0) * (art.artistWeight || 1) * 100) / 100;
            const platformFeePercent = 2.5;
            const platformFee = Math.round(effectivePrice * (platformFeePercent / 100) * 100) / 100;
            const artistReceive = Math.round((effectivePrice - platformFee) * 100) / 100;
            // Check buyer balance
            const usersData = loadJSON('users_ext.json', {});
            const buyerData = usersData[user.username] || {};
            const buyerBal = (buyerData.offchainBalances || {}).crac || 0;
            if (buyerBal < effectivePrice) { res.end(JSON.stringify({ ok: false, error: 'insufficient_balance', balance: buyerBal, needed: effectivePrice })); return; }
            // Deduct from buyer
            if (!usersData[user.username]) usersData[user.username] = { offchainBalances: {} };
            if (!usersData[user.username].offchainBalances) usersData[user.username].offchainBalances = {};
            usersData[user.username].offchainBalances.crac = buyerBal - effectivePrice;
            // Pay artist
            if (!usersData[art.artistId]) usersData[art.artistId] = { offchainBalances: {} };
            if (!usersData[art.artistId].offchainBalances) usersData[art.artistId].offchainBalances = {};
            usersData[art.artistId].offchainBalances.crac = (usersData[art.artistId].offchainBalances.crac || 0) + artistReceive;
            saveJSON('users_ext.json', usersData);
            // Update artwork
            artworks[artId].soldCount = (artworks[artId].soldCount || 0) + 1;
            if (!art.totalSupply || art.totalSupply <= 1) {
                artworks[artId].status = 'sold';
                artworks[artId].buyerId = user.username;
                artworks[artId].buyerEmail = user.email;
                artworks[artId].soldAt = new Date().toISOString();
                artworks[artId].soldPrice = effectivePrice;
                artworks[artId].soldToken = art.priceToken || 'CRAC';
            }
            saveJSON('art_gallery.json', artworks);
            // Record purchase
            const purchases = loadJSON('art_purchases.json', []);
            purchases.push({ artworkId: artId, buyerId: user.username, buyerEmail: user.email, price: effectivePrice, token: art.priceToken || 'CRAC', timestamp: new Date().toISOString() });
            saveJSON('art_purchases.json', purchases);
            // Transaction record
            const txns = loadJSON('art_transactions.json', []);
            txns.push({ artworkId: artId, artworkTitle: art.title, from: user.username, to: art.artistId, amount: effectivePrice, artistReceive, platformFee, basePrice: art.basePrice || effectivePrice, artistWeight: art.artistWeight || 1, token: art.priceToken || 'CRAC', isNFT: art.isNFT || false, nftTokenId: art.nftTokenId || null, type: 'art_purchase', timestamp: new Date().toISOString() });
            saveJSON('art_transactions.json', txns);
            // Auto donation
            const donationAmount = Math.max(10, effectivePrice * 0.02);
            const newBuyerBal = usersData[user.username].offchainBalances.crac;
            if (newBuyerBal >= donationAmount) {
                usersData[user.username].offchainBalances.crac = newBuyerBal - donationAmount;
                saveJSON('users_ext.json', usersData);
                const donLogs = loadJSON('art_giving_pool_logs.json', []);
                donLogs.push({ userId: user.username, amount: donationAmount, token: 'CRAC', source: 'art_trade', note: 'Art trade auto donation (' + effectivePrice + ' CRAC)', timestamp: new Date().toISOString() });
                saveJSON('art_giving_pool_logs.json', donLogs);
            }
            res.end(JSON.stringify({ ok: true, effectivePrice, platformFee, artistReceive }));
            return;
        }

        // --- Art: Place bid ---
        if (path === '/api/art/bid' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artId, bidAmount } = body;
            if (!artId || !bidAmount) { res.writeHead(400); res.end(JSON.stringify({ error: 'artId and bidAmount required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const art = artworks[artId];
            if (!art) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            const minBid = (art.currentBid || art.startPrice || 1) + 1;
            if (bidAmount < minBid) { res.end(JSON.stringify({ ok: false, error: 'bid_too_low', minBid })); return; }
            // Check balance
            const usersData = loadJSON('users_ext.json', {});
            const bal = (usersData[user.username]?.offchainBalances?.crac) || 0;
            if (bal < bidAmount) { res.end(JSON.stringify({ ok: false, error: 'insufficient_balance', balance: bal })); return; }
            // Get nickname
            const nickname = user.displayName || user.username;
            artworks[artId].currentBid = bidAmount;
            artworks[artId].highestBidder = user.username;
            artworks[artId].highestBidderEmail = user.email;
            artworks[artId].highestBidderNickname = nickname;
            saveJSON('art_gallery.json', artworks);
            // Record bid
            const bids = loadJSON('art_bids.json', []);
            bids.push({ artworkId: artId, bidderId: user.username, bidderEmail: user.email, bidderNickname: nickname, amount: bidAmount, timestamp: new Date().toISOString() });
            saveJSON('art_bids.json', bids);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- Art: Reserve artwork ---
        if (path === '/api/art/reserve' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { artId } = body;
            if (!artId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artId required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const art = artworks[artId];
            if (!art) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            if (art.status !== 'active') { res.end(JSON.stringify({ ok: false, error: 'not active' })); return; }
            if (art.totalSupply > 0 && (art.totalSupply - (art.soldCount || 0)) <= 0) { res.end(JSON.stringify({ ok: false, error: 'sold out' })); return; }
            const effectivePrice = art.price || Math.round((art.basePrice || 0) * (art.artistWeight || 1) * 100) / 100;
            const depositAmount = Math.ceil(effectivePrice / 10);
            const remainingAmount = effectivePrice - depositAmount;
            const tokenKey = 'crac';
            // Check balance
            const usersData = loadJSON('users_ext.json', {});
            const buyerBal = (usersData[user.username]?.offchainBalances?.crac) || 0;
            if (buyerBal < depositAmount) { res.end(JSON.stringify({ ok: false, error: 'insufficient_balance', balance: buyerBal, needed: depositAmount })); return; }
            // Deduct deposit from buyer, pay to artist
            if (!usersData[user.username]) usersData[user.username] = { offchainBalances: {} };
            if (!usersData[user.username].offchainBalances) usersData[user.username].offchainBalances = {};
            usersData[user.username].offchainBalances.crac = buyerBal - depositAmount;
            if (!usersData[art.artistId]) usersData[art.artistId] = { offchainBalances: {} };
            if (!usersData[art.artistId].offchainBalances) usersData[art.artistId].offchainBalances = {};
            usersData[art.artistId].offchainBalances.crac = (usersData[art.artistId].offchainBalances.crac || 0) + depositAmount;
            saveJSON('users_ext.json', usersData);
            // Create reservation
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            const reservations = loadJSON('art_reservations.json', {});
            const resId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            reservations[resId] = { artworkId: artId, artworkTitle: art.title, artworkImage: art.thumbnailUrl || art.imageUrl || '', buyerId: user.username, buyerEmail: user.email, artistId: art.artistId, totalPrice: effectivePrice, depositAmount, depositPaid: true, depositPaidAt: new Date().toISOString(), depositToken: art.priceToken || 'CRAC', remainingAmount, expiresAt: expiresAt.toISOString(), status: 'reserved', completedAt: null, createdAt: new Date().toISOString() };
            saveJSON('art_reservations.json', reservations);
            // Transaction
            const txns = loadJSON('art_transactions.json', []);
            txns.push({ artworkId: artId, artworkTitle: art.title, from: user.username, to: art.artistId, amount: depositAmount, token: art.priceToken || 'CRAC', type: 'art_reservation_deposit', timestamp: new Date().toISOString() });
            saveJSON('art_transactions.json', txns);
            res.end(JSON.stringify({ ok: true, reservationId: resId, depositAmount, remainingAmount, effectivePrice }));
            return;
        }

        // --- Art: Complete reservation ---
        if (path === '/api/art/complete-reservation' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { reservationId } = body;
            if (!reservationId) { res.writeHead(400); res.end(JSON.stringify({ error: 'reservationId required' })); return; }
            const reservations = loadJSON('art_reservations.json', {});
            const reservation = reservations[reservationId];
            if (!reservation) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            if (reservation.buyerId !== user.username) { res.writeHead(403); res.end(JSON.stringify({ error: 'not owner' })); return; }
            if (reservation.status !== 'reserved') { res.end(JSON.stringify({ ok: false, error: 'already processed' })); return; }
            if (new Date() > new Date(reservation.expiresAt)) {
                reservations[reservationId].status = 'expired';
                saveJSON('art_reservations.json', reservations);
                res.end(JSON.stringify({ ok: false, error: 'expired' }));
                return;
            }
            const remainingAmount = reservation.remainingAmount;
            const platformFee = Math.round(reservation.totalPrice * 2.5 / 100 * 100) / 100;
            const artistReceiveRemaining = Math.round((remainingAmount - platformFee) * 100) / 100;
            // Check balance
            const usersData = loadJSON('users_ext.json', {});
            const buyerBal = (usersData[user.username]?.offchainBalances?.crac) || 0;
            if (buyerBal < remainingAmount) { res.end(JSON.stringify({ ok: false, error: 'insufficient_balance', balance: buyerBal, needed: remainingAmount })); return; }
            // Deduct
            usersData[user.username].offchainBalances.crac = buyerBal - remainingAmount;
            if (!usersData[reservation.artistId]) usersData[reservation.artistId] = { offchainBalances: {} };
            if (!usersData[reservation.artistId].offchainBalances) usersData[reservation.artistId].offchainBalances = {};
            usersData[reservation.artistId].offchainBalances.crac = (usersData[reservation.artistId].offchainBalances.crac || 0) + artistReceiveRemaining;
            saveJSON('users_ext.json', usersData);
            // Update reservation
            reservations[reservationId].status = 'completed';
            reservations[reservationId].completedAt = new Date().toISOString();
            saveJSON('art_reservations.json', reservations);
            // Update artwork soldCount
            const artworks = loadJSON('art_gallery.json', {});
            if (artworks[reservation.artworkId]) {
                artworks[reservation.artworkId].soldCount = (artworks[reservation.artworkId].soldCount || 0) + 1;
                saveJSON('art_gallery.json', artworks);
            }
            // Purchases
            const purchases = loadJSON('art_purchases.json', []);
            purchases.push({ artworkId: reservation.artworkId, buyerId: user.username, buyerEmail: user.email, price: reservation.totalPrice, token: reservation.depositToken || 'CRAC', type: 'reservation_complete', reservationId, timestamp: new Date().toISOString() });
            saveJSON('art_purchases.json', purchases);
            // Transaction
            const txns = loadJSON('art_transactions.json', []);
            txns.push({ artworkId: reservation.artworkId, artworkTitle: reservation.artworkTitle, from: user.username, to: reservation.artistId, amount: remainingAmount, token: reservation.depositToken || 'CRAC', type: 'art_reservation_complete', timestamp: new Date().toISOString() });
            saveJSON('art_transactions.json', txns);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- Art: Cancel reservation ---
        if (path === '/api/art/cancel-reservation' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { reservationId } = body;
            if (!reservationId) { res.writeHead(400); res.end(JSON.stringify({ error: 'reservationId required' })); return; }
            const reservations = loadJSON('art_reservations.json', {});
            if (!reservations[reservationId]) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
            if (reservations[reservationId].buyerId !== user.username) { res.writeHead(403); res.end(JSON.stringify({ error: 'not owner' })); return; }
            reservations[reservationId].status = 'cancelled';
            reservations[reservationId].cancelledAt = new Date().toISOString();
            saveJSON('art_reservations.json', reservations);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- Art: My artworks ---
        if (path === '/api/art/my-artworks' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const items = Object.entries(artworks).filter(([, a]) => a.artistId === user.username).map(([id, a]) => ({ id, ...a })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 30);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- Art: My purchases ---
        if (path === '/api/art/my-purchases' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const items = Object.entries(artworks).filter(([, a]) => a.buyerId === user.username).map(([id, a]) => ({ id, ...a })).sort((a, b) => new Date(b.soldAt || 0) - new Date(a.soldAt || 0)).slice(0, 30);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- Art: My NFTs ---
        if (path === '/api/art/my-nfts' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const nfts = new Map();
            Object.entries(artworks).forEach(([id, a]) => {
                if (a.isNFT && a.artistId === user.username) nfts.set(id, { id, ...a, relation: 'minted' });
            });
            Object.entries(artworks).forEach(([id, a]) => {
                if (a.isNFT && a.buyerId === user.username) {
                    if (nfts.has(id)) nfts.get(id).relation = 'minted+owned';
                    else nfts.set(id, { id, ...a, relation: 'owned' });
                }
            });
            res.end(JSON.stringify({ ok: true, items: Array.from(nfts.values()) }));
            return;
        }

        // --- Art: My reservations ---
        if (path === '/api/art/my-reservations' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const reservations = loadJSON('art_reservations.json', {});
            const items = Object.entries(reservations).filter(([, r]) => r.buyerId === user.username).map(([id, r]) => ({ id, ...r })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 20);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- Art: My transactions ---
        if (path === '/api/art/my-transactions' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const txns = loadJSON('art_transactions.json', []);
            const items = txns.filter(t => t.from === user.username || t.to === user.username).map(t => ({ ...t, direction: t.to === user.username ? 'in' : 'out' })).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 30);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- Art: Get user info (nickname, wallet, balances) ---
        if (path === '/api/art/user-info' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const usersData = loadJSON('users_ext.json', {});
            const ext = usersData[user.username] || {};
            res.end(JSON.stringify({ ok: true, nickname: user.displayName || user.username, polygonAddress: user.walletAddress || '', offchainBalances: ext.offchainBalances || {} }));
            return;
        }

        // --- Art: Artist works (for profile view) ---
        if (path === '/api/art/artist-works' && req.method === 'GET') {
            const artistId = params.get('artistId');
            if (!artistId) { res.writeHead(400); res.end(JSON.stringify({ error: 'artistId required' })); return; }
            const artworks = loadJSON('art_gallery.json', {});
            const items = Object.entries(artworks).filter(([, a]) => a.artistId === artistId && a.status === 'active').map(([id, a]) => ({ id, ...a }));
            res.end(JSON.stringify({ ok: true, count: items.length }));
            return;
        }

        // --- Art: Giving pool log ---
        if (path === '/api/art/giving-pool-log' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
            const { logEntry } = body;
            const logs = loadJSON('art_giving_pool_logs.json', []);
            logs.push({ ...logEntry, timestamp: new Date().toISOString() });
            saveJSON('art_giving_pool_logs.json', logs);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ═══ 도서 플랫폼 (Books) ═══

        // GET /api/books — 공개 도서 목록
        if (path === '/api/books' && req.method === 'GET') {
            const books = loadJSON('books.json', {});
            const list = Object.entries(books)
                .map(([id, b]) => ({ id, ...b }))
                .filter(b => ['published', 'active', 'soldout'].includes(b.status))
                .sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0))
                .slice(0, 50);
            res.end(JSON.stringify({ ok: true, books: list }));
            return;
        }

        // GET /api/books/my/purchases — 내 구매 목록
        if (path === '/api/books/my/purchases' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const purchases = loadJSON('book_purchases.json', []);
            const mine = purchases.filter(p => p.userId === user.username)
                .sort((a, b) => (b.purchasedAt || 0) - (a.purchasedAt || 0)).slice(0, 50);
            res.end(JSON.stringify({ ok: true, purchases: mine }));
            return;
        }

        // GET /api/books/my/treasures — 내 보물 목록
        if (path === '/api/books/my/treasures' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const treasures = loadJSON('book_treasures.json', {});
            const mine = Object.entries(treasures)
                .filter(([k]) => k.startsWith(user.username + ':'))
                .map(([, v]) => v)
                .sort((a, b) => (b.foundAt || 0) - (a.foundAt || 0)).slice(0, 50);
            res.end(JSON.stringify({ ok: true, treasures: mine }));
            return;
        }

        // GET /api/books/my/reading-progress/:bookId — 독서 진행률
        if (path.match(/^\/api\/books\/my\/reading-progress\//) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.end(JSON.stringify({ ok: true, sceneIndex: 0 })); return; }
            const bookId = path.split('/api/books/my/reading-progress/')[1];
            const progress = loadJSON('book_reading_progress.json', {});
            const key = user.username + ':' + bookId;
            res.end(JSON.stringify({ ok: true, sceneIndex: progress[key]?.sceneIndex || 0 }));
            return;
        }

        // POST /api/books/my/reading-progress — 독서 진행률 저장
        if (path === '/api/books/my/reading-progress' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { bookId, sceneIndex } = body;
            const progress = loadJSON('book_reading_progress.json', {});
            const key = user.username + ':' + bookId;
            progress[key] = { sceneIndex, updatedAt: Date.now() };
            saveJSON('book_reading_progress.json', progress);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/books/check-purchase/:bookId — 구매 여부 확인
        if (path.match(/^\/api\/books\/check-purchase\//) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.end(JSON.stringify({ ok: true, owns: false })); return; }
            const bookId = path.split('/api/books/check-purchase/')[1];
            const purchases = loadJSON('book_purchases.json', []);
            const found = purchases.find(p => p.userId === user.username && p.bookId === bookId);
            res.end(JSON.stringify({ ok: true, owns: !!found, editionNumber: found?.editionNumber || null }));
            return;
        }

        // GET /api/books/reading-list — 읽기 목록 조회
        if (path === '/api/books/reading-list' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const readingList = loadJSON('book_reading_list.json', []);
            const mine = readingList.filter(r => r.userId === user.username)
                .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 50);
            res.end(JSON.stringify({ ok: true, list: mine }));
            return;
        }

        // GET /api/books/:id — 도서 상세
        if (path.match(/^\/api\/books\/[^/]+$/) && req.method === 'GET') {
            const id = path.split('/api/books/')[1];
            if (!id) { res.statusCode = 400; res.end('{"error":"id required"}'); return; }
            const books = loadJSON('books.json', {});
            const b = books[id];
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, book: { id, ...b } }));
            return;
        }

        // POST /api/books — 도서 생성(초안 저장)
        if (path === '/api/books' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const books = loadJSON('books.json', {});
            const id = 'book_' + crypto.randomBytes(8).toString('hex');
            const bookData = body;
            bookData.authorId = bookData.authorId || user.username;
            bookData.publisherId = user.username;
            bookData.publisherEmail = user.username + '@crowny.org';
            bookData.createdAt = Date.now();
            bookData.updatedAt = Date.now();
            bookData.sold = bookData.sold || 0;
            bookData.soldCount = bookData.soldCount || 0;
            books[id] = bookData;
            saveJSON('books.json', books);
            res.end(JSON.stringify({ ok: true, id }));
            return;
        }

        // PATCH /api/books/:id — 도서 수정
        if (path.match(/^\/api\/books\/[^/]+$/) && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = path.split('/api/books/')[1];
            const books = loadJSON('books.json', {});
            const b = books[id];
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (b.authorId !== user.username && b.publisherId !== user.username && !ADMIN_USERS.includes(user.username)) {
                res.statusCode = 403; res.end('{"error":"forbidden"}'); return;
            }
            Object.assign(b, body, { updatedAt: Date.now() });
            books[id] = b;
            saveJSON('books.json', books);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/books/:id/publish — 도서 출판
        if (path.match(/^\/api\/books\/[^/]+\/publish$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = path.split('/')[3];
            const books = loadJSON('books.json', {});
            const b = books[id];
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (b.authorId !== user.username && b.publisherId !== user.username) {
                res.statusCode = 403; res.end('{"error":"forbidden"}'); return;
            }
            b.status = 'published';
            b.publishedAt = Date.now();
            books[id] = b;
            saveJSON('books.json', books);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/books/:id/buy — 도서 구매
        if (path.match(/^\/api\/books\/[^/]+\/buy$/) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const id = path.split('/')[3];
            const books = loadJSON('books.json', {});
            const b = books[id];
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const price = b.basePrice || b.price || 0;

            // 자기 책은 구매 불가
            if (b.authorId === user.username || b.publisherId === user.username) {
                res.statusCode = 400; res.end('{"error":"own book"}'); return;
            }

            // 중복 구매 체크
            const purchases = loadJSON('book_purchases.json', []);
            const already = purchases.find(p => p.userId === user.username && p.bookId === id);
            if (already) { res.statusCode = 400; res.end('{"error":"already purchased"}'); return; }

            // 매진 체크
            const sold = b.soldCount || b.sold || 0;
            if (b.edition === 'limited' && b.totalSupply > 0 && sold >= b.totalSupply) {
                res.statusCode = 400; res.end('{"error":"sold out"}'); return;
            }

            // 결제 처리
            if (price > 0) {
                const profile = users[user.username] || {};
                if (!profile.offchainBalances) profile.offchainBalances = {};
                const current = profile.offchainBalances.crgc || 0;
                if (current < price) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
                profile.offchainBalances.crgc = current - price;
                users[user.username] = profile;

                // 저자에게 지급
                const authorId = b.authorId || b.publisherId;
                if (authorId && users[authorId]) {
                    if (!users[authorId].offchainBalances) users[authorId].offchainBalances = {};
                    users[authorId].offchainBalances.crgc = (users[authorId].offchainBalances.crgc || 0) + price;
                }
                saveJSON('users.json', users);

                // 거래 기록
                const txns = loadJSON('book_transactions.json', []);
                txns.push({ from: user.username, to: authorId, amount: price, token: 'CRGC', type: 'book_purchase', bookId: id, timestamp: Date.now() });
                saveJSON('book_transactions.json', txns);
            }

            // 판매 수 증가
            const newSold = sold + 1;
            b.soldCount = newSold;
            b.sold = newSold;
            if (b.edition === 'limited' && b.totalSupply > 0 && newSold >= b.totalSupply) {
                b.status = 'soldout';
            }
            books[id] = b;
            saveJSON('books.json', books);

            // 구매 기록
            const editionNumber = newSold;
            purchases.push({ userId: user.username, bookId: id, bookTitle: b.title, editionNumber, price, token: 'CRGC', purchasedAt: Date.now() });
            saveJSON('book_purchases.json', purchases);

            res.end(JSON.stringify({ ok: true, editionNumber, soldCount: newSold }));
            return;
        }

        // POST /api/books/reading-list/add — 읽기 목록 추가
        if (path === '/api/books/reading-list/add' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { bookId } = body;
            const readingList = loadJSON('book_reading_list.json', []);
            const exists = readingList.find(r => r.userId === user.username && r.bookId === bookId);
            if (exists) { res.statusCode = 400; res.end('{"error":"already in list"}'); return; }
            const books = loadJSON('books.json', {});
            const book = books[bookId];
            const entry = {
                id: 'rl_' + crypto.randomBytes(6).toString('hex'),
                userId: user.username, bookId,
                bookTitle: book?.title || '', bookAuthor: book?.author || '',
                addedAt: Date.now()
            };
            readingList.push(entry);
            saveJSON('book_reading_list.json', readingList);
            res.end(JSON.stringify({ ok: true, entry }));
            return;
        }

        // DELETE /api/books/reading-list/:id — 읽기 목록에서 삭제
        if (path.startsWith('/api/books/reading-list/') && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const entryId = path.split('/api/books/reading-list/')[1];
            let readingList = loadJSON('book_reading_list.json', []);
            const idx = readingList.findIndex(r => r.id === entryId && r.userId === user.username);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            readingList.splice(idx, 1);
            saveJSON('book_reading_list.json', readingList);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/books/treasure/claim — 보물 수집
        if (path === '/api/books/treasure/claim' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { bookId, sceneId, code, reward } = body;
            const treasures = loadJSON('book_treasures.json', {});
            const key = user.username + ':' + bookId + '_' + sceneId;
            if (treasures[key]) { res.statusCode = 400; res.end('{"error":"already claimed"}'); return; }
            treasures[key] = { bookId, sceneId, code, reward: reward || 10, foundAt: Date.now() };
            saveJSON('book_treasures.json', treasures);

            // CRGC 보상 지급
            const profile = users[user.username] || {};
            if (!profile.offchainBalances) profile.offchainBalances = {};
            profile.offchainBalances.crgc = (profile.offchainBalances.crgc || 0) + (reward || 10);
            users[user.username] = profile;
            saveJSON('users.json', users);

            res.end(JSON.stringify({ ok: true, reward: reward || 10 }));
            return;
        }

        // POST /api/books/translation-request — 번역 요청
        if (path === '/api/books/translation-request' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const { bookId, targetLang } = body;
            const requests = loadJSON('book_translation_requests.json', []);
            const exists = requests.find(r => r.bookId === bookId && r.targetLang === targetLang);
            if (exists) { res.statusCode = 400; res.end('{"error":"already requested"}'); return; }
            requests.push({ bookId, requesterId: user.username, targetLang, status: 'pending', createdAt: Date.now() });
            saveJSON('book_translation_requests.json', requests);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ═══ 크라우니케어 (Care) API ═══

        // GET /api/care/group — 내 케어 그룹 조회
        if (path === '/api/care/group' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ group: null })); return; }
            res.end(JSON.stringify({ group }));
            return;
        }

        // POST /api/care/group — 케어 그룹 생성
        if (path === '/api/care/group' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { name } = body;
            if (!name) { res.statusCode = 400; res.end('{"error":"name required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const nickname = user.nickname || user.displayName || user.username;
            const group = {
                id: crypto.randomBytes(8).toString('hex'),
                name,
                createdBy: user.username,
                createdAt: Date.now(),
                memberUids: [user.username],
                members: [{ uid: user.username, email: user.username + '@crowny.org', nickname, role: 'guardian', joinedAt: new Date().toISOString() }]
            };
            groups.push(group);
            saveJSON('care_groups.json', groups);
            res.end(JSON.stringify({ ok: true, group }));
            return;
        }

        // POST /api/care/group/invite — 멤버 초대
        if (path === '/api/care/group/invite' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { email, role } = body;
            if (!email) { res.statusCode = 400; res.end('{"error":"email required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const invitedUsername = email.replace(/@crowny\.org$/, '');
            const invitedUser = users[invitedUsername];
            if (!invitedUser) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            if ((group.memberUids || []).includes(invitedUsername)) { res.statusCode = 400; res.end('{"error":"already member"}'); return; }
            const memberRole = (role === 'guardian') ? 'guardian' : 'member';
            group.memberUids.push(invitedUsername);
            group.members.push({ uid: invitedUsername, email, nickname: invitedUser.nickname || invitedUsername, role: memberRole, joinedAt: new Date().toISOString() });
            saveJSON('care_groups.json', groups);
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const allNotifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            allNotifs.push({ id: crypto.randomBytes(8).toString('hex'), userId: invitedUsername, type: 'care_invite', message: 'You have been invited to ' + group.name, read: false, createdAt: Date.now() });
            fs.writeFileSync(notifFile, JSON.stringify(allNotifs, null, 2));
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/care/messages — 메시지 목록
        if (path === '/api/care/messages' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ messages: [] })); return; }
            const msgs = loadJSON('care_messages.json', []);
            const groupMsgs = msgs.filter(m => m.groupId === group.id).sort((a, b) => b.createdAt - a.createdAt);
            const limit = parseInt(url.searchParams.get('limit') || '3');
            res.end(JSON.stringify({ messages: groupMsgs.slice(0, limit) }));
            return;
        }

        // POST /api/care/messages — 메시지 전송
        if (path === '/api/care/messages' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { text, type: msgType, skipNotify, notifyType, notifyMessage, priority } = body;
            if (!text) { res.statusCode = 400; res.end('{"error":"text required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const nickname = user.nickname || user.displayName || user.username;
            const msgs = loadJSON('care_messages.json', []);
            const msg = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, text, senderId: user.username, senderName: msgType === 'sos' ? 'sos SOS' : nickname, type: msgType || 'text', createdAt: Date.now() };
            msgs.push(msg);
            if (msgs.length > 5000) msgs.splice(0, msgs.length - 5000);
            saveJSON('care_messages.json', msgs);
            if (!skipNotify) {
                const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
                const allNotifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
                for (const m of group.members) {
                    if (m.uid !== user.username) {
                        allNotifs.push({ id: crypto.randomBytes(8).toString('hex'), userId: m.uid, type: notifyType || 'care_message', message: notifyMessage || (nickname + ': ' + text), read: false, priority: priority || 'normal', createdAt: Date.now() });
                    }
                }
                if (allNotifs.length > 1000) allNotifs.splice(0, allNotifs.length - 1000);
                fs.writeFileSync(notifFile, JSON.stringify(allNotifs, null, 2));
            }
            res.end(JSON.stringify({ ok: true, msg }));
            return;
        }

        // GET /api/care/schedules — 스케줄 목록
        if (path === '/api/care/schedules' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ schedules: [] })); return; }
            const all = loadJSON('care_schedules.json', []);
            const scheds = all.filter(s => s.groupId === group.id).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            res.end(JSON.stringify({ schedules: scheds }));
            return;
        }

        // POST /api/care/schedules — 스케줄 추가
        if (path === '/api/care/schedules' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { title, time, icon } = body;
            if (!title || !time) { res.statusCode = 400; res.end('{"error":"title and time required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const all = loadJSON('care_schedules.json', []);
            const sched = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, title, time, icon: icon || '\u2022', createdBy: user.username, createdAt: Date.now() };
            all.push(sched);
            saveJSON('care_schedules.json', all);
            res.end(JSON.stringify({ ok: true, schedule: sched }));
            return;
        }

        // DELETE /api/care/schedules/:id — 스케줄 삭제
        if (/^\/api\/care\/schedules\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const schedId = path.split('/')[4];
            const all = loadJSON('care_schedules.json', []);
            const idx = all.findIndex(s => s.id === schedId);
            if (idx >= 0) all.splice(idx, 1);
            saveJSON('care_schedules.json', all);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/care/medications — 복약 목록
        if (path === '/api/care/medications' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ medications: [] })); return; }
            const all = loadJSON('care_medications.json', []);
            const meds = all.filter(m => m.groupId === group.id).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            res.end(JSON.stringify({ medications: meds }));
            return;
        }

        // POST /api/care/medications — 복약 추가
        if (path === '/api/care/medications' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { name, time, repeat } = body;
            if (!name || !time) { res.statusCode = 400; res.end('{"error":"name and time required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const all = loadJSON('care_medications.json', []);
            const med = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, name, time, repeat: repeat || 'Daily', takenDates: [], createdBy: user.username, createdAt: Date.now() };
            all.push(med);
            saveJSON('care_medications.json', all);
            res.end(JSON.stringify({ ok: true, medication: med }));
            return;
        }

        // POST /api/care/medications/:id/take — 복약 확인
        if (/^\/api\/care\/medications\/[^/]+\/take$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const medId = path.split('/')[4];
            const all = loadJSON('care_medications.json', []);
            const med = all.find(m => m.id === medId);
            if (!med) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const today = new Date().toISOString().split('T')[0];
            if (!med.takenDates) med.takenDates = [];
            if (!med.takenDates.includes(today)) med.takenDates.push(today);
            saveJSON('care_medications.json', all);
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => g.id === med.groupId);
            if (group) {
                const nickname = user.nickname || user.displayName || user.username;
                const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
                const allNotifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
                for (const m of group.members) {
                    if (m.role === 'guardian' && m.uid !== user.username) {
                        allNotifs.push({ id: crypto.randomBytes(8).toString('hex'), userId: m.uid, type: 'care_medication', message: 'pill ' + nickname + ' took their medication', read: false, createdAt: Date.now() });
                    }
                }
                if (allNotifs.length > 1000) allNotifs.splice(0, allNotifs.length - 1000);
                fs.writeFileSync(notifFile, JSON.stringify(allNotifs, null, 2));
            }
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/care/health — 건강 기록 목록
        if (path === '/api/care/health' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ logs: [] })); return; }
            const all = loadJSON('care_health_logs.json', []);
            const logs = all.filter(l => l.groupId === group.id).sort((a, b) => b.createdAt - a.createdAt);
            const limit = parseInt(url.searchParams.get('limit') || '5');
            res.end(JSON.stringify({ logs: logs.slice(0, limit) }));
            return;
        }

        // POST /api/care/health — 건강 기록 추가
        if (path === '/api/care/health' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { bloodPressure, temperature, bloodSugar, weight } = body;
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const nickname = user.nickname || user.displayName || user.username;
            const all = loadJSON('care_health_logs.json', []);
            const log = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, bloodPressure: bloodPressure || null, temperature: temperature ? parseFloat(temperature) : null, bloodSugar: bloodSugar || null, weight: weight ? parseFloat(weight) : null, recorderId: user.username, recorderName: nickname, createdAt: Date.now() };
            all.push(log);
            saveJSON('care_health_logs.json', all);
            res.end(JSON.stringify({ ok: true, log }));
            return;
        }

        // POST /api/care/sos — SOS 알림 생성
        if (path === '/api/care/sos' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { location } = body;
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const nickname = user.nickname || user.displayName || user.username;
            const all = loadJSON('care_sos_alerts.json', []);
            const alert = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, senderId: user.username, senderName: nickname, location: location || null, status: 'active', locations: [], createdAt: Date.now() };
            if (location) alert.locations.push({ lat: location.lat, lng: location.lng, timestamp: Date.now() });
            all.push(alert);
            saveJSON('care_sos_alerts.json', all);
            const locationStr = location ? location.lat.toFixed(4) + ', ' + location.lng.toFixed(4) : 'Location unavailable';
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const allNotifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            for (const m of group.members) {
                if (m.uid !== user.username) {
                    allNotifs.push({ id: crypto.randomBytes(8).toString('hex'), userId: m.uid, type: 'care_sos', message: 'sos URGENT! ' + nickname + ' sent an SOS! (Location: ' + locationStr + ')', read: false, priority: 'urgent', createdAt: Date.now() });
                }
            }
            if (allNotifs.length > 1000) allNotifs.splice(0, allNotifs.length - 1000);
            fs.writeFileSync(notifFile, JSON.stringify(allNotifs, null, 2));
            res.end(JSON.stringify({ ok: true, alert }));
            return;
        }

        // POST /api/care/sos/:id/location — SOS 위치 업데이트
        if (/^\/api\/care\/sos\/[^/]+\/location$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const alertId = path.split('/')[4];
            const { lat, lng, accuracy } = body;
            const all = loadJSON('care_sos_alerts.json', []);
            const alert = all.find(a => a.id === alertId);
            if (!alert) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (!alert.locations) alert.locations = [];
            alert.locations.push({ lat, lng, accuracy, timestamp: Date.now() });
            saveJSON('care_sos_alerts.json', all);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/care/sos/:id/resolve — SOS 해제
        if (/^\/api\/care\/sos\/[^/]+\/resolve$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const alertId = path.split('/')[4];
            const all = loadJSON('care_sos_alerts.json', []);
            const alert = all.find(a => a.id === alertId);
            if (alert) { alert.status = 'resolved'; alert.resolvedAt = Date.now(); }
            saveJSON('care_sos_alerts.json', all);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // POST /api/care/sos/:id/recording — SOS 녹음 업로드 (base64)
        if (/^\/api\/care\/sos\/[^/]+\/recording$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const alertId = path.split('/')[4];
            const { base64, mimeType } = body;
            if (!base64) { res.statusCode = 400; res.end('{"error":"base64 required"}'); return; }
            const recDir = pathModule.join(DATA_DIR, 'sos_recordings');
            if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
            const ext = (mimeType || 'audio/webm').includes('webm') ? 'webm' : 'ogg';
            const filename = alertId + '_' + Date.now() + '.' + ext;
            const filePath = pathModule.join(recDir, filename);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            const recUrl = '/data/sos_recordings/' + filename;
            const all = loadJSON('care_sos_alerts.json', []);
            const alert = all.find(a => a.id === alertId);
            if (alert) { alert.recordingUrl = recUrl; }
            saveJSON('care_sos_alerts.json', all);
            res.end(JSON.stringify({ ok: true, url: recUrl }));
            return;
        }

        // GET /api/care/emergency-contacts — 비상연락처 목록
        if (path === '/api/care/emergency-contacts' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ contacts: [] })); return; }
            const all = loadJSON('care_emergency_contacts.json', []);
            const contacts = all.filter(c => c.groupId === group.id);
            res.end(JSON.stringify({ contacts }));
            return;
        }

        // POST /api/care/emergency-contacts — 비상연락처 추가
        if (path === '/api/care/emergency-contacts' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { hospitalName, phone, doctorName, address } = body;
            if (!hospitalName || !phone) { res.statusCode = 400; res.end('{"error":"hospitalName and phone required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const all = loadJSON('care_emergency_contacts.json', []);
            const contact = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, hospitalName, phone, doctorName: doctorName || '', address: address || '', createdBy: user.username, createdAt: Date.now() };
            all.push(contact);
            saveJSON('care_emergency_contacts.json', all);
            res.end(JSON.stringify({ ok: true, contact }));
            return;
        }

        // DELETE /api/care/emergency-contacts/:id — 비상연락처 삭제
        if (/^\/api\/care\/emergency-contacts\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const ecId = path.split('/')[4];
            const all = loadJSON('care_emergency_contacts.json', []);
            const idx = all.findIndex(c => c.id === ecId);
            if (idx >= 0) all.splice(idx, 1);
            saveJSON('care_emergency_contacts.json', all);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // GET /api/care/neighbors — 이웃 목록
        if (path === '/api/care/neighbors' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ neighbors: [] })); return; }
            const all = loadJSON('care_neighbors.json', []);
            const neighbors = all.filter(n => n.groupId === group.id);
            res.end(JSON.stringify({ neighbors }));
            return;
        }

        // POST /api/care/neighbors — 이웃 추가
        if (path === '/api/care/neighbors' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { email, lat, lng } = body;
            if (!email) { res.statusCode = 400; res.end('{"error":"email required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const neighborUsername = email.replace(/@crowny\.org$/, '');
            const neighborUser = users[neighborUsername];
            if (!neighborUser) { res.statusCode = 404; res.end('{"error":"user not found"}'); return; }
            const all = loadJSON('care_neighbors.json', []);
            const neighbor = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, uid: neighborUsername, email, name: neighborUser.nickname || neighborUsername, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null, createdAt: Date.now() };
            all.push(neighbor);
            saveJSON('care_neighbors.json', all);
            res.end(JSON.stringify({ ok: true, neighbor }));
            return;
        }

        // POST /api/care/sos/notify-neighbors — 이웃에게 SOS 알림
        if (path === '/api/care/sos/notify-neighbors' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { location, senderName } = body;
            if (!location) { res.end(JSON.stringify({ count: 0 })); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ count: 0 })); return; }
            const allNeighbors = loadJSON('care_neighbors.json', []);
            const neighbors = allNeighbors.filter(n => n.groupId === group.id);
            const R = 6371;
            function haversineDist(lat1, lng1, lat2, lng2) {
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLng = (lng2 - lng1) * Math.PI / 180;
                const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            }
            let count = 0;
            const notifFile = pathModule.join(DATA_DIR, 'notifications.json');
            const allNotifs = fs.existsSync(notifFile) ? JSON.parse(fs.readFileSync(notifFile, 'utf8')) : [];
            for (const nb of neighbors) {
                if (nb.lat && nb.lng) {
                    const dist = haversineDist(location.lat, location.lng, nb.lat, nb.lng);
                    if (dist <= 1 && nb.uid) {
                        allNotifs.push({ id: crypto.randomBytes(8).toString('hex'), userId: nb.uid, type: 'care_sos_neighbor', message: 'sos Neighbor ' + senderName + ' sent an SOS! (' + dist.toFixed(1) + 'km)', read: false, priority: 'urgent', createdAt: Date.now() });
                        count++;
                    }
                }
            }
            if (allNotifs.length > 1000) allNotifs.splice(0, allNotifs.length - 1000);
            fs.writeFileSync(notifFile, JSON.stringify(allNotifs, null, 2));
            res.end(JSON.stringify({ count }));
            return;
        }

        // GET /api/care/photos — 사진 목록
        if (path === '/api/care/photos' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.end(JSON.stringify({ photos: [] })); return; }
            const all = loadJSON('care_photos.json', []);
            const photos = all.filter(p => p.groupId === group.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
            res.end(JSON.stringify({ photos }));
            return;
        }

        // POST /api/care/photos — 사진 업로드 (base64 URL)
        if (path === '/api/care/photos' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { url: photoUrl, caption } = body;
            if (!photoUrl) { res.statusCode = 400; res.end('{"error":"url required"}'); return; }
            const groups = loadJSON('care_groups.json', []);
            const group = groups.find(g => (g.memberUids || []).includes(user.username));
            if (!group) { res.statusCode = 404; res.end('{"error":"no group"}'); return; }
            const all = loadJSON('care_photos.json', []);
            const photo = { id: crypto.randomBytes(8).toString('hex'), groupId: group.id, url: photoUrl, caption: caption || '', uploaderId: user.username, createdAt: Date.now() };
            all.push(photo);
            saveJSON('care_photos.json', all);
            res.end(JSON.stringify({ ok: true, photo }));
            return;
        }

        // GET /api/care/user-nickname — 현재 사용자 닉네임
        if (path === '/api/care/user-nickname' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const nickname = user.nickname || user.displayName || user.username;
            res.end(JSON.stringify({ nickname }));
            return;
        }


        // ═══════════════════════════════════════════════════════════════
        // ═══ 마켓플레이스 REST API (Firestore 대체) ═══
        // ═══════════════════════════════════════════════════════════════

        const MARKET_DIR = pathModule.join(DATA_DIR, 'marketplace');
        if (!fs.existsSync(MARKET_DIR)) fs.mkdirSync(MARKET_DIR, { recursive: true });

        function loadMarket(file, def = []) {
            const p = pathModule.join(MARKET_DIR, file);
            try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {}
            return typeof def === 'function' ? def() : (Array.isArray(def) ? [...def] : { ...def });
        }
        function saveMarket(file, data) {
            fs.writeFileSync(pathModule.join(MARKET_DIR, file), JSON.stringify(data, null, 2));
        }
        function mktId() { return crypto.randomBytes(10).toString('hex'); }

        // ── PRODUCTS ──

        if (path === '/api/mall/products' && req.method === 'GET') {
            const products = loadMarket('products.json', []);
            const brand = url.searchParams.get('brand') || '';
            let items = products.filter(p => p.status === 'active');
            if (brand) items = items.filter(p => p.category === brand);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            items = items.slice(0, 50);
            res.end(JSON.stringify({ items }));
            return;
        }

        if (/^\/api\/mall\/products\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const products = loadMarket('products.json', []);
            const p = products.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ item: p }));
            return;
        }

        if (path === '/api/mall/products' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const products = loadMarket('products.json', []);
            const id = mktId();
            const item = {
                id, title: body.title || '', description: body.description || '',
                category: body.category || '', price: Number(body.price) || 0,
                priceToken: body.priceToken || 'CRGC', stock: Number(body.stock) || 0, sold: 0,
                imageData: body.imageData || '', images: body.images || [],
                sellerId: user.username, sellerEmail: user.username + '@crowny.org',
                sellerNickname: users[user.username]?.nickname || users[user.username]?.displayName || user.username,
                avgRating: 0, reviewCount: 0, status: 'active', createdAt: Date.now()
            };
            products.push(item);
            saveMarket('products.json', products);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/products\/[^/]+$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const products = loadMarket('products.json', []);
            const p = products.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (p.sellerId !== user.username) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            if (body.title !== undefined) p.title = body.title;
            if (body.description !== undefined) p.description = body.description;
            if (body.price !== undefined) p.price = Number(body.price);
            if (body.stock !== undefined) p.stock = Number(body.stock);
            if (body.status !== undefined) p.status = body.status;
            if (body.images) { p.images = body.images; p.imageData = body.images[0] || p.imageData; }
            saveMarket('products.json', products);
            res.end(JSON.stringify({ ok: true, item: p }));
            return;
        }

        if (/^\/api\/mall\/products\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            let products = loadMarket('products.json', []);
            const idx = products.findIndex(x => x.id === id && x.sellerId === user.username);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            products.splice(idx, 1);
            saveMarket('products.json', products);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── ORDERS ──

        if (path === '/api/mall/orders' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const role = url.searchParams.get('role') || 'buyer';
            const orders = loadMarket('orders.json', []);
            let items = role === 'seller' ? orders.filter(o => o.sellerId === user.username) : orders.filter(o => o.buyerId === user.username);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            items = items.slice(0, 50);
            res.end(JSON.stringify({ items }));
            return;
        }

        if (/^\/api\/mall\/orders\/[^/]+$/.test(path) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const orders = loadMarket('orders.json', []);
            const o = orders.find(x => x.id === id && (x.buyerId === user.username || x.sellerId === user.username));
            if (!o) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ item: o }));
            return;
        }

        if (path === '/api/mall/orders' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { productId, shippingInfo } = body;
            const products = loadMarket('products.json', []);
            const p = products.find(x => x.id === productId && x.status === 'active');
            if (!p) { res.statusCode = 400; res.end('{"error":"Product not found or inactive"}'); return; }
            const price = p.price;
            if (!price || price <= 0) { res.statusCode = 400; res.end('{"error":"Invalid price"}'); return; }
            if (price > 10000) { res.statusCode = 400; res.end('{"error":"Exceeds max order amount"}'); return; }
            if ((p.stock - (p.sold || 0)) <= 0) { res.statusCode = 400; res.end('{"error":"Sold out"}'); return; }
            const profile = users[user.username];
            if (!profile) { res.statusCode = 400; res.end('{"error":"User not found"}'); return; }
            if ((profile.offchainBalances?.crgc || 0) < price) { res.statusCode = 400; res.end('{"error":"Insufficient CRGC"}'); return; }
            if (!profile.offchainBalances) profile.offchainBalances = {};
            profile.offchainBalances.crgc = (profile.offchainBalances.crgc || 0) - price;
            const seller = users[p.sellerId];
            if (seller) { if (!seller.offchainBalances) seller.offchainBalances = {}; seller.offchainBalances.crgc = (seller.offchainBalances.crgc || 0) + price; }
            p.sold = (p.sold || 0) + 1;
            saveMarket('products.json', products);
            saveJSON('users.json', users);
            const orders = loadMarket('orders.json', []);
            const order = {
                id: mktId(), productId, productTitle: p.title, productImage: (p.images && p.images[0]) || p.imageData || '',
                buyerId: user.username, buyerEmail: user.username + '@crowny.org',
                sellerId: p.sellerId, sellerEmail: p.sellerEmail || '',
                amount: price, qty: 1, token: 'CRGC', status: 'paid',
                shippingInfo: shippingInfo || {},
                statusHistory: [{ status: 'paid', at: new Date().toISOString() }], createdAt: Date.now()
            };
            orders.push(order);
            saveMarket('orders.json', orders);
            res.end(JSON.stringify({ ok: true, order }));
            return;
        }

        if (/^\/api\/mall\/orders\/[^/]+\/status$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const orders = loadMarket('orders.json', []);
            const o = orders.find(x => x.id === id && x.sellerId === user.username);
            if (!o) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const { status, trackingNumber } = body;
            o.status = status; o[status + 'At'] = new Date().toISOString();
            if (trackingNumber) o.trackingNumber = trackingNumber;
            if (!o.statusHistory) o.statusHistory = [];
            o.statusHistory.push({ status, at: new Date().toISOString() });
            saveMarket('orders.json', orders);
            res.end(JSON.stringify({ ok: true, order: o }));
            return;
        }

        // ── REVIEWS ──

        if (path === '/api/mall/reviews' && req.method === 'GET') {
            const productId = url.searchParams.get('productId') || '';
            const buyerId = url.searchParams.get('buyerId') || '';
            const reviews = loadMarket('reviews.json', []);
            let items = reviews;
            if (productId) items = items.filter(r => r.productId === productId);
            if (buyerId) items = items.filter(r => r.buyerId === buyerId);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            items = items.slice(0, 30);
            res.end(JSON.stringify({ items }));
            return;
        }

        if (path === '/api/mall/reviews' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { productId, rating, comment, imageData } = body;
            const orders = loadMarket('orders.json', []);
            const hasDelivered = orders.some(o => o.buyerId === user.username && o.productId === productId && o.status === 'delivered');
            const reviews = loadMarket('reviews.json', []);
            if (reviews.find(r => r.productId === productId && r.buyerId === user.username)) { res.statusCode = 400; res.end('{"error":"Already reviewed"}'); return; }
            const review = { id: mktId(), productId, buyerId: user.username, buyerEmail: user.username + '@crowny.org', rating: Number(rating) || 5, comment: comment || '', imageData: imageData || '', verified: hasDelivered, helpful: 0, createdAt: Date.now() };
            reviews.push(review);
            saveMarket('reviews.json', reviews);
            const prodReviews = reviews.filter(r => r.productId === productId);
            const avgRating = Math.round((prodReviews.reduce((s, r) => s + r.rating, 0) / prodReviews.length) * 10) / 10;
            const products = loadMarket('products.json', []);
            const prod = products.find(x => x.id === productId);
            if (prod) { prod.avgRating = avgRating; prod.reviewCount = prodReviews.length; saveMarket('products.json', products); }
            res.end(JSON.stringify({ ok: true, review, avgRating, reviewCount: prodReviews.length, sellerId: prod?.sellerId }));
            return;
        }

        if (/^\/api\/mall\/reviews\/[^/]+\/helpful$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const reviews = loadMarket('reviews.json', []);
            const r = reviews.find(x => x.id === id);
            if (!r) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            r.helpful = (r.helpful || 0) + 1;
            saveMarket('reviews.json', reviews);
            res.end(JSON.stringify({ ok: true, helpful: r.helpful }));
            return;
        }

        // ── CART ──

        if (path === '/api/mall/cart' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const carts = loadMarket('carts.json', {});
            res.end(JSON.stringify({ items: carts[user.username] || [] }));
            return;
        }

        if (path === '/api/mall/cart' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { productId } = body;
            const products = loadMarket('products.json', []);
            const p = products.find(x => x.id === productId);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const carts = loadMarket('carts.json', {});
            if (!carts[user.username]) carts[user.username] = [];
            const existing = carts[user.username].find(c => c.productId === productId);
            if (existing) { existing.qty = (existing.qty || 1) + 1; }
            else { carts[user.username].push({ id: mktId(), productId, title: p.title, price: p.price, token: p.priceToken || 'CRGC', imageData: (p.images && p.images[0]) || p.imageData || '', qty: 1, addedAt: Date.now() }); }
            saveMarket('carts.json', carts);
            res.end(JSON.stringify({ ok: true, items: carts[user.username] }));
            return;
        }

        if (/^\/api\/mall\/cart\/[^/]+$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const cartId = path.split('/')[4];
            const carts = loadMarket('carts.json', {});
            if (!carts[user.username]) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const idx = carts[user.username].findIndex(c => c.id === cartId);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (Number(body.qty) <= 0) carts[user.username].splice(idx, 1);
            else carts[user.username][idx].qty = Number(body.qty);
            saveMarket('carts.json', carts);
            res.end(JSON.stringify({ ok: true, items: carts[user.username] }));
            return;
        }

        if (/^\/api\/mall\/cart\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const cartId = path.split('/')[4];
            const carts = loadMarket('carts.json', {});
            if (carts[user.username]) carts[user.username] = carts[user.username].filter(c => c.id !== cartId);
            saveMarket('carts.json', carts);
            res.end(JSON.stringify({ ok: true, items: carts[user.username] || [] }));
            return;
        }

        if (path === '/api/mall/checkout' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { shippingInfo } = body;
            const carts = loadMarket('carts.json', {});
            const cartItems = carts[user.username] || [];
            if (!cartItems.length) { res.statusCode = 400; res.end('{"error":"Cart is empty"}'); return; }
            let total = 0;
            cartItems.forEach(c => { total += c.price * (c.qty || 1); });
            if (total <= 0 || total > 10000) { res.statusCode = 400; res.end('{"error":"Invalid total"}'); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.crgc || 0) < total) { res.statusCode = 400; res.end('{"error":"Insufficient CRGC"}'); return; }
            profile.offchainBalances.crgc -= total;
            const products = loadMarket('products.json', []);
            const orders = loadMarket('orders.json', []);
            const newOrders = [];
            for (const item of cartItems) {
                const p = products.find(x => x.id === item.productId);
                if (!p) continue;
                const qty = item.qty || 1;
                const subtotal = item.price * qty;
                if ((p.stock - (p.sold || 0)) < qty) { res.statusCode = 400; res.end(JSON.stringify({ error: '"' + item.title + '" out of stock' })); return; }
                p.sold = (p.sold || 0) + qty;
                const seller = users[p.sellerId];
                if (seller) { if (!seller.offchainBalances) seller.offchainBalances = {}; seller.offchainBalances.crgc = (seller.offchainBalances.crgc || 0) + subtotal; }
                const order = { id: mktId(), productId: item.productId, productTitle: item.title, productImage: (p.images && p.images[0]) || p.imageData || '', buyerId: user.username, buyerEmail: user.username + '@crowny.org', sellerId: p.sellerId, sellerEmail: p.sellerEmail || '', amount: subtotal, qty, token: 'CRGC', status: 'paid', shippingInfo: shippingInfo || {}, statusHistory: [{ status: 'paid', at: new Date().toISOString() }], createdAt: Date.now() };
                orders.push(order); newOrders.push(order);
            }
            carts[user.username] = [];
            saveMarket('products.json', products); saveMarket('orders.json', orders); saveMarket('carts.json', carts); saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true, orders: newOrders }));
            return;
        }

        // ── WISHLIST ──

        if (path === '/api/mall/wishlist' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const wishlists = loadMarket('wishlists.json', {});
            res.end(JSON.stringify({ items: wishlists[user.username] || [] }));
            return;
        }

        if (path === '/api/mall/wishlist/toggle' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { productId } = body;
            const wishlists = loadMarket('wishlists.json', {});
            if (!wishlists[user.username]) wishlists[user.username] = [];
            const idx = wishlists[user.username].findIndex(w => w.productId === productId);
            let added = false;
            if (idx >= 0) { wishlists[user.username].splice(idx, 1); }
            else {
                const products = loadMarket('products.json', []);
                const p = products.find(x => x.id === productId);
                if (p) { wishlists[user.username].push({ id: mktId(), productId, title: p.title, price: p.price, token: p.priceToken || 'CRGC', imageData: (p.images && p.images[0]) || p.imageData || '', addedAt: Date.now() }); added = true; }
            }
            saveMarket('wishlists.json', wishlists);
            res.end(JSON.stringify({ ok: true, added, items: wishlists[user.username] }));
            return;
        }

        // ── ADDRESSES ──

        if (path === '/api/mall/addresses' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const addresses = loadMarket('addresses.json', {});
            const items = (addresses[user.username] || []).sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
            res.end(JSON.stringify({ items }));
            return;
        }

        if (path === '/api/mall/addresses' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const addresses = loadMarket('addresses.json', {});
            if (!addresses[user.username]) addresses[user.username] = [];
            addresses[user.username].push({ ...body, id: mktId(), usedAt: Date.now() });
            saveMarket('addresses.json', addresses);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── STORE SETTINGS ──

        if (/^\/api\/mall\/store\/[^/]+$/.test(path) && req.method === 'GET') {
            const sellerId = path.split('/')[4];
            const profile = users[sellerId];
            const seller = profile ? { storeName: profile.storeName || profile.nickname || profile.displayName || sellerId, storeDesc: profile.storeDesc || '', storeImage: profile.storeImage || profile.profileImage || '', email: sellerId + '@crowny.org' } : { storeName: sellerId, storeDesc: '', storeImage: '', email: sellerId + '@crowny.org' };
            res.end(JSON.stringify({ seller }));
            return;
        }

        if (path === '/api/mall/store' && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const profile = users[user.username];
            if (!profile) { res.statusCode = 400; res.end('{"error":"User not found"}'); return; }
            if (body.storeName !== undefined) profile.storeName = body.storeName;
            if (body.storeDesc !== undefined) profile.storeDesc = body.storeDesc;
            if (body.storeImage !== undefined) profile.storeImage = body.storeImage;
            saveJSON('users.json', users);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── RETURNS ──

        if (path === '/api/mall/returns' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const role = url.searchParams.get('role') || 'buyer';
            const returns = loadMarket('returns.json', []);
            let items = role === 'seller' ? returns.filter(r => r.sellerId === user.username) : returns.filter(r => r.buyerId === user.username);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ items }));
            return;
        }

        if (path === '/api/mall/returns' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { orderId, reasonCategory, reasonDetail } = body;
            const orders = loadMarket('orders.json', []);
            const order = orders.find(o => o.id === orderId && o.buyerId === user.username);
            if (!order) { res.statusCode = 404; res.end('{"error":"Order not found"}'); return; }
            const returns = loadMarket('returns.json', []);
            const ret = { id: mktId(), orderId, productId: order.productId, productTitle: order.productTitle, buyerId: user.username, buyerEmail: user.username + '@crowny.org', sellerId: order.sellerId, sellerEmail: order.sellerEmail, amount: order.amount, token: order.token || 'CRGC', reasonCategory, reasonDetail: reasonDetail || '', status: 'requested', createdAt: Date.now() };
            returns.push(ret);
            saveMarket('returns.json', returns);
            res.end(JSON.stringify({ ok: true, item: ret }));
            return;
        }

        if (/^\/api\/mall\/returns\/[^/]+$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const retId = path.split('/')[4];
            const returns = loadMarket('returns.json', []);
            const ret = returns.find(r => r.id === retId && r.sellerId === user.username);
            if (!ret) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const { action, rejectReason } = body;
            if (action === 'approve') {
                const tk = (ret.token || 'CRGC').toLowerCase();
                const buyerProfile = users[ret.buyerId];
                if (buyerProfile) { if (!buyerProfile.offchainBalances) buyerProfile.offchainBalances = {}; buyerProfile.offchainBalances[tk] = (buyerProfile.offchainBalances[tk] || 0) + ret.amount; }
                const sellerProfile = users[ret.sellerId];
                if (sellerProfile) { if (!sellerProfile.offchainBalances) sellerProfile.offchainBalances = {}; sellerProfile.offchainBalances[tk] = Math.max(0, (sellerProfile.offchainBalances[tk] || 0) - ret.amount); }
                saveJSON('users.json', users);
                ret.status = 'completed'; ret.completedAt = Date.now();
                const orders = loadMarket('orders.json', []);
                const order = orders.find(o => o.id === ret.orderId);
                if (order) { order.status = 'cancelled'; order.cancelledAt = new Date().toISOString(); if (!order.statusHistory) order.statusHistory = []; order.statusHistory.push({ status: 'cancelled', at: new Date().toISOString(), reason: 'return_refund' }); saveMarket('orders.json', orders); }
            } else { ret.status = 'rejected'; ret.rejectReason = rejectReason || ''; ret.rejectedAt = Date.now(); }
            saveMarket('returns.json', returns);
            res.end(JSON.stringify({ ok: true, item: ret }));
            return;
        }

        // ── REPORTS ──

        if (path === '/api/mall/reports' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const reports = loadMarket('reports.json', []);
            reports.push({ id: mktId(), targetType: body.targetType, targetId: body.targetId, reporterId: user.username, reporterEmail: user.username + '@crowny.org', reason: body.reason, detail: body.detail || '', status: 'pending', createdAt: Date.now() });
            saveMarket('reports.json', reports);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── CAMPAIGNS (Fundraise) ──

        if (path === '/api/mall/campaigns' && req.method === 'GET') {
            const campaigns = loadMarket('campaigns.json', []);
            res.end(JSON.stringify({ items: campaigns.filter(c => c.status === 'active').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20) }));
            return;
        }

        if (/^\/api\/mall\/campaigns\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const campaigns = loadMarket('campaigns.json', []);
            const c = campaigns.find(x => x.id === id);
            if (!c) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const txns = loadMarket('transactions.json', []);
            const donors = txns.filter(t => t.campaignId === id && t.type === 'donation').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
            res.end(JSON.stringify({ item: c, donors }));
            return;
        }

        if (path === '/api/mall/campaigns' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const campaigns = loadMarket('campaigns.json', []);
            const item = { id: mktId(), title: body.title || '', description: body.description || '', category: body.category || '', goal: Number(body.goal) || 0, raised: 0, token: 'CRGC', backers: 0, backerCount: 0, imageData: body.imageData || '', platformFee: Number(body.platformFee) || 2.5, creatorId: user.username, creatorEmail: user.username + '@crowny.org', creatorNickname: users[user.username]?.nickname || users[user.username]?.displayName || user.username, endDate: Date.now() + (Number(body.days) || 30) * 86400000, status: 'active', createdAt: Date.now() };
            campaigns.push(item);
            saveMarket('campaigns.json', campaigns);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/campaigns\/[^/]+\/donate$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const campId = path.split('/')[4];
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            const campaigns = loadMarket('campaigns.json', []);
            const camp = campaigns.find(c => c.id === campId && c.status === 'active');
            if (!camp) { res.statusCode = 404; res.end('{"error":"Campaign not found"}'); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.crgc || 0) < amount) { res.statusCode = 400; res.end('{"error":"Insufficient CRGC"}'); return; }
            const platformFee = amount * ((camp.platformFee || 2.5) / 100);
            const creatorReceive = amount - platformFee;
            profile.offchainBalances.crgc -= amount;
            const creator = users[camp.creatorId];
            if (creator) { if (!creator.offchainBalances) creator.offchainBalances = {}; creator.offchainBalances.crgc = (creator.offchainBalances.crgc || 0) + creatorReceive; }
            saveJSON('users.json', users);
            camp.raised = (camp.raised || 0) + amount; camp.backers = (camp.backers || 0) + 1; camp.backerCount = (camp.backerCount || 0) + 1;
            saveMarket('campaigns.json', campaigns);
            const txns = loadMarket('transactions.json', []);
            txns.push({ id: mktId(), from: user.username, to: camp.creatorId, amount, token: 'CRGC', type: 'donation', campaignId: campId, platformFee, creatorReceive, timestamp: Date.now() });
            saveMarket('transactions.json', txns);
            const fees = loadMarket('platform_fees.json', []);
            fees.push({ id: mktId(), campaignId: campId, amount: platformFee, token: 'CRGC', fromUser: user.username, timestamp: Date.now() });
            saveMarket('platform_fees.json', fees);
            res.end(JSON.stringify({ ok: true, raised: camp.raised }));
            return;
        }

        if (/^\/api\/mall\/campaigns\/[^/]+\/close$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const campId = path.split('/')[4];
            const campaigns = loadMarket('campaigns.json', []);
            const camp = campaigns.find(c => c.id === campId);
            if (!camp) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (camp.creatorId !== user.username) { res.statusCode = 403; res.end('{"error":"Only creator can close"}'); return; }
            const fee = camp.platformFee || 2.5;
            const feeAmount = camp.raised * (fee / 100);
            if (feeAmount > 0) { const fees = loadMarket('platform_fees.json', []); fees.push({ id: mktId(), campaignId: campId, amount: feeAmount, token: 'CRGC', type: 'campaign_close', timestamp: Date.now() }); saveMarket('platform_fees.json', fees); }
            camp.status = 'closed'; camp.closedAt = Date.now();
            saveMarket('campaigns.json', campaigns);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── ENERGY / CREB LABS ──

        if (path === '/api/mall/energy/projects' && req.method === 'GET') {
            const projects = loadMarket('energy_projects.json', []);
            res.end(JSON.stringify({ items: projects.filter(p => p.status === 'active').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20) }));
            return;
        }

        if (/^\/api\/mall\/energy\/projects\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[5];
            const projects = loadMarket('energy_projects.json', []);
            const p = projects.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const comments = loadMarket('energy_comments.json', []).filter(c => c.projectId === id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
            const investments = loadMarket('energy_investments.json', []).filter(i => i.projectId === id).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10);
            res.end(JSON.stringify({ item: p, comments, investments }));
            return;
        }

        if (path === '/api/mall/energy/projects' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const projects = loadMarket('energy_projects.json', []);
            const item = { id: mktId(), title: body.title || '', location: body.location || '', description: body.description || '', capacity: Number(body.capacity) || 0, returnRate: Number(body.returnRate) || 0, goal: Number(body.goal) || 0, category: body.category || 'energy', investType: body.investType || 'return', invested: 0, investors: 0, status: 'active', milestones: body.milestones || [], teamMembers: body.teamMembers || [], creatorId: user.username, createdAt: Date.now() };
            projects.push(item);
            saveMarket('energy_projects.json', projects);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/energy\/projects\/[^/]+\/comment$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const projectId = path.split('/')[5];
            const comments = loadMarket('energy_comments.json', []);
            comments.push({ id: mktId(), projectId, userId: user.username, nickname: users[user.username]?.nickname || users[user.username]?.displayName || user.username, text: body.text || '', createdAt: Date.now() });
            saveMarket('energy_comments.json', comments);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (/^\/api\/mall\/energy\/projects\/[^/]+\/invest$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const projectId = path.split('/')[5];
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.creb || 0) < amount) { res.statusCode = 400; res.end('{"error":"Insufficient CREB"}'); return; }
            profile.offchainBalances.creb -= amount;
            saveJSON('users.json', users);
            const projects = loadMarket('energy_projects.json', []);
            const p = projects.find(x => x.id === projectId);
            if (p) { p.invested = (p.invested || 0) + amount; p.investors = (p.investors || 0) + 1; saveMarket('energy_projects.json', projects); }
            const investments = loadMarket('energy_investments.json', []);
            investments.push({ id: mktId(), projectId, userId: user.username, amount, token: 'CREB', timestamp: Date.now() });
            saveMarket('energy_investments.json', investments);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (path === '/api/mall/energy/investments' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const investments = loadMarket('energy_investments.json', []).filter(i => i.userId === user.username).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const projects = loadMarket('energy_projects.json', []);
            const projMap = {}; projects.forEach(p => { projMap[p.id] = p; });
            const items = investments.map(i => ({ ...i, project: projMap[i.projectId] || { title: 'Deleted', returnRate: 0, category: 'energy' } }));
            res.end(JSON.stringify({ items }));
            return;
        }

        if (/^\/api\/mall\/energy\/distribute\/[^/]+$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const projectId = path.split('/')[5];
            const projects = loadMarket('energy_projects.json', []);
            const proj = projects.find(x => x.id === projectId);
            if (!proj) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (proj.creatorId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            const rate = proj.returnRate || 0;
            const investments = loadMarket('energy_investments.json', []).filter(i => i.projectId === projectId);
            let distributed = 0;
            const txns = loadMarket('transactions.json', []);
            for (const inv of investments) { const share = inv.amount * rate / 100 / 12; if (share <= 0) continue; const u = users[inv.userId]; if (u) { if (!u.offchainBalances) u.offchainBalances = {}; u.offchainBalances.creb = (u.offchainBalances.creb || 0) + share; txns.push({ id: mktId(), from: 'energy_system', to: inv.userId, amount: share, token: 'CREB', type: 'energy_return', projectId, timestamp: Date.now() }); distributed += share; } }
            saveJSON('users.json', users); saveMarket('transactions.json', txns);
            res.end(JSON.stringify({ ok: true, distributed, investorCount: investments.length }));
            return;
        }

        // ── BUSINESS ──

        if (path === '/api/mall/businesses' && req.method === 'GET') {
            res.end(JSON.stringify({ items: loadMarket('businesses.json', []).filter(b => b.status === 'active').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20) }));
            return;
        }

        if (/^\/api\/mall\/businesses\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const businesses = loadMarket('businesses.json', []);
            const b = businesses.find(x => x.id === id);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const bizInvs = loadMarket('business_investments.json', []).filter(i => i.businessId === id);
            let totalInvested = 0; bizInvs.forEach(i => { totalInvested += i.amount || 0; });
            res.end(JSON.stringify({ item: b, totalInvested, investorCount: bizInvs.length }));
            return;
        }

        if (path === '/api/mall/businesses' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const businesses = loadMarket('businesses.json', []);
            const item = { id: mktId(), name: body.name || '', description: body.description || '', category: body.category || '', country: body.country || '', website: body.website || '', imageData: body.imageData || '', ownerId: user.username, ownerEmail: user.username + '@crowny.org', ownerNickname: users[user.username]?.nickname || users[user.username]?.displayName || user.username, rating: 0, reviews: 0, status: 'active', createdAt: Date.now() };
            businesses.push(item);
            saveMarket('businesses.json', businesses);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/businesses\/[^/]+\/invest$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const bizId = path.split('/')[4];
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.crgc || 0) < amount) { res.statusCode = 400; res.end('{"error":"Insufficient CRGC"}'); return; }
            const businesses = loadMarket('businesses.json', []);
            const biz = businesses.find(b => b.id === bizId);
            if (!biz) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            profile.offchainBalances.crgc -= amount;
            const owner = users[biz.ownerId];
            if (owner) { if (!owner.offchainBalances) owner.offchainBalances = {}; owner.offchainBalances.crgc = (owner.offchainBalances.crgc || 0) + amount; }
            saveJSON('users.json', users);
            const bizInvs = loadMarket('business_investments.json', []);
            bizInvs.push({ id: mktId(), businessId: bizId, businessName: biz.name, investorId: user.username, investorEmail: user.username + '@crowny.org', amount, token: 'CRGC', timestamp: Date.now() });
            saveMarket('business_investments.json', bizInvs);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (/^\/api\/mall\/businesses\/[^/]+\/rate$/.test(path) && req.method === 'PUT') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const bizId = path.split('/')[4];
            const rating = Number(body.rating);
            if (!rating || rating < 1 || rating > 5) { res.statusCode = 400; res.end('{"error":"Invalid rating"}'); return; }
            const businesses = loadMarket('businesses.json', []);
            const biz = businesses.find(b => b.id === bizId);
            if (!biz) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            biz.rating = (biz.rating || 0) + rating; biz.reviews = (biz.reviews || 0) + 1;
            saveMarket('businesses.json', businesses);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── ARTISTS ──

        if (path === '/api/mall/artists' && req.method === 'GET') {
            res.end(JSON.stringify({ items: loadMarket('artists.json', []).filter(a => a.status === 'active').sort((a, b) => (b.fans || 0) - (a.fans || 0)).slice(0, 20) }));
            return;
        }

        if (/^\/api\/mall\/artists\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const artists = loadMarket('artists.json', []);
            const a = artists.find(x => x.id === id);
            if (!a) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const txns = loadMarket('transactions.json', []);
            const supports = txns.filter(t => t.artistId === id && t.type === 'artist_support').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10);
            const uniqueFans = new Set(txns.filter(t => t.artistId === id && t.type === 'artist_support').map(t => t.from));
            res.end(JSON.stringify({ item: a, supports, uniqueFanCount: uniqueFans.size }));
            return;
        }

        if (path === '/api/mall/artists' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const artists = loadMarket('artists.json', []);
            const item = { id: mktId(), name: body.name || '', bio: body.bio || '', genre: body.genre || '', imageData: body.imageData || '', userId: user.username, email: user.username + '@crowny.org', fans: 0, totalSupport: 0, status: 'active', createdAt: Date.now() };
            artists.push(item);
            saveMarket('artists.json', artists);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/artists\/[^/]+\/support$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const artistId = path.split('/')[4];
            const amount = Number(body.amount);
            if (!amount || amount <= 0) { res.statusCode = 400; res.end('{"error":"Invalid amount"}'); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.crac || 0) < amount) { res.statusCode = 400; res.end('{"error":"Insufficient CRAC"}'); return; }
            const artists = loadMarket('artists.json', []);
            const artist = artists.find(a => a.id === artistId);
            if (!artist) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            profile.offchainBalances.crac -= amount;
            const artistUser = users[artist.userId];
            if (artistUser) { if (!artistUser.offchainBalances) artistUser.offchainBalances = {}; artistUser.offchainBalances.crac = (artistUser.offchainBalances.crac || 0) + amount; }
            saveJSON('users.json', users);
            const txns = loadMarket('transactions.json', []);
            const isNewFan = !txns.some(t => t.from === user.username && t.artistId === artistId && t.type === 'artist_support');
            artist.totalSupport = (artist.totalSupport || 0) + amount;
            if (isNewFan) artist.fans = (artist.fans || 0) + 1;
            saveMarket('artists.json', artists);
            txns.push({ id: mktId(), from: user.username, to: artist.userId, amount, token: 'CRAC', type: 'artist_support', artistId, timestamp: Date.now() });
            saveMarket('transactions.json', txns);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── BOOKS ──

        if (path === '/api/mall/books' && req.method === 'GET') {
            res.end(JSON.stringify({ items: loadMarket('books.json', []).filter(b => b.status === 'active').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20) }));
            return;
        }

        if (/^\/api\/mall\/books\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const books = loadMarket('books.json', []);
            const b = books.find(x => x.id === id);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ item: b }));
            return;
        }

        if (path === '/api/mall/books' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const books = loadMarket('books.json', []);
            const item = { id: mktId(), title: body.title || '', author: body.author || '', description: body.description || '', genre: body.genre || '', price: Number(body.price) || 0, priceToken: 'CRGC', imageData: body.imageData || '', publisherId: user.username, publisherEmail: user.username + '@crowny.org', sold: 0, rating: 0, reviews: 0, status: 'active', createdAt: Date.now() };
            books.push(item);
            saveMarket('books.json', books);
            res.end(JSON.stringify({ ok: true, item }));
            return;
        }

        if (/^\/api\/mall\/books\/[^/]+\/buy$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const bookId = path.split('/')[4];
            const books = loadMarket('books.json', []);
            const b = books.find(x => x.id === bookId);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (b.publisherId === user.username) { res.statusCode = 400; res.end('{"error":"Cannot buy your own book"}'); return; }
            if (b.price <= 0) { res.end(JSON.stringify({ ok: true, free: true })); return; }
            const profile = users[user.username];
            if (!profile || (profile.offchainBalances?.crgc || 0) < b.price) { res.statusCode = 400; res.end('{"error":"Insufficient CRGC"}'); return; }
            profile.offchainBalances.crgc -= b.price;
            const publisher = users[b.publisherId];
            if (publisher) { if (!publisher.offchainBalances) publisher.offchainBalances = {}; publisher.offchainBalances.crgc = (publisher.offchainBalances.crgc || 0) + b.price; }
            saveJSON('users.json', users);
            b.sold = (b.sold || 0) + 1;
            saveMarket('books.json', books);
            const txns = loadMarket('transactions.json', []);
            txns.push({ id: mktId(), from: user.username, to: b.publisherId, amount: b.price, token: 'CRGC', type: 'book_purchase', bookId, timestamp: Date.now() });
            saveMarket('transactions.json', txns);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ── READING LIST ──

        if (path === '/api/mall/reading-list' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const lists = loadMarket('reading_lists.json', {});
            res.end(JSON.stringify({ items: (lists[user.username] || []).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)) }));
            return;
        }

        if (path === '/api/mall/reading-list' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { bookId } = body;
            const lists = loadMarket('reading_lists.json', {});
            if (!lists[user.username]) lists[user.username] = [];
            if (lists[user.username].some(r => r.bookId === bookId)) { res.statusCode = 400; res.end('{"error":"Already in list"}'); return; }
            const books = loadMarket('books.json', []);
            const book = books.find(b => b.id === bookId);
            if (!book) { res.statusCode = 404; res.end('{"error":"Book not found"}'); return; }
            lists[user.username].push({ id: mktId(), bookId, bookTitle: book.title, bookAuthor: book.author || '', addedAt: Date.now() });
            saveMarket('reading_lists.json', lists);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (/^\/api\/mall\/reading-list\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const itemId = path.split('/')[4];
            const lists = loadMarket('reading_lists.json', {});
            if (lists[user.username]) lists[user.username] = lists[user.username].filter(r => r.id !== itemId);
            saveMarket('reading_lists.json', lists);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // ═══ END 마켓플레이스 REST API ═══

        // ═══ Seed Data API ═══
        if (/^\/api\/seed\/[^/]+$/.test(path) && req.method === 'POST') {
            const user = getAuth(req); if (!user) { res.statusCode=401; res.end('{"error":"auth"}'); return; }
            const col = path.split('/')[3];
            if (!['artists','businesses','campaigns','bot_profiles','admin_config'].includes(col)) { res.statusCode=400; res.end('{"error":"invalid"}'); return; }
            const f = `seed_${col}.json`, ex = loadJSON(f,{}); const items = body.items||{}; let cnt=0;
            for (const [id,d] of Object.entries(items)) { if (!ex[id]) { ex[id]={...d,createdAt:Date.now()}; cnt++; } }
            saveJSON(f, ex); res.end(JSON.stringify({ok:true,created:cnt})); return;
        }
        if (/^\/api\/seed\/[^/]+$/.test(path) && req.method === 'GET') {
            res.end(JSON.stringify({ok:true,data:loadJSON(`seed_${path.split('/')[3]}.json`,{})})); return;
        }

        // ═══ Shortform API ═══
        if (path==='/api/shortform/upload' && req.method==='POST') {
            const user=getAuth(req); if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const videos=loadJSON('shortform_videos.json',[]);
            const sfId=`sf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            let videoUrl=body.videoUrl||'';
            if(body.videoBase64){const d=pathModule.join(DATA_DIR,'uploads',user.username);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});const n=`${Date.now()}.mp4`;const m=body.videoBase64.match(/^data:[^;]+;base64,(.+)$/);fs.writeFileSync(pathModule.join(d,n),Buffer.from(m?m[1]:body.videoBase64,'base64'));videoUrl=`/uploads/${user.username}/${n}`;}
            let thumbnailUrl=body.thumbnailUrl||'';
            if(body.thumbnailBase64){const d=pathModule.join(DATA_DIR,'uploads',user.username);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});const n=`${Date.now()}_thumb.jpg`;const m=body.thumbnailBase64.match(/^data:[^;]+;base64,(.+)$/);fs.writeFileSync(pathModule.join(d,n),Buffer.from(m?m[1]:body.thumbnailBase64,'base64'));thumbnailUrl=`/uploads/${user.username}/${n}`;}
            videos.push({id:sfId,authorUid:user.username,videoUrl,thumbnailUrl,caption:body.caption||'',hashtags:body.hashtags||[],serviceLink:body.serviceLink||null,likes:0,likedBy:[],views:0,commentCount:0,createdAt:Date.now(),trimStart:body.trimStart||null,trimEnd:body.trimEnd||null,filter:body.filter||null,textOverlay:body.textOverlay||null,textPosition:body.textPosition||'bottom',textColor:body.textColor||'#FFF8F0',textSize:body.textSize||24});
            saveJSON('shortform_videos.json',videos); res.end(JSON.stringify({ok:true,id:sfId})); return;
        }
        if(path==='/api/shortform/videos'&&req.method==='GET'){
            const videos=loadJSON('shortform_videos.json',[]);const pg=parseInt(url.searchParams.get('page')||'0');const lim=Math.min(parseInt(url.searchParams.get('limit')||'10'),50);
            const sorted=videos.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));const paged=sorted.slice(pg*lim,(pg+1)*lim);const ud=loadJSON('users.json',{});
            res.end(JSON.stringify({ok:true,videos:paged.map(v=>{const u=ud[v.authorUid]||{};return{...v,authorName:u.nickname||u.displayName||v.authorUid,authorPhoto:u.photoURL||''};}),total:videos.length}));return;
        }
        if(/^\/api\/shortform\/video\/[^/]+$/.test(path)&&req.method==='GET'){
            const vid=path.split('/')[4];const videos=loadJSON('shortform_videos.json',[]);const video=videos.find(v=>v.id===vid);
            if(!video){res.statusCode=404;res.end('{"error":"not found"}');return;}
            const ud=loadJSON('users.json',{});const u=ud[video.authorUid]||{};
            res.end(JSON.stringify({ok:true,video:{...video,authorName:u.nickname||u.displayName||video.authorUid,authorPhoto:u.photoURL||''}}));return;
        }
        if(/^\/api\/shortform\/video\/[^/]+\/like$/.test(path)&&req.method==='POST'){
            const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const vid=path.split('/')[4];const videos=loadJSON('shortform_videos.json',[]);const video=videos.find(v=>v.id===vid);
            if(!video){res.statusCode=404;res.end('{"error":"not found"}');return;}
            if(!video.likedBy)video.likedBy=[];const li=video.likedBy.indexOf(user.username);
            if(li>=0){video.likedBy.splice(li,1);video.likes=Math.max(0,(video.likes||1)-1);}else{video.likedBy.push(user.username);video.likes=(video.likes||0)+1;}
            saveJSON('shortform_videos.json',videos);res.end(JSON.stringify({ok:true,likes:video.likes,liked:li<0}));return;
        }
        if(/^\/api\/shortform\/video\/[^/]+\/view$/.test(path)&&req.method==='POST'){
            const vid=path.split('/')[4];const videos=loadJSON('shortform_videos.json',[]);const v=videos.find(x=>x.id===vid);
            if(v){v.views=(v.views||0)+1;saveJSON('shortform_videos.json',videos);}res.end('{"ok":true}');return;
        }
        if(/^\/api\/shortform\/video\/[^/]+\/comments$/.test(path)&&req.method==='GET'){
            res.end(JSON.stringify({ok:true,comments:loadJSON(`shortform_comments_${path.split('/')[4]}.json`,[])}));return;
        }
        if(/^\/api\/shortform\/video\/[^/]+\/comments$/.test(path)&&req.method==='POST'){
            const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const videoId=path.split('/')[4];const comments=loadJSON(`shortform_comments_${videoId}.json`,[]);const ud=loadJSON('users.json',{});const u=ud[user.username]||{};
            const comment={id:`sc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,uid:user.username,nickname:u.nickname||u.displayName||user.username,photoURL:u.photoURL||'',text:body.text||'',createdAt:Date.now()};
            comments.push(comment);saveJSON(`shortform_comments_${videoId}.json`,comments);
            const videos=loadJSON('shortform_videos.json',[]);const v=videos.find(x=>x.id===videoId);if(v){v.commentCount=(v.commentCount||0)+1;saveJSON('shortform_videos.json',videos);}
            res.end(JSON.stringify({ok:true,comment}));return;
        }
        if(/^\/api\/shortform\/services\/[^/]+$/.test(path)&&req.method==='GET'){
            const st=path.split('/')[4];const cm={artist:'seed_artists.json',campaign:'seed_campaigns.json',business:'seed_businesses.json',art:'seed_artists.json',book:'seed_artists.json',product:'seed_businesses.json'};
            const nm={artist:'name',campaign:'title',business:'name',art:'name',book:'title',product:'name'};const sd=loadJSON(cm[st]||'seed_artists.json',{});const q=(url.searchParams.get('q')||'').toLowerCase();
            res.end(JSON.stringify({ok:true,items:Object.entries(sd).map(([id,d])=>({id,name:d[nm[st]]||d.title||d.name||id})).filter(i=>!q||i.name.toLowerCase().includes(q)).slice(0,10)}));return;
        }

        // ═══ Invite API ═══
        if(path==='/api/invite/settings'&&req.method==='GET'){const ac=loadJSON('seed_admin_config.json',{});res.end(JSON.stringify({ok:true,inviteSettings:ac.invite_settings||{},rewardSettings:ac.reward_settings||null}));return;}
        if(path==='/api/invite/user-code'&&req.method==='GET'){
            const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const ud=loadJSON('users.json',{});const u=ud[user.username]||{};
            if(u.referralCode){res.end(JSON.stringify({ok:true,code:u.referralCode}));return;}
            let code,ce=true;while(ce){code='CR-'+Math.random().toString(36).slice(2,8).toUpperCase();ce=Object.values(ud).some(x=>x.referralCode===code);}
            if(!ud[user.username])ud[user.username]={};ud[user.username].referralCode=code;ud[user.username].referralNickname=u.nickname||'';ud[user.username].referralCount=u.referralCount||0;ud[user.username].referralEarnings=u.referralEarnings||{};
            saveJSON('users.json',ud);res.end(JSON.stringify({ok:true,code}));return;
        }
        if(path==='/api/invite/stats'&&req.method==='GET'){
            const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const inv=loadJSON('invitations.json',[]);const comp=inv.filter(i=>i.inviterUid===user.username&&i.status==='completed');
            const rc=loadJSON('seed_admin_config.json',{}).reward_settings||{};const ia=rc.inviteAmount||0.5;
            res.end(JSON.stringify({ok:true,completedCount:comp.length,earnedCRTD:comp.filter(i=>i.rewardPaid).length*ia}));return;
        }
        if(path==='/api/invite/lookup'&&req.method==='GET'){
            const lc=(url.searchParams.get('code')||'').toUpperCase();if(!lc){res.end(JSON.stringify({ok:true,inviterName:''}));return;}
            const ud=loadJSON('users.json',{});const e=Object.entries(ud).find(([_,u])=>u.referralCode===lc);
            res.end(JSON.stringify({ok:true,inviterName:e?(e[1].referralNickname||e[1].nickname||''):''}));return;
        }
        if(path==='/api/invite/process-signup'&&req.method==='POST'){
            const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}
            const rc=(body.referralCode||'').toUpperCase();if(!rc){res.end('{"ok":true,"skipped":true}');return;}
            const ud=loadJSON('users.json',{});const ie=Object.entries(ud).find(([_,u])=>u.referralCode===rc);
            if(!ie){res.end('{"ok":true,"skipped":true}');return;}const inviterUid=ie[0];if(inviterUid===user.username){res.end('{"ok":true,"skipped":true}');return;}
            const inv=loadJSON('invitations.json',[]);inv.push({inviterUid,inviteeUid:user.username,inviteeEmail:user.username+'@crowny.org',status:'completed',rewardPaid:false,createdAt:Date.now()});saveJSON('invitations.json',inv);
            const ac=loadJSON('seed_admin_config.json',{});const rw=ac.reward_settings||{inviteEnabled:true,inviteAmount:0.5,inviteMaxPerUser:100,signupEnabled:true,signupTiers:[{maxUsers:1000,amount:100},{maxUsers:10000,amount:30},{maxUsers:100000,amount:10}]};
            if(rw.inviteEnabled){const amt=rw.inviteAmount||0.5,mx=rw.inviteMaxPerUser||100;const pc=inv.filter(i=>i.inviterUid===inviterUid&&i.rewardPaid).length;
            if(pc*amt<mx){if(!ud[inviterUid])ud[inviterUid]={};const off=ud[inviterUid].offchainBalances||{};off.crtd=(off.crtd||0)+amt;ud[inviterUid].offchainBalances=off;const iv=inv.find(i=>i.inviterUid===inviterUid&&i.inviteeUid===user.username&&!i.rewardPaid);if(iv)iv.rewardPaid=true;saveJSON('invitations.json',inv);}}
            if(rw.signupEnabled){const stats=ac.stats||{totalUsers:0};let sa=0;for(const tier of(rw.signupTiers||[])){if(stats.totalUsers<=tier.maxUsers){sa=tier.amount;break;}}
            if(sa>0){if(!ud[user.username])ud[user.username]={};const off=ud[user.username].offchainBalances||{};off.crtd=(off.crtd||0)+sa;ud[user.username].offchainBalances=off;}stats.totalUsers=(stats.totalUsers||0)+1;ac.stats=stats;saveJSON('seed_admin_config.json',ac);}
            const logs=loadJSON('reward_logs.json',[]);logs.push({uid:inviterUid,type:'invite',amount:rw.inviteAmount||0.5,inviteeUid:user.username,createdAt:Date.now()});logs.push({uid:user.username,type:'signup',createdAt:Date.now()});saveJSON('reward_logs.json',logs);saveJSON('users.json',ud);
            res.end('{"ok":true}');return;
        }

        // ═══ E2E Crypto API ═══
        if(/^\/api\/crypto\/public-keys\/[^/]+$/.test(path)&&req.method==='GET'){const tuid=decodeURIComponent(path.split('/')[4]);const ud=loadJSON('users.json',{});const u=ud[tuid]||{};res.end(JSON.stringify({ok:true,publicKey:u.publicKey||null,publicSignKey:u.publicSignKey||null}));return;}
        if(path==='/api/crypto/public-keys'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const ud=loadJSON('users.json',{});if(!ud[user.username])ud[user.username]={};ud[user.username].publicKey=body.publicKey;ud[user.username].publicSignKey=body.publicSignKey;saveJSON('users.json',ud);res.end('{"ok":true}');return;}
        if(path==='/api/crypto/chats'&&req.method==='GET'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const chats=loadJSON('chats.json',[]);res.end(JSON.stringify({ok:true,chats:chats.filter(c=>c.participants&&c.participants.includes(user.username))}));return;}
        if(/^\/api\/crypto\/chat\/[^/]+$/.test(path)&&req.method==='GET'){const cid=path.split('/')[4];const chats=loadJSON('chats.json',[]);const c=chats.find(x=>x.id===cid);if(!c){res.statusCode=404;res.end('{"error":"not found"}');return;}res.end(JSON.stringify({ok:true,chat:c}));return;}
        if(path==='/api/crypto/chat'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const chats=loadJSON('chats.json',[]);if(body.secret){const ex=chats.find(c=>c.secret&&c.participants&&c.participants.includes(user.username)&&c.participants.includes(body.otherUid));if(ex){res.end(JSON.stringify({ok:true,chatId:ex.id}));return;}}const cid=`chat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;chats.push({id:cid,participants:[user.username,body.otherUid],lastMessage:body.secret?'🔒 Secret chat started':'',lastMessageTime:Date.now(),createdAt:Date.now(),unreadCount:{},typing:{},secret:body.secret||false,e2eEnabled:body.secret||false,autoDeleteAfter:body.secret?86400000:0,noForward:body.secret||false});saveJSON('chats.json',chats);res.end(JSON.stringify({ok:true,chatId:cid}));return;}
        if(/^\/api\/crypto\/chat\/[^/]+$/.test(path)&&req.method==='PATCH'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const cid=path.split('/')[4];const chats=loadJSON('chats.json',[]);const c=chats.find(x=>x.id===cid);if(!c){res.statusCode=404;res.end('{"error":"not found"}');return;}if(body.field!==undefined&&body.value!==undefined)c[body.field]=body.value;else Object.assign(c,body);saveJSON('chats.json',chats);res.end('{"ok":true}');return;}
        if(/^\/api\/crypto\/chat\/[^/]+\/message$/.test(path)&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const cid=path.split('/')[4];const msgs=loadJSON(`chat_msgs_${cid}.json`,[]);const msg={id:`msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,...body,timestamp:Date.now()};msgs.push(msg);saveJSON(`chat_msgs_${cid}.json`,msgs);const chats=loadJSON('chats.json',[]);const c=chats.find(x=>x.id===cid);if(c){c.lastMessage=body.text||'🔒';c.lastMessageTime=Date.now();saveJSON('chats.json',chats);}res.end(JSON.stringify({ok:true,message:msg}));return;}
        if(/^\/api\/crypto\/chat\/[^/]+\/expired$/.test(path)&&req.method==='DELETE'){const cid=path.split('/')[4];const msgs=loadJSON(`chat_msgs_${cid}.json`,[]);const now=Date.now();const b=msgs.length;const f=msgs.filter(m=>!m.expiresAt||m.expiresAt>now);saveJSON(`chat_msgs_${cid}.json`,f);res.end(JSON.stringify({ok:true,cleaned:b-f.length}));return;}
        if(path==='/api/crypto/contacts'&&req.method==='GET'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}res.end(JSON.stringify({ok:true,contacts:loadJSON(`contacts_${user.username}.json`,[])}));return;}

        // ═══ Stories API ═══
        if(path==='/api/stories'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const stories=loadJSON('stories.json',[]);const sid=`story_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;let mediaUrl=body.mediaUrl||'';if(body.mediaBase64){const d=pathModule.join(DATA_DIR,'uploads',user.username);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});const ext=body.mediaType==='video'?'mp4':'jpg';const fn=`story_${Date.now()}.${ext}`;const m=body.mediaBase64.match(/^data:[^;]+;base64,(.+)$/);fs.writeFileSync(pathModule.join(d,fn),Buffer.from(m?m[1]:body.mediaBase64,'base64'));mediaUrl=`/uploads/${user.username}/${fn}`;}stories.push({id:sid,userId:user.username,mediaUrl,mediaType:body.mediaType||'image',text:body.text||'',viewers:[],expiresAt:Date.now()+86400000,createdAt:Date.now()});saveJSON('stories.json',stories);res.end(JSON.stringify({ok:true,id:sid}));return;}
        if(path==='/api/stories'&&req.method==='GET'){const stories=loadJSON('stories.json',[]);res.end(JSON.stringify({ok:true,stories:stories.filter(s=>s.expiresAt>Date.now())}));return;}
        if(/^\/api\/stories\/[^/]+\/view$/.test(path)&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const sid=path.split('/')[3];const stories=loadJSON('stories.json',[]);const s=stories.find(x=>x.id===sid);if(s&&!s.viewers.includes(user.username)){s.viewers.push(user.username);saveJSON('stories.json',stories);}res.end('{"ok":true}');return;}
        if(/^\/api\/stories\/[^/]+$/.test(path)&&req.method==='GET'){const sid=path.split('/')[3];const stories=loadJSON('stories.json',[]);const s=stories.find(x=>x.id===sid);if(!s){res.statusCode=404;res.end('{"error":"not found"}');return;}res.end(JSON.stringify({ok:true,story:s}));return;}
        if(path==='/api/stories/expired'&&req.method==='DELETE'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const stories=loadJSON('stories.json',[]);const now=Date.now();const f=stories.filter(s=>s.expiresAt>now||s.userId!==user.username);saveJSON('stories.json',f);res.end(JSON.stringify({ok:true,cleaned:stories.length-f.length}));return;}
        if(path==='/api/stories/reply-chat'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const ou=body.userId;const chats=loadJSON('chats.json',[]);let ch=chats.find(c=>c.participants&&c.participants.includes(user.username)&&c.participants.includes(ou)&&!c.secret);if(!ch){const cid=`chat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;ch={id:cid,participants:[user.username,ou],lastMessage:'',lastMessageTime:Date.now(),createdAt:Date.now()};chats.push(ch);saveJSON('chats.json',chats);}const msgs=loadJSON(`chat_msgs_${ch.id}.json`,[]);msgs.push({id:`msg_${Date.now()}`,senderId:user.username,text:body.text||'',timestamp:Date.now(),type:'text'});saveJSON(`chat_msgs_${ch.id}.json`,msgs);ch.lastMessage=body.text;ch.lastMessageTime=Date.now();saveJSON('chats.json',chats);res.end(JSON.stringify({ok:true,chatId:ch.id}));return;}
        if(path==='/api/user/following'&&req.method==='GET'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}res.end(JSON.stringify({ok:true,following:loadJSON(`following_${user.username}.json`,[]),friends:loadJSON(`friends_${user.username}.json`,[])}));return;}

        // ═══ Beauty Manager API ═══
        if(path==='/api/beauty/skin-analyses'&&req.method==='GET'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const a=loadJSON(`beauty_analyses_${user.username}.json`,[]);const lim=parseInt(url.searchParams.get('limit')||'10');res.end(JSON.stringify({ok:true,analyses:a.sort((x,y)=>(y.createdAt||0)-(x.createdAt||0)).slice(0,lim)}));return;}
        if(path==='/api/beauty/skin-analyses'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const tu=body.userId||user.username;const a=loadJSON(`beauty_analyses_${tu}.json`,[]);const aid=`ba_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;const an={id:aid,...body,createdAt:Date.now()};delete an.userId;a.push(an);saveJSON(`beauty_analyses_${tu}.json`,a);res.end(JSON.stringify({ok:true,id:aid}));return;}
        if(path==='/api/beauty/skin-photos'&&req.method==='GET'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const p=loadJSON(`beauty_photos_${user.username}.json`,[]);const lim=parseInt(url.searchParams.get('limit')||'12');res.end(JSON.stringify({ok:true,photos:p.sort((x,y)=>(y.createdAt||0)-(x.createdAt||0)).slice(0,lim)}));return;}
        if(path==='/api/beauty/skin-photos'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const p=loadJSON(`beauty_photos_${user.username}.json`,[]);let photoURL=body.photoURL||'';if(body.photoBase64){const d=pathModule.join(DATA_DIR,'uploads',user.username,'skin');if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});const fn=`${body.zone||'full'}_${Date.now()}.jpg`;const m=body.photoBase64.match(/^data:[^;]+;base64,(.+)$/);fs.writeFileSync(pathModule.join(d,fn),Buffer.from(m?m[1]:body.photoBase64,'base64'));photoURL=`/uploads/${user.username}/skin/${fn}`;}const pid=`bp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;p.push({id:pid,zone:body.zone||'full',photoURL,storagePath:photoURL,createdAt:Date.now(),analyzed:false,analysisResult:null});saveJSON(`beauty_photos_${user.username}.json`,p);res.end(JSON.stringify({ok:true,id:pid,photoURL}));return;}
        if(path==='/api/beauty/analysis-requests'&&req.method==='GET'){const r=loadJSON('beauty_analysis_requests.json',[]);res.end(JSON.stringify({ok:true,requests:r.filter(x=>x.status==='pending'||x.status==='in_progress').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,20)}));return;}
        if(path==='/api/beauty/analysis-requests'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const r=loadJSON('beauty_analysis_requests.json',[]);const rid=`bar_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;r.push({id:rid,userId:user.username,userNickname:body.userNickname||user.username,photoCount:body.photoCount||0,type:body.type||'expert',status:'pending',createdAt:Date.now(),completedAt:null,analysisId:null});saveJSON('beauty_analysis_requests.json',r);res.end(JSON.stringify({ok:true,id:rid}));return;}
        if(/^\/api\/beauty\/analysis-requests\/[^/]+$/.test(path)&&(req.method==='PATCH'||req.method==='POST')){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const rid=path.split('/')[4];const r=loadJSON('beauty_analysis_requests.json',[]);const rq=r.find(x=>x.id===rid);if(!rq){res.statusCode=404;res.end('{"error":"not found"}');return;}Object.assign(rq,body);saveJSON('beauty_analysis_requests.json',r);res.end('{"ok":true}');return;}
        if(path==='/api/beauty/notify'&&req.method==='POST'){const user=getAuth(req);if(!user){res.statusCode=401;res.end('{"error":"auth"}');return;}const n=loadJSON(`notifications_${body.userId}.json`,[]);n.push({type:'beauty',message:body.message||'Analysis result available!',read:false,createdAt:Date.now()});saveJSON(`notifications_${body.userId}.json`,n);res.end('{"ok":true}');return;}

        // ═══ Marketplace REST API ═══
        // Data stored in data/marketplace/ subdirectory
        const MP_DIR = pathModule.join(DATA_DIR, 'marketplace');
        if (!fs.existsSync(MP_DIR)) fs.mkdirSync(MP_DIR, { recursive: true });
        function mpLoad(file, def = []) { const p = pathModule.join(MP_DIR, file); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); return typeof def === 'function' ? def() : (Array.isArray(def) ? [...def] : {...def}); }
        function mpSave(file, data) { fs.writeFileSync(pathModule.join(MP_DIR, file), JSON.stringify(data, null, 2)); }
        function mpId(prefix) { return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; }

        // --- PRODUCTS ---
        // GET /api/marketplace/products?status=active&category=xxx&sellerId=xxx&limit=50
        if (path === '/api/marketplace/products' && req.method === 'GET') {
            let items = mpLoad('products.json', []);
            const status = url.searchParams.get('status');
            const category = url.searchParams.get('category');
            const sellerId = url.searchParams.get('sellerId');
            const sortBy = url.searchParams.get('sort') || 'newest';
            const lim = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
            if (status) items = items.filter(p => p.status === status);
            if (category) items = items.filter(p => p.category === category);
            if (sellerId) items = items.filter(p => p.sellerId === sellerId);
            if (sortBy === 'newest') items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            else if (sortBy === 'fans') items.sort((a, b) => (b.sold || 0) - (a.sold || 0));
            else if (sortBy === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            items = items.slice(0, lim);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        // GET /api/marketplace/products/:id
        if (/^\/api\/marketplace\/products\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('products.json', []);
            const p = items.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: p }));
            return;
        }
        // POST /api/marketplace/products — create product
        if (path === '/api/marketplace/products' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('products.json', []);
            const id = mpId('prod');
            const u = loadJSON(`user_${user.username}.json`, {});
            const prod = {
                id, title: body.title || '', description: body.description || '',
                category: body.category || '', price: body.price || 0, priceToken: body.priceToken || 'CRGC',
                stock: body.stock || 0, sold: 0, imageData: body.imageData || '',
                images: body.images || [], avgRating: 0, reviewCount: 0,
                sellerId: user.username, sellerEmail: user.username + '@crowny.org',
                sellerNickname: u.nickname || user.username,
                status: body.status || 'active', createdAt: Date.now()
            };
            items.push(prod);
            mpSave('products.json', items);
            res.end(JSON.stringify({ ok: true, id, item: prod }));
            return;
        }
        // PATCH /api/marketplace/products/:id — update product
        if (/^\/api\/marketplace\/products\/[^/]+$/.test(path) && (req.method === 'PATCH' || req.method === 'PUT')) {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const items = mpLoad('products.json', []);
            const idx = items.findIndex(x => x.id === id);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (items[idx].sellerId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            const allowed = ['title', 'description', 'price', 'stock', 'status', 'imageData', 'images', 'category', 'sold', 'avgRating', 'reviewCount'];
            for (const k of allowed) { if (body[k] !== undefined) items[idx][k] = body[k]; }
            mpSave('products.json', items);
            res.end(JSON.stringify({ ok: true, item: items[idx] }));
            return;
        }
        // DELETE /api/marketplace/products/:id
        if (/^\/api\/marketplace\/products\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            let items = mpLoad('products.json', []);
            const p = items.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (p.sellerId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            items = items.filter(x => x.id !== id);
            mpSave('products.json', items);
            res.end('{"ok":true}');
            return;
        }

        // --- ORDERS ---
        // GET /api/marketplace/orders?buyerId=xxx&sellerId=xxx&limit=30
        if (path === '/api/marketplace/orders' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            let items = mpLoad('orders.json', []);
            const buyerId = url.searchParams.get('buyerId');
            const sellerId = url.searchParams.get('sellerId');
            const productId = url.searchParams.get('productId');
            const status = url.searchParams.get('status');
            if (buyerId) items = items.filter(o => o.buyerId === buyerId);
            if (sellerId) items = items.filter(o => o.sellerId === sellerId);
            if (productId) items = items.filter(o => o.productId === productId);
            if (status) items = items.filter(o => o.status === status);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            const lim = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
            items = items.slice(0, lim);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        // GET /api/marketplace/orders/:id
        if (/^\/api\/marketplace\/orders\/[^/]+$/.test(path) && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const items = mpLoad('orders.json', []);
            const o = items.find(x => x.id === id);
            if (!o) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: o }));
            return;
        }
        // POST /api/marketplace/orders — create order (single product buy)
        if (path === '/api/marketplace/orders' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const products = mpLoad('products.json', []);
            const p = products.find(x => x.id === body.productId);
            if (!p || p.status !== 'active') { res.statusCode = 400; res.end('{"error":"product not available"}'); return; }
            const qty = body.qty || 1;
            const price = p.price * qty;
            if (price <= 0 || price > 10000) { res.statusCode = 400; res.end('{"error":"invalid price"}'); return; }
            const remaining = p.stock - (p.sold || 0);
            if (remaining < qty) { res.statusCode = 400; res.end('{"error":"out of stock"}'); return; }
            // Balance check & deduct
            const buyerFile = `user_${user.username}.json`;
            const buyerData = loadJSON(buyerFile, {});
            const buyerBal = buyerData.offchainBalances || {};
            if ((buyerBal.crgc || 0) < price) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            buyerBal.crgc = (buyerBal.crgc || 0) - price;
            buyerData.offchainBalances = buyerBal;
            saveJSON(buyerFile, buyerData);
            // Pay seller
            const sellerFile = `user_${p.sellerId}.json`;
            const sellerData = loadJSON(sellerFile, {});
            const sellerBal = sellerData.offchainBalances || {};
            sellerBal.crgc = (sellerBal.crgc || 0) + price;
            sellerData.offchainBalances = sellerBal;
            saveJSON(sellerFile, sellerData);
            // Update stock
            p.sold = (p.sold || 0) + qty;
            mpSave('products.json', products);
            // Create order
            const orders = mpLoad('orders.json', []);
            const oid = mpId('order');
            const order = {
                id: oid, productId: body.productId, productTitle: p.title,
                productImage: (p.images && p.images.length > 0) ? p.images[0] : (p.imageData || ''),
                buyerId: user.username, buyerEmail: user.username + '@crowny.org',
                sellerId: p.sellerId, sellerEmail: p.sellerEmail || '',
                amount: price, qty, token: 'CRGC', status: 'paid',
                shippingInfo: body.shippingInfo || null,
                statusHistory: [{ status: 'paid', at: new Date().toISOString() }],
                createdAt: Date.now()
            };
            orders.push(order);
            mpSave('orders.json', orders);
            // Seller notification
            const notifs = loadJSON(`notifications_${p.sellerId}.json`, []);
            notifs.push({ type: 'order_status', message: `New order! "${p.title}" (${price} CRGC)`, link: '#page=my-shop', read: false, createdAt: Date.now() });
            saveJSON(`notifications_${p.sellerId}.json`, notifs);
            res.end(JSON.stringify({ ok: true, id: oid, order }));
            return;
        }
        // PATCH /api/marketplace/orders/:id — update order status
        if (/^\/api\/marketplace\/orders\/[^/]+$/.test(path) && (req.method === 'PATCH' || req.method === 'PUT')) {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const orders = mpLoad('orders.json', []);
            const o = orders.find(x => x.id === id);
            if (!o) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (o.sellerId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            const newStatus = body.status;
            if (newStatus) {
                o.status = newStatus;
                o[`${newStatus}At`] = new Date().toISOString();
                if (!o.statusHistory) o.statusHistory = [];
                o.statusHistory.push({ status: newStatus, at: new Date().toISOString() });
                if (body.trackingNumber) o.trackingNumber = body.trackingNumber;
            }
            mpSave('orders.json', orders);
            // Buyer notification
            const notifs = loadJSON(`notifications_${o.buyerId}.json`, []);
            const msgMap = { shipping: `"${o.productTitle}" is now shipping!`, delivered: `"${o.productTitle}" has been delivered!` };
            if (msgMap[newStatus]) { notifs.push({ type: 'order_status', message: msgMap[newStatus], link: '#page=buyer-orders', read: false, createdAt: Date.now() }); saveJSON(`notifications_${o.buyerId}.json`, notifs); }
            res.end(JSON.stringify({ ok: true, item: o }));
            return;
        }

        // --- CHECKOUT (cart batch) ---
        if (path === '/api/marketplace/checkout' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const cartItems = body.items || [];
            const shippingInfo = body.shippingInfo || null;
            if (!cartItems.length) { res.statusCode = 400; res.end('{"error":"empty cart"}'); return; }
            let total = 0;
            cartItems.forEach(it => { total += (it.price || 0) * (it.qty || 1); });
            if (total <= 0 || total > 10000) { res.statusCode = 400; res.end('{"error":"invalid total"}'); return; }
            // Balance check
            const buyerFile = `user_${user.username}.json`;
            const buyerData = loadJSON(buyerFile, {});
            const buyerBal = buyerData.offchainBalances || {};
            if ((buyerBal.crgc || 0) < total) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            buyerBal.crgc = (buyerBal.crgc || 0) - total;
            buyerData.offchainBalances = buyerBal;
            saveJSON(buyerFile, buyerData);
            const products = mpLoad('products.json', []);
            const orders = mpLoad('orders.json', []);
            const createdOrders = [];
            for (const item of cartItems) {
                const p = products.find(x => x.id === item.productId);
                if (!p) continue;
                const qty = item.qty || 1;
                const subtotal = item.price * qty;
                const remaining = p.stock - (p.sold || 0);
                if (remaining < qty) { res.statusCode = 400; res.end(JSON.stringify({ error: `"${item.title}" out of stock` })); return; }
                p.sold = (p.sold || 0) + qty;
                // Pay seller
                const sf = `user_${p.sellerId}.json`;
                const sd = loadJSON(sf, {});
                const sb = sd.offchainBalances || {};
                sb.crgc = (sb.crgc || 0) + subtotal;
                sd.offchainBalances = sb;
                saveJSON(sf, sd);
                const oid = mpId('order');
                const order = {
                    id: oid, productId: item.productId, productTitle: item.title || p.title,
                    productImage: (p.images && p.images.length > 0) ? p.images[0] : (p.imageData || ''),
                    buyerId: user.username, buyerEmail: user.username + '@crowny.org',
                    sellerId: p.sellerId, sellerEmail: p.sellerEmail || '',
                    amount: subtotal, qty, token: 'CRGC', status: 'paid', shippingInfo,
                    statusHistory: [{ status: 'paid', at: new Date().toISOString() }], createdAt: Date.now()
                };
                orders.push(order);
                createdOrders.push(order);
                // Seller notification
                const notifs = loadJSON(`notifications_${p.sellerId}.json`, []);
                notifs.push({ type: 'order_status', message: `New order! "${p.title}" (${subtotal} CRGC)`, link: '#page=my-shop', read: false, createdAt: Date.now() });
                saveJSON(`notifications_${p.sellerId}.json`, notifs);
            }
            mpSave('products.json', products);
            mpSave('orders.json', orders);
            res.end(JSON.stringify({ ok: true, orders: createdOrders }));
            return;
        }

        // --- REVIEWS ---
        // GET /api/marketplace/reviews?productId=xxx&buyerId=xxx
        if (path === '/api/marketplace/reviews' && req.method === 'GET') {
            let items = mpLoad('reviews.json', []);
            const productId = url.searchParams.get('productId');
            const buyerId = url.searchParams.get('buyerId');
            if (productId) items = items.filter(r => r.productId === productId);
            if (buyerId) items = items.filter(r => r.buyerId === buyerId);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            const lim = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
            items = items.slice(0, lim);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        // POST /api/marketplace/reviews
        if (path === '/api/marketplace/reviews' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const reviews = mpLoad('reviews.json', []);
            // Check if already reviewed
            const existing = reviews.find(r => r.productId === body.productId && r.buyerId === user.username);
            if (existing) { res.statusCode = 400; res.end('{"error":"already reviewed"}'); return; }
            const rid = mpId('rev');
            const review = {
                id: rid, productId: body.productId, buyerId: user.username,
                buyerEmail: user.username + '@crowny.org',
                rating: body.rating || 5, comment: body.comment || '',
                imageData: body.imageData || '', verified: body.verified || false,
                helpful: 0, createdAt: Date.now()
            };
            reviews.push(review);
            mpSave('reviews.json', reviews);
            // Update product avg rating
            const allRevs = reviews.filter(r => r.productId === body.productId);
            const avg = allRevs.reduce((s, r) => s + r.rating, 0) / allRevs.length;
            const products = mpLoad('products.json', []);
            const prod = products.find(x => x.id === body.productId);
            if (prod) { prod.avgRating = Math.round(avg * 10) / 10; prod.reviewCount = allRevs.length; mpSave('products.json', products); }
            // Seller notification
            if (prod) {
                const notifs = loadJSON(`notifications_${prod.sellerId}.json`, []);
                notifs.push({ type: 'order_status', message: `"${prod.title}" new review (${body.rating}/5)`, link: `#page=product-detail&id=${body.productId}`, read: false, createdAt: Date.now() });
                saveJSON(`notifications_${prod.sellerId}.json`, notifs);
            }
            res.end(JSON.stringify({ ok: true, id: rid, review }));
            return;
        }
        // POST /api/marketplace/reviews/:id/helpful
        if (/^\/api\/marketplace\/reviews\/[^/]+\/helpful$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const rid = path.split('/')[4];
            const reviews = mpLoad('reviews.json', []);
            const rev = reviews.find(x => x.id === rid);
            if (!rev) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            rev.helpful = (rev.helpful || 0) + 1;
            mpSave('reviews.json', reviews);
            res.end(JSON.stringify({ ok: true, helpful: rev.helpful }));
            return;
        }

        // --- CAMPAIGNS (fundraising) ---
        if (path === '/api/marketplace/campaigns' && req.method === 'GET') {
            let items = mpLoad('campaigns.json', []);
            const status = url.searchParams.get('status');
            if (status) items = items.filter(c => c.status === status);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (/^\/api\/marketplace\/campaigns\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('campaigns.json', []);
            const c = items.find(x => x.id === id);
            if (!c) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: c }));
            return;
        }
        if (path === '/api/marketplace/campaigns' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('campaigns.json', []);
            const u = loadJSON(`user_${user.username}.json`, {});
            const id = mpId('camp');
            const days = parseInt(body.days) || 30;
            const camp = {
                id, title: body.title || '', description: body.description || '',
                category: body.category || '', goal: body.goal || 0, raised: 0, token: 'CRGC',
                backers: 0, imageData: body.imageData || '',
                platformFee: body.platformFee || 2.5,
                creatorId: user.username, creatorEmail: user.username + '@crowny.org',
                creatorNickname: u.nickname || user.username,
                endDate: Date.now() + days * 86400000,
                status: 'active', createdAt: Date.now()
            };
            items.push(camp);
            mpSave('campaigns.json', items);
            res.end(JSON.stringify({ ok: true, id, item: camp }));
            return;
        }
        // POST /api/marketplace/campaigns/:id/donate
        if (/^\/api\/marketplace\/campaigns\/[^/]+\/donate$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const campaigns = mpLoad('campaigns.json', []);
            const camp = campaigns.find(x => x.id === id);
            if (!camp) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const amount = body.amount || 0;
            if (amount <= 0) { res.statusCode = 400; res.end('{"error":"invalid amount"}'); return; }
            const tk = 'crgc';
            const platformFee = amount * ((camp.platformFee || 2.5) / 100);
            const creatorReceive = amount - platformFee;
            // Deduct from donor
            const donorFile = `user_${user.username}.json`;
            const donorData = loadJSON(donorFile, {});
            const donorBal = donorData.offchainBalances || {};
            if ((donorBal[tk] || 0) < amount) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            donorBal[tk] = (donorBal[tk] || 0) - amount;
            donorData.offchainBalances = donorBal;
            saveJSON(donorFile, donorData);
            // Pay creator
            const creatorFile = `user_${camp.creatorId}.json`;
            const creatorData = loadJSON(creatorFile, {});
            const creatorBal = creatorData.offchainBalances || {};
            creatorBal[tk] = (creatorBal[tk] || 0) + creatorReceive;
            creatorData.offchainBalances = creatorBal;
            saveJSON(creatorFile, creatorData);
            // Update campaign
            camp.raised = (camp.raised || 0) + amount;
            camp.backers = (camp.backers || 0) + 1;
            mpSave('campaigns.json', campaigns);
            // Transaction log
            const txns = mpLoad('transactions.json', []);
            txns.push({ id: mpId('tx'), from: user.username, to: camp.creatorId, amount, token: camp.token, type: 'donation', campaignId: id, platformFee, creatorReceive, timestamp: Date.now() });
            mpSave('transactions.json', txns);
            // Platform fee log
            const fees = mpLoad('platform_fees.json', []);
            fees.push({ campaignId: id, amount: platformFee, token: camp.token, fromUser: user.username, timestamp: Date.now() });
            mpSave('platform_fees.json', fees);
            // Campaign donors log
            const donors = mpLoad('campaign_donors.json', []);
            donors.push({ campaignId: id, donorId: user.username, donorEmail: user.username + '@crowny.org', amount, token: camp.token, timestamp: Date.now() });
            mpSave('campaign_donors.json', donors);
            res.end(JSON.stringify({ ok: true, raised: camp.raised }));
            return;
        }
        // PATCH /api/marketplace/campaigns/:id — close campaign
        if (/^\/api\/marketplace\/campaigns\/[^/]+$/.test(path) && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const campaigns = mpLoad('campaigns.json', []);
            const camp = campaigns.find(x => x.id === id);
            if (!camp) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (camp.creatorId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            if (body.status) camp.status = body.status;
            if (body.status === 'closed') camp.closedAt = Date.now();
            // Platform fee on close
            if (body.status === 'closed' && camp.raised > 0) {
                const fee = camp.platformFee || 2.5;
                const feeAmount = camp.raised * (fee / 100);
                const fees = mpLoad('platform_fees.json', []);
                fees.push({ campaignId: id, amount: feeAmount, token: camp.token, type: 'campaign_close', timestamp: Date.now() });
                mpSave('platform_fees.json', fees);
            }
            mpSave('campaigns.json', campaigns);
            res.end(JSON.stringify({ ok: true, item: camp }));
            return;
        }

        // --- TRANSACTIONS (donation log for campaign detail) ---
        if (path === '/api/marketplace/transactions' && req.method === 'GET') {
            let items = mpLoad('transactions.json', []);
            const campaignId = url.searchParams.get('campaignId');
            const type = url.searchParams.get('type');
            const artistId = url.searchParams.get('artistId');
            const from = url.searchParams.get('from');
            if (campaignId) items = items.filter(t => t.campaignId === campaignId);
            if (type) items = items.filter(t => t.type === type);
            if (artistId) items = items.filter(t => t.artistId === artistId);
            if (from) items = items.filter(t => t.from === from);
            items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const lim = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
            items = items.slice(0, lim);
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- ENERGY PROJECTS (CREB Labs) ---
        if (path === '/api/marketplace/energy-projects' && req.method === 'GET') {
            let items = mpLoad('energy_projects.json', []);
            const status = url.searchParams.get('status');
            if (status) items = items.filter(p => p.status === status);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (/^\/api\/marketplace\/energy-projects\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('energy_projects.json', []);
            const p = items.find(x => x.id === id);
            if (!p) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: p }));
            return;
        }
        if (path === '/api/marketplace/energy-projects' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('energy_projects.json', []);
            const id = mpId('eproj');
            const proj = {
                id, title: body.title || '', location: body.location || '',
                capacity: body.capacity || 0, returnRate: body.returnRate || 0,
                goal: body.goal || 0, category: body.category || 'energy',
                investType: body.investType || 'return',
                invested: 0, investors: 0, status: 'active',
                milestones: body.milestones || [], teamMembers: body.teamMembers || [],
                description: body.description || '',
                creatorId: user.username, createdAt: Date.now()
            };
            items.push(proj);
            mpSave('energy_projects.json', items);
            res.end(JSON.stringify({ ok: true, id, item: proj }));
            return;
        }
        // POST /api/marketplace/energy-projects/:id/invest
        if (/^\/api\/marketplace\/energy-projects\/[^/]+\/invest$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const projects = mpLoad('energy_projects.json', []);
            const proj = projects.find(x => x.id === id);
            if (!proj) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const amount = body.amount || 0;
            const tk = 'creb';
            if (amount <= 0) { res.statusCode = 400; res.end('{"error":"invalid amount"}'); return; }
            // Deduct balance
            const uf = `user_${user.username}.json`;
            const ud = loadJSON(uf, {});
            const ub = ud.offchainBalances || {};
            if ((ub[tk] || 0) < amount) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            ub[tk] = (ub[tk] || 0) - amount;
            ud.offchainBalances = ub;
            saveJSON(uf, ud);
            // Update project
            proj.invested = (proj.invested || 0) + amount;
            proj.investors = (proj.investors || 0) + 1;
            mpSave('energy_projects.json', projects);
            // Investment log
            const invs = mpLoad('energy_investments.json', []);
            invs.push({ id: mpId('einv'), projectId: id, userId: user.username, amount, token: 'CREB', timestamp: Date.now() });
            mpSave('energy_investments.json', invs);
            res.end(JSON.stringify({ ok: true, invested: proj.invested }));
            return;
        }
        // GET /api/marketplace/energy-investments?userId=xxx&projectId=xxx
        if (path === '/api/marketplace/energy-investments' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            let items = mpLoad('energy_investments.json', []);
            const userId = url.searchParams.get('userId');
            const projectId = url.searchParams.get('projectId');
            if (userId) items = items.filter(i => i.userId === userId);
            if (projectId) items = items.filter(i => i.projectId === projectId);
            items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        // POST /api/marketplace/energy-projects/:id/distribute — distribute returns
        if (/^\/api\/marketplace\/energy-projects\/[^/]+\/distribute$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const projects = mpLoad('energy_projects.json', []);
            const proj = projects.find(x => x.id === id);
            if (!proj) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (proj.creatorId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            const rate = proj.returnRate || 0;
            const investments = mpLoad('energy_investments.json', []).filter(i => i.projectId === id);
            if (!investments.length) { res.statusCode = 400; res.end('{"error":"no investors"}'); return; }
            let distributed = 0;
            const txns = mpLoad('transactions.json', []);
            for (const inv of investments) {
                const share = inv.amount * rate / 100 / 12;
                if (share <= 0) continue;
                const uf = `user_${inv.userId}.json`;
                const ud = loadJSON(uf, {});
                const ub = ud.offchainBalances || {};
                ub.creb = (ub.creb || 0) + share;
                ud.offchainBalances = ub;
                saveJSON(uf, ud);
                txns.push({ id: mpId('tx'), from: 'energy_system', to: inv.userId, amount: share, token: 'CREB', type: 'energy_return', projectId: id, timestamp: Date.now() });
                distributed += share;
            }
            mpSave('transactions.json', txns);
            res.end(JSON.stringify({ ok: true, distributed, investorCount: investments.length }));
            return;
        }
        // POST /api/marketplace/energy-projects/:id/comments
        if (/^\/api\/marketplace\/energy-projects\/[^/]+\/comments$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const projectId = path.split('/')[4];
            const comments = mpLoad(`energy_comments_${projectId}.json`, []);
            const u = loadJSON(`user_${user.username}.json`, {});
            comments.push({ id: mpId('ec'), userId: user.username, nickname: u.nickname || user.username, text: body.text || '', createdAt: Date.now() });
            mpSave(`energy_comments_${projectId}.json`, comments);
            res.end('{"ok":true}');
            return;
        }
        // GET /api/marketplace/energy-projects/:id/comments
        if (/^\/api\/marketplace\/energy-projects\/[^/]+\/comments$/.test(path) && req.method === 'GET') {
            const projectId = path.split('/')[4];
            const comments = mpLoad(`energy_comments_${projectId}.json`, []);
            comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items: comments.slice(0, 20) }));
            return;
        }

        // --- BUSINESSES ---
        if (path === '/api/marketplace/businesses' && req.method === 'GET') {
            let items = mpLoad('businesses.json', []);
            const status = url.searchParams.get('status');
            if (status) items = items.filter(b => b.status === status);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (/^\/api\/marketplace\/businesses\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('businesses.json', []);
            const b = items.find(x => x.id === id);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: b }));
            return;
        }
        if (path === '/api/marketplace/businesses' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('businesses.json', []);
            const u = loadJSON(`user_${user.username}.json`, {});
            const id = mpId('biz');
            const biz = {
                id, name: body.name || '', description: body.description || '',
                category: body.category || 'other', country: body.country || '',
                website: body.website || '', imageData: body.imageData || '',
                ownerId: user.username, ownerEmail: user.username + '@crowny.org',
                ownerNickname: u.nickname || user.username,
                rating: 0, reviews: 0, status: 'active', createdAt: Date.now()
            };
            items.push(biz);
            mpSave('businesses.json', items);
            res.end(JSON.stringify({ ok: true, id, item: biz }));
            return;
        }
        // PATCH /api/marketplace/businesses/:id
        if (/^\/api\/marketplace\/businesses\/[^/]+$/.test(path) && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const items = mpLoad('businesses.json', []);
            const biz = items.find(x => x.id === id);
            if (!biz) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (body.rating !== undefined) biz.rating = body.rating;
            if (body.reviews !== undefined) biz.reviews = body.reviews;
            mpSave('businesses.json', items);
            res.end(JSON.stringify({ ok: true, item: biz }));
            return;
        }
        // POST /api/marketplace/business-investments
        if (path === '/api/marketplace/business-investments' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const businesses = mpLoad('businesses.json', []);
            const biz = businesses.find(x => x.id === body.businessId);
            if (!biz) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const amount = body.amount || 0;
            const tk = 'crgc';
            if (amount <= 0) { res.statusCode = 400; res.end('{"error":"invalid amount"}'); return; }
            // Deduct from investor
            const uf = `user_${user.username}.json`;
            const ud = loadJSON(uf, {});
            const ub = ud.offchainBalances || {};
            if ((ub[tk] || 0) < amount) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            ub[tk] = (ub[tk] || 0) - amount;
            ud.offchainBalances = ub;
            saveJSON(uf, ud);
            // Pay business owner
            const of2 = `user_${biz.ownerId}.json`;
            const od = loadJSON(of2, {});
            const ob = od.offchainBalances || {};
            ob[tk] = (ob[tk] || 0) + amount;
            od.offchainBalances = ob;
            saveJSON(of2, od);
            // Log investment
            const invs = mpLoad('business_investments.json', []);
            invs.push({ id: mpId('binv'), businessId: body.businessId, businessName: biz.name, investorId: user.username, investorEmail: user.username + '@crowny.org', amount, token: 'CRGC', timestamp: Date.now() });
            mpSave('business_investments.json', invs);
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        // GET /api/marketplace/business-investments?businessId=xxx
        if (path === '/api/marketplace/business-investments' && req.method === 'GET') {
            let items = mpLoad('business_investments.json', []);
            const businessId = url.searchParams.get('businessId');
            if (businessId) items = items.filter(i => i.businessId === businessId);
            items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }

        // --- ARTISTS ---
        if (path === '/api/marketplace/artists' && req.method === 'GET') {
            let items = mpLoad('artists.json', []);
            const status = url.searchParams.get('status');
            if (status) items = items.filter(a => a.status === status);
            items.sort((a, b) => (b.fans || 0) - (a.fans || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (/^\/api\/marketplace\/artists\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('artists.json', []);
            const a = items.find(x => x.id === id);
            if (!a) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: a }));
            return;
        }
        if (path === '/api/marketplace/artists' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('artists.json', []);
            const id = mpId('art');
            const artist = {
                id, name: body.name || '', bio: body.bio || '',
                genre: body.genre || 'other', imageData: body.imageData || '',
                userId: user.username, email: user.username + '@crowny.org',
                fans: 0, totalSupport: 0, status: 'active', createdAt: Date.now()
            };
            items.push(artist);
            mpSave('artists.json', items);
            res.end(JSON.stringify({ ok: true, id, item: artist }));
            return;
        }
        // POST /api/marketplace/artists/:id/support
        if (/^\/api\/marketplace\/artists\/[^/]+\/support$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const artists = mpLoad('artists.json', []);
            const artist = artists.find(x => x.id === id);
            if (!artist) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const amount = body.amount || 0;
            const tk = 'crac';
            if (amount <= 0) { res.statusCode = 400; res.end('{"error":"invalid amount"}'); return; }
            // Deduct from supporter
            const uf = `user_${user.username}.json`;
            const ud = loadJSON(uf, {});
            const ub = ud.offchainBalances || {};
            if ((ub[tk] || 0) < amount) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            ub[tk] = (ub[tk] || 0) - amount;
            ud.offchainBalances = ub;
            saveJSON(uf, ud);
            // Pay artist
            const af = `user_${artist.userId}.json`;
            const ad = loadJSON(af, {});
            const ab = ad.offchainBalances || {};
            ab[tk] = (ab[tk] || 0) + amount;
            ad.offchainBalances = ab;
            saveJSON(af, ad);
            // Unique fan check
            const txns = mpLoad('transactions.json', []);
            const isNewFan = !txns.some(t => t.from === user.username && t.artistId === id && t.type === 'artist_support');
            artist.totalSupport = (artist.totalSupport || 0) + amount;
            if (isNewFan) artist.fans = (artist.fans || 0) + 1;
            mpSave('artists.json', artists);
            txns.push({ id: mpId('tx'), from: user.username, to: artist.userId, amount, token: 'CRAC', type: 'artist_support', artistId: id, timestamp: Date.now() });
            mpSave('transactions.json', txns);
            res.end(JSON.stringify({ ok: true, fans: artist.fans, totalSupport: artist.totalSupport }));
            return;
        }

        // --- BOOKS ---
        if (path === '/api/marketplace/books' && req.method === 'GET') {
            let items = mpLoad('books.json', []);
            const status = url.searchParams.get('status');
            if (status) items = items.filter(b => b.status === status);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (/^\/api\/marketplace\/books\/[^/]+$/.test(path) && req.method === 'GET') {
            const id = path.split('/')[4];
            const items = mpLoad('books.json', []);
            const b = items.find(x => x.id === id);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            res.end(JSON.stringify({ ok: true, item: b }));
            return;
        }
        if (path === '/api/marketplace/books' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const items = mpLoad('books.json', []);
            const id = mpId('book');
            const book = {
                id, title: body.title || '', author: body.author || '',
                description: body.description || '', genre: body.genre || 'other',
                price: body.price || 0, priceToken: 'CRGC',
                imageData: body.imageData || '',
                publisherId: user.username, publisherEmail: user.username + '@crowny.org',
                sold: 0, rating: 0, reviews: 0, status: 'active', createdAt: Date.now()
            };
            items.push(book);
            mpSave('books.json', items);
            res.end(JSON.stringify({ ok: true, id, item: book }));
            return;
        }
        // POST /api/marketplace/books/:id/buy
        if (/^\/api\/marketplace\/books\/[^/]+\/buy$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            const books = mpLoad('books.json', []);
            const b = books.find(x => x.id === id);
            if (!b) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (b.publisherId === user.username) { res.statusCode = 400; res.end('{"error":"own book"}'); return; }
            if (b.price <= 0) { res.end(JSON.stringify({ ok: true, free: true })); return; }
            const tk = 'crgc';
            const uf = `user_${user.username}.json`;
            const ud = loadJSON(uf, {});
            const ub = ud.offchainBalances || {};
            if ((ub[tk] || 0) < b.price) { res.statusCode = 400; res.end('{"error":"insufficient balance"}'); return; }
            ub[tk] = (ub[tk] || 0) - b.price;
            ud.offchainBalances = ub;
            saveJSON(uf, ud);
            // Pay publisher
            const pf = `user_${b.publisherId}.json`;
            const pd = loadJSON(pf, {});
            const pb = pd.offchainBalances || {};
            pb[tk] = (pb[tk] || 0) + b.price;
            pd.offchainBalances = pb;
            saveJSON(pf, pd);
            b.sold = (b.sold || 0) + 1;
            mpSave('books.json', books);
            const txns = mpLoad('transactions.json', []);
            txns.push({ id: mpId('tx'), from: user.username, to: b.publisherId, amount: b.price, token: 'CRGC', type: 'book_purchase', bookId: id, timestamp: Date.now() });
            mpSave('transactions.json', txns);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- CART ---
        // GET /api/marketplace/cart
        if (path === '/api/marketplace/cart' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const cart = mpLoad(`cart_${user.username}.json`, []);
            cart.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
            res.end(JSON.stringify({ ok: true, items: cart }));
            return;
        }
        // POST /api/marketplace/cart
        if (path === '/api/marketplace/cart' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const cart = mpLoad(`cart_${user.username}.json`, []);
            const existing = cart.find(c => c.productId === body.productId);
            if (existing) {
                existing.qty = (existing.qty || 1) + 1;
            } else {
                const products = mpLoad('products.json', []);
                const p = products.find(x => x.id === body.productId);
                if (!p) { res.statusCode = 404; res.end('{"error":"product not found"}'); return; }
                cart.push({ id: mpId('cart'), productId: body.productId, title: p.title, price: p.price, token: p.token || 'CRGC', imageData: p.imageData || '', qty: 1, addedAt: Date.now() });
            }
            mpSave(`cart_${user.username}.json`, cart);
            res.end(JSON.stringify({ ok: true, count: cart.reduce((s, c) => s + (c.qty || 1), 0) }));
            return;
        }
        // PATCH /api/marketplace/cart/:id
        if (/^\/api\/marketplace\/cart\/[^/]+$/.test(path) && req.method === 'PATCH') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            let cart = mpLoad(`cart_${user.username}.json`, []);
            const item = cart.find(c => c.id === id);
            if (!item) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            const newQty = (item.qty || 1) + (body.delta || 0);
            if (newQty <= 0) cart = cart.filter(c => c.id !== id);
            else item.qty = newQty;
            mpSave(`cart_${user.username}.json`, cart);
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        // DELETE /api/marketplace/cart/:id
        if (/^\/api\/marketplace\/cart\/[^/]+$/.test(path) && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const id = path.split('/')[4];
            let cart = mpLoad(`cart_${user.username}.json`, []);
            cart = cart.filter(c => c.id !== id);
            mpSave(`cart_${user.username}.json`, cart);
            res.end('{"ok":true}');
            return;
        }
        // DELETE /api/marketplace/cart — clear cart
        if (path === '/api/marketplace/cart' && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            mpSave(`cart_${user.username}.json`, []);
            res.end('{"ok":true}');
            return;
        }

        // --- WISHLIST ---
        if (path === '/api/marketplace/wishlist' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const wl = mpLoad(`wishlist_${user.username}.json`, []);
            wl.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
            res.end(JSON.stringify({ ok: true, items: wl }));
            return;
        }
        // POST /api/marketplace/wishlist/toggle
        if (path === '/api/marketplace/wishlist/toggle' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            let wl = mpLoad(`wishlist_${user.username}.json`, []);
            const existing = wl.find(w => w.productId === body.productId);
            if (existing) {
                wl = wl.filter(w => w.productId !== body.productId);
                mpSave(`wishlist_${user.username}.json`, wl);
                res.end(JSON.stringify({ ok: true, action: 'removed' }));
            } else {
                const products = mpLoad('products.json', []);
                const p = products.find(x => x.id === body.productId);
                if (!p) { res.statusCode = 404; res.end('{"error":"product not found"}'); return; }
                wl.push({ id: mpId('wish'), productId: body.productId, title: p.title, price: p.price, token: p.token || 'CRGC', imageData: p.imageData || '', addedAt: Date.now() });
                mpSave(`wishlist_${user.username}.json`, wl);
                res.end(JSON.stringify({ ok: true, action: 'added', title: p.title }));
            }
            return;
        }

        // --- ADDRESSES ---
        if (path === '/api/marketplace/addresses' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const addrs = mpLoad(`addresses_${user.username}.json`, []);
            addrs.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
            res.end(JSON.stringify({ ok: true, items: addrs.slice(0, 5) }));
            return;
        }
        if (path === '/api/marketplace/addresses' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const addrs = mpLoad(`addresses_${user.username}.json`, []);
            addrs.push({ ...body, usedAt: Date.now() });
            if (addrs.length > 10) addrs.splice(0, addrs.length - 10);
            mpSave(`addresses_${user.username}.json`, addrs);
            res.end('{"ok":true}');
            return;
        }

        // --- RETURNS ---
        if (path === '/api/marketplace/returns' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            let items = mpLoad('returns.json', []);
            const sellerId = url.searchParams.get('sellerId');
            const status = url.searchParams.get('status');
            const orderId = url.searchParams.get('orderId');
            if (sellerId) items = items.filter(r => r.sellerId === sellerId);
            if (status) items = items.filter(r => r.status === status);
            if (orderId) items = items.filter(r => r.orderId === orderId);
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            res.end(JSON.stringify({ ok: true, items }));
            return;
        }
        if (path === '/api/marketplace/returns' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const orders = mpLoad('orders.json', []);
            const order = orders.find(o => o.id === body.orderId);
            if (!order) { res.statusCode = 404; res.end('{"error":"order not found"}'); return; }
            const returns = mpLoad('returns.json', []);
            const rid = mpId('ret');
            returns.push({
                id: rid, orderId: body.orderId, productId: order.productId,
                productTitle: order.productTitle, buyerId: user.username,
                buyerEmail: user.username + '@crowny.org',
                sellerId: order.sellerId, sellerEmail: order.sellerEmail,
                amount: order.amount, token: order.token || 'CRGC',
                reasonCategory: body.reasonCategory || '', reasonDetail: body.reasonDetail || '',
                status: 'requested', createdAt: Date.now()
            });
            mpSave('returns.json', returns);
            // Seller notification
            const notifs = loadJSON(`notifications_${order.sellerId}.json`, []);
            notifs.push({ type: 'order_status', message: `"${order.productTitle}" return request received`, link: '#page=my-shop', read: false, createdAt: Date.now() });
            saveJSON(`notifications_${order.sellerId}.json`, notifs);
            res.end(JSON.stringify({ ok: true, id: rid }));
            return;
        }
        // POST /api/marketplace/returns/:id/approve
        if (/^\/api\/marketplace\/returns\/[^/]+\/approve$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const rid = path.split('/')[4];
            const returns = mpLoad('returns.json', []);
            const ret = returns.find(r => r.id === rid);
            if (!ret) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            if (ret.sellerId !== user.username && !ADMIN_USERS.includes(user.username)) { res.statusCode = 403; res.end('{"error":"forbidden"}'); return; }
            const tk = (ret.token || 'CRGC').toLowerCase();
            // Refund buyer
            const bf = `user_${ret.buyerId}.json`;
            const bd = loadJSON(bf, {});
            const bb = bd.offchainBalances || {};
            bb[tk] = (bb[tk] || 0) + ret.amount;
            bd.offchainBalances = bb;
            saveJSON(bf, bd);
            // Deduct from seller
            const sf = `user_${ret.sellerId}.json`;
            const sd = loadJSON(sf, {});
            const sb = sd.offchainBalances || {};
            sb[tk] = Math.max(0, (sb[tk] || 0) - ret.amount);
            sd.offchainBalances = sb;
            saveJSON(sf, sd);
            ret.status = 'completed';
            ret.completedAt = Date.now();
            mpSave('returns.json', returns);
            // Cancel order
            const orders = mpLoad('orders.json', []);
            const order = orders.find(o => o.id === ret.orderId);
            if (order) {
                order.status = 'cancelled';
                order.cancelledAt = new Date().toISOString();
                if (!order.statusHistory) order.statusHistory = [];
                order.statusHistory.push({ status: 'cancelled', at: new Date().toISOString(), reason: 'return_refund' });
                mpSave('orders.json', orders);
            }
            // Buyer notification
            const notifs = loadJSON(`notifications_${ret.buyerId}.json`, []);
            notifs.push({ type: 'order_status', message: `"${ret.productTitle}" return approved. Refund complete!`, link: '#page=buyer-orders', read: false, createdAt: Date.now() });
            saveJSON(`notifications_${ret.buyerId}.json`, notifs);
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        // POST /api/marketplace/returns/:id/reject
        if (/^\/api\/marketplace\/returns\/[^/]+\/reject$/.test(path) && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const rid = path.split('/')[4];
            const returns = mpLoad('returns.json', []);
            const ret = returns.find(r => r.id === rid);
            if (!ret) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
            ret.status = 'rejected';
            ret.rejectReason = body.reason || '';
            ret.rejectedAt = Date.now();
            mpSave('returns.json', returns);
            // Buyer notification
            const notifs = loadJSON(`notifications_${ret.buyerId}.json`, []);
            notifs.push({ type: 'order_status', message: `"${ret.productTitle}" return was rejected. Reason: ${body.reason || ''}`, link: '#page=buyer-orders', read: false, createdAt: Date.now() });
            saveJSON(`notifications_${ret.buyerId}.json`, notifs);
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // --- REPORTS ---
        if (path === '/api/marketplace/reports' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const reports = mpLoad('reports.json', []);
            reports.push({
                id: mpId('rpt'), targetType: body.targetType || 'product',
                targetId: body.targetId || '', reporterId: user.username,
                reporterEmail: user.username + '@crowny.org',
                reason: body.reason || '', detail: body.detail || '',
                status: 'pending', createdAt: Date.now()
            });
            mpSave('reports.json', reports);
            res.end('{"ok":true}');
            return;
        }

        // --- USER STORE SETTINGS ---
        if (path === '/api/marketplace/store-settings' && req.method === 'GET') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const u = loadJSON(`user_${user.username}.json`, {});
            res.end(JSON.stringify({ ok: true, storeName: u.storeName || '', storeDesc: u.storeDesc || '', storeImage: u.storeImage || '', nickname: u.nickname || '', profileImage: u.profileImage || '', email: user.username + '@crowny.org' }));
            return;
        }
        if (path === '/api/marketplace/store-settings' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const u = loadJSON(`user_${user.username}.json`, {});
            if (body.storeName !== undefined) u.storeName = body.storeName;
            if (body.storeDesc !== undefined) u.storeDesc = body.storeDesc;
            if (body.storeImage !== undefined) u.storeImage = body.storeImage;
            saveJSON(`user_${user.username}.json`, u);
            res.end('{"ok":true}');
            return;
        }
        // GET /api/marketplace/user/:id — public user info for store page
        if (/^\/api\/marketplace\/user\/[^/]+$/.test(path) && req.method === 'GET') {
            const uid = path.split('/')[4];
            const u = loadJSON(`user_${uid}.json`, {});
            res.end(JSON.stringify({ ok: true, storeName: u.storeName || u.nickname || uid, storeDesc: u.storeDesc || '', storeImage: u.storeImage || u.profileImage || '', nickname: u.nickname || uid, email: uid + '@crowny.org' }));
            return;
        }

        // GET /api/marketplace/store/:sellerId — 판매자 상점 데이터
        if (path.startsWith('/api/marketplace/store/') && req.method === 'GET') {
            const sellerId = path.split('/')[4];
            if (!sellerId) { res.statusCode = 400; res.end('{"error":"missing sellerId"}'); return; }
            const mkDir = pathModule.join(DATA_DIR, 'marketplace');
            if (!fs.existsSync(mkDir)) fs.mkdirSync(mkDir, { recursive: true });
            const productsFile = pathModule.join(mkDir, 'products.json');
            const ordersFile = pathModule.join(mkDir, 'orders.json');
            let products = []; try { products = JSON.parse(fs.readFileSync(productsFile, 'utf8')); } catch(e) {}
            let orders = []; try { orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch(e) {}
            const sellerProducts = products.filter(p => p.sellerId === sellerId && !p.deleted);
            const sellerOrders = orders.filter(o => o.sellerId === sellerId);
            const sellerInfo = users[sellerId] || {};
            const storeSettings = loadJSON('marketplace/store_settings.json', {});
            res.end(JSON.stringify({
                seller: { username: sellerId, displayName: sellerInfo.displayName || sellerId, photoURL: sellerInfo.photoURL || '', storeSettings: storeSettings[sellerId] || {} },
                products: sellerProducts,
                orders: sellerOrders,
                orderCount: sellerOrders.length
            }));
            return;
        }

        // POST /api/marketplace/cart/checkout — 장바구니 결제
        if (path === '/api/marketplace/cart/checkout' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth"}'); return; }
            const { items, currency } = body;
            if (!items || !Array.isArray(items) || items.length === 0) { res.statusCode = 400; res.end('{"error":"empty cart"}'); return; }
            const cur = currency || 'CRM';
            const totalAmount = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
            // Check balance
            const wallet = getWallet(user.username);
            if (!wallet || (wallet.balances[cur] || 0) < totalAmount) { res.statusCode = 400; res.end(JSON.stringify({ error: `Insufficient balance (${cur})` })); return; }
            // Deduct buyer balance
            walletTransact(user.username, 'send', totalAmount, null, `Market purchase (${items.length} items)`, cur);
            // Create orders and pay sellers
            const mkDir = pathModule.join(DATA_DIR, 'marketplace');
            if (!fs.existsSync(mkDir)) fs.mkdirSync(mkDir, { recursive: true });
            const ordersFile = pathModule.join(mkDir, 'orders.json');
            let orders = []; try { orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch(e) {}
            const newOrders = [];
            for (const item of items) {
                const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
                const order = { id: orderId, buyerId: user.username, sellerId: item.sellerId, productId: item.productId, productName: item.name || '', price: item.price, qty: item.qty || 1, currency: cur, status: 'paid', createdAt: Date.now() };
                orders.push(order);
                newOrders.push(order);
                // Pay seller
                if (item.sellerId && item.sellerId !== user.username) {
                    walletTransact(item.sellerId, 'deposit', item.price * (item.qty || 1), null, `Sale revenue: ${item.name || item.productId}`, cur);
                }
            }
            fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
            // Clear buyer's cart
            const cartsFile = pathModule.join(mkDir, 'carts.json');
            let carts = {}; try { carts = JSON.parse(fs.readFileSync(cartsFile, 'utf8')); } catch(e) {}
            carts[user.username] = [];
            fs.writeFileSync(cartsFile, JSON.stringify(carts, null, 2));
            res.end(JSON.stringify({ ok: true, orders: newOrders, totalPaid: totalAmount }));
            return;
        }

        // ═══ 독립 소셜 피드 ═══

        // GET /api/social/feed — 소셜 피드 조회
        if (path === '/api/social/feed' && req.method === 'GET') {
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) { /* first run */ }
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
            if (!rateLimit(clientIp, 'social-post', 10)) { res.statusCode = 429; res.end('{"error":"Too many requests"}'); return; }
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const text = (body.text || '').trim();
            const youtubeUrl = (body.youtubeUrl || '').trim();
            const imageData = (body.image || '').trim(); // base64 or CIF
            if (!text && !youtubeUrl && !imageData) { res.statusCode = 400; res.end('{"error":"Please enter content"}'); return; }

            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) { /* first run */ }

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
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) { /* first run */ }
            const post = posts.find(p => p.id === body.postId);
            if (!post) { res.statusCode = 404; res.end('{"error":"Post not found"}'); return; }
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
            try { comments = JSON.parse(fs.readFileSync(commFile, 'utf8')); } catch(e) { /* first run */ }
            const enriched = comments.map(c => ({ ...c, authorName: users[c.author]?.displayName || c.author }));
            res.end(JSON.stringify(enriched));
            return;
        }

        // POST /api/social/comment — 댓글 작성
        if (path === '/api/social/comment' && req.method === 'POST') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            if (!body.postId || !body.text?.trim()) { res.statusCode = 400; res.end('{"error":"Please enter content"}'); return; }
            const commFile = pathModule.join(SOCIAL_DIR, `comments_${body.postId}.json`);
            let comments = [];
            try { comments = JSON.parse(fs.readFileSync(commFile, 'utf8')); } catch(e) { /* first run */ }
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
            } catch(e) { console.warn('[SAVE]', e.message); }
            res.end(JSON.stringify({ ok: true, comment: { ...comment, authorName: user.displayName || user.username } }));
            return;
        }

        // DELETE /api/social/post — 게시물 삭제
        if (path === '/api/social/post' && req.method === 'DELETE') {
            const user = getAuth(req);
            if (!user) { res.statusCode = 401; res.end('{"error":"auth required"}'); return; }
            const postsFile = pathModule.join(SOCIAL_DIR, 'posts.json');
            let posts = [];
            try { posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')); } catch(e) { /* first run */ }
            const idx = posts.findIndex(p => p.id === body.postId && p.author === user.username);
            if (idx < 0) { res.statusCode = 404; res.end('{"error":"Post not found or permission denied"}'); return; }
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

// ── S2: Auto daily backup ──
(function scheduleAutoBackup() {
    const BACKUP_DIR = pathModule.join(DATA_DIR, 'backups');
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    function runBackup() {
        try {
            const date = new Date().toISOString().split('T')[0];
            const backupFile = pathModule.join(BACKUP_DIR, `auto-${date}.json`);
            if (fs.existsSync(backupFile)) return; // already backed up today
            const data = exportAllData();
            const tmp = backupFile + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(data));
            fs.renameSync(tmp, backupFile);
            // Keep only last 7 days
            const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('auto-')).sort();
            while (files.length > 7) { fs.unlinkSync(pathModule.join(BACKUP_DIR, files.shift())); }
            console.log('[BACKUP] Auto backup:', date);
        } catch (e) { console.warn('[BACKUP] Failed:', e.message); }
    }

    runBackup(); // backup on startup
    setInterval(runBackup, 6 * 60 * 60 * 1000); // every 6 hours
})();

// ── Graceful shutdown ──
function shutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    server.close(() => {
        console.log('[SERVER] HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => { console.warn('[SERVER] Forced shutdown'); process.exit(1); }, 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => { console.error('[FATAL] Uncaught:', err); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL] Unhandled promise:', reason); });
