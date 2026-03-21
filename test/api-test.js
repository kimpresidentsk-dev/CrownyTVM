#!/usr/bin/env node
// ===== CrownyTVM API E2E Test Suite =====
// Usage: node test/api-test.js [base_url]
// Default: https://crowny.org

const https = require('https');
const http = require('http');

const BASE = process.argv[2] || 'https://crowny.org';
const agent = BASE.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined;

let passed = 0, failed = 0, token = null;
const testUser = 'e2etest_' + Date.now().toString(36);

function req(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const mod = url.protocol === 'https:' ? https : http;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const data = body ? JSON.stringify(body) : null;

        const r = mod.request(url, { method, headers, agent }, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
                catch { resolve({ status: res.statusCode, data: buf }); }
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

function assert(name, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  [PASS] ${name}`);
    } else {
        failed++;
        console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    }
}

async function run() {
    console.log(`\nCrownyTVM API Test — ${BASE}\n`);

    // ── Health ──
    console.log('Health:');
    const h = await req('GET', '/api/health');
    assert('GET /api/health returns 200', h.status === 200);
    assert('status is ok', h.data.status === 'ok');
    assert('has uptime', typeof h.data.uptime === 'number');
    assert('has memory', typeof h.data.memory === 'string');

    // ── Register ──
    console.log('\nAuth:');
    const reg = await req('POST', '/api/register', { username: testUser, password: 'testpass123', displayName: 'E2E Tester' });
    assert('POST /api/register succeeds', reg.data.success === true);
    assert('returns email', reg.data.email === testUser + '@crowny.org');
    assert('returns cellId', typeof reg.data.cellId === 'number');

    // ── Login ──
    const login = await req('POST', '/api/login', { username: testUser, password: 'testpass123' });
    assert('POST /api/login succeeds', login.data.success === true);
    assert('returns token', typeof login.data.token === 'string');
    token = login.data.token;

    // ── Login fail ──
    const badLogin = await req('POST', '/api/login', { username: testUser, password: 'wrong' });
    assert('bad password returns error', !!badLogin.data.error);

    // ── Profile ──
    console.log('\nProfile:');
    const prof = await req('GET', '/api/profile');
    assert('GET /api/profile returns user', prof.data.username === testUser);
    assert('has displayName', prof.data.displayName === 'E2E Tester');

    // ── Change Password ──
    const chpw = await req('POST', '/api/change-password', { oldPassword: 'testpass123', newPassword: 'newpass456' });
    assert('POST /api/change-password succeeds', chpw.data.success === true);
    const relogin = await req('POST', '/api/login', { username: testUser, password: 'newpass456' });
    assert('login with new password works', relogin.data.success === true);
    token = relogin.data.token;

    // ── Wallet ──
    console.log('\nWallet:');
    const wallet = await req('GET', '/api/wallet');
    assert('GET /api/wallet returns balances', !!wallet.data.balances);
    assert('has CRM balance', wallet.data.balances.CRM !== undefined);

    // ── Quiz ──
    console.log('\nQuiz:');
    const quiz = await req('GET', '/api/bible/quiz');
    assert('GET /api/bible/quiz returns question', !!quiz.data.quizId);
    assert('has options array', Array.isArray(quiz.data.options));
    assert('has 4 options', quiz.data.options.length === 4);
    assert('has round info', !!quiz.data.round);

    const answer = await req('POST', '/api/bible/answer', { quizId: quiz.data.quizId, selectedIndex: 0 });
    assert('POST /api/bible/answer returns result', answer.data.correct !== undefined);

    // ── Contacts ──
    console.log('\nContacts:');
    const contacts = await req('GET', '/api/contacts');
    assert('GET /api/contacts returns array', Array.isArray(contacts.data.contacts || contacts.data));

    // ── Messages ──
    console.log('\nMessenger:');
    const chatList = await req('GET', '/api/chat/list');
    assert('GET /api/chat/list succeeds', chatList.status === 200);

    // ── Mail ──
    console.log('\nMail:');
    const inbox = await req('GET', '/api/mail/inbox?folder=inbox');
    assert('GET /api/mail/inbox succeeds', inbox.status === 200);

    // ── Social ──
    console.log('\nSocial:');
    const feed = await req('GET', '/api/social/feed');
    assert('GET /api/social/feed succeeds', feed.status === 200);

    // ── Rate Limiting ──
    console.log('\nRate Limiting:');
    let rateLimited = false;
    for (let i = 0; i < 12; i++) {
        const r = await req('POST', '/api/login', { username: 'nonexistent', password: 'x' });
        if (r.status === 429) { rateLimited = true; break; }
    }
    assert('login rate limit triggers', rateLimited);

    // ── Client Error Endpoint ──
    console.log('\nMonitoring:');
    const errReport = await req('POST', '/api/client-error', { message: 'E2E test error', source: 'api-test.js', line: 1 });
    assert('POST /api/client-error accepts report', errReport.data.ok === true);

    const metrics = await req('POST', '/api/metrics', { lang: 'en', connection: '4g', loadTime: 1200, fcp: 300 });
    assert('POST /api/metrics accepts data', metrics.data.ok === true);

    // ── Unauthorized Access ──
    console.log('\nSecurity:');
    const savedToken = token;
    token = null;
    const noAuth = await req('GET', '/api/profile');
    assert('profile without token returns 401', noAuth.status === 401);
    token = savedToken;

    const backup = await req('GET', '/api/backup');
    assert('non-admin backup returns 403', backup.status === 403);

    // ── Summary ──
    console.log(`\n${'='.repeat(40)}`);
    console.log(`  PASSED: ${passed}`);
    console.log(`  FAILED: ${failed}`);
    console.log(`  TOTAL:  ${passed + failed}`);
    console.log(`${'='.repeat(40)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Test runner error:', e); process.exit(1); });
