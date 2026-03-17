// index.js — CrownyTVM 독립 메일 서버 통합 진입점
// 한선씨 고유코드 · 4상균형3진법 · 순수 Node.js
// npm 의존성 없음 — 개발도상국 이식 가능
'use strict';

const { startSmtpServer } = require('./smtp-server');
const { sendMail } = require('./smtp-client');
const { enqueue, startQueueProcessor } = require('./queue');
const store = require('./mail-store');
const { buildTextEmail, buildMimeEmail } = require('./mime');
const { generateDkimKeys, getDkimDnsRecord, signEmail } = require('./dkim');
const { generateMailId, toTernary, fromTernary, MAIL_STATE, calcTrust } = require('./ternary');

const DOMAIN = 'crowny.org';
const SMTP_PORT = 25;

// ═══════════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════════

function init() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  CrownyTVM 독립 메일 서버 v1.0          ║');
    console.log('║  한선씨 고유코드 · 4상균형3진법          ║');
    console.log('║  도메인: ' + DOMAIN + '                       ║');
    console.log('╚══════════════════════════════════════════╝');

    // DKIM 키 생성 (없으면)
    const keys = generateDkimKeys(DOMAIN);
    console.log('[INIT] DKIM 키 준비 완료');

    // DNS 설정 안내
    const dkimRecord = getDkimDnsRecord(DOMAIN);
    console.log('\n[DNS 설정 필요]');
    console.log('─'.repeat(50));
    console.log(`MX    ${DOMAIN}  →  mail.${DOMAIN}  (우선순위 10)`);
    console.log(`A     mail.${DOMAIN}  →  112.144.147.144`);
    console.log(`TXT   ${DOMAIN}  →  "v=spf1 ip4:112.144.147.144 a mx ~all"`);
    console.log(`TXT   crowny._domainkey.${DOMAIN}  →`);
    if (dkimRecord) console.log(`      "${dkimRecord.slice(0, 80)}..."`);
    console.log(`TXT   _dmarc.${DOMAIN}  →  "v=DMARC1; p=none; rua=mailto:postmaster@${DOMAIN}"`);
    console.log('─'.repeat(50));

    return keys;
}

// ═══════════════════════════════════════════════
// SMTP 수신 서버 시작
// ═══════════════════════════════════════════════

function startInbound() {
    return startSmtpServer({ port: SMTP_PORT, domain: DOMAIN });
}

// ═══════════════════════════════════════════════
// 큐 프로세서 시작
// ═══════════════════════════════════════════════

function startOutbound() {
    return startQueueProcessor(DOMAIN, 60000);
}

// ═══════════════════════════════════════════════
// API 핸들러 (server.js에서 호출)
// ═══════════════════════════════════════════════

// 메일 발송 API
function apiSendMail(fromUser, to, subject, body, attachments) {
    const fromAddr = fromUser.includes('@') ? fromUser : fromUser + '@' + DOMAIN;
    const toAddrs = (Array.isArray(to) ? to : [to]).map(t =>
        t.includes('@') ? t : t + '@' + DOMAIN
    );

    // 제한 검사
    if ((body || '').length > 4000) {
        return { error: '본문은 4000자 이하만 가능합니다' };
    }
    if (attachments) {
        const oversized = attachments.filter(a => (a.size || 0) > 1048576);
        if (oversized.length > 0) {
            return { error: '첨부파일은 1MB 이하만 가능합니다' };
        }
    }

    // 메일 셀 생성
    const mail = store.createMailCell(fromAddr, toAddrs, subject, body, attachments);

    // 내부 메일 즉시 배달 + 외부는 큐
    const hasExternal = toAddrs.some(t => !t.endsWith('@' + DOMAIN));

    if (hasExternal) {
        // 큐에 추가 (내부+외부 모두 큐에서 처리)
        enqueue(mail);
    } else {
        // 내부만: 즉시 배달
        for (const rcpt of toAddrs) {
            const inboxMail = { ...mail, to: [rcpt], state: MAIL_STATE.DELIVERED };
            store.saveMail(inboxMail, 'inbox');
        }
        mail.state = MAIL_STATE.SENT;
        mail.sentAt = Date.now();
        store.saveMail(mail, 'sent');
    }

    return { success: true, id: mail.id, ternaryId: mail.ternaryTs };
}

// 편지함 조회 API
function apiListMails(username, folder) {
    return store.listMails(folder || 'inbox', username);
}

// 메일 읽기 API
function apiReadMail(id, folder) {
    const mail = store.readMail(id, folder || 'inbox');
    if (mail && folder !== 'sent') {
        store.markRead(id, folder || 'inbox');
    }
    return mail;
}

// 메일 삭제 API
function apiDeleteMail(id, folder) {
    return store.deleteMail(id, folder || 'inbox');
}

// 통계 API
function apiStats(username) {
    return store.getStats(username);
}

// ═══════════════════════════════════════════════
// 독립 실행 모드 (node mail-server/index.js)
// ═══════════════════════════════════════════════

if (require.main === module) {
    const keys = init();

    // SMTP 수신 (포트 25 — root 필요)
    try {
        startInbound();
    } catch (e) {
        console.error('[SMTP] 수신 서버 시작 실패:', e.message);
        console.log('[TIP] sudo node mail-server/index.js (포트 25는 root 권한 필요)');
    }

    // 발신 큐 프로세서
    startOutbound();

    console.log('\n[STATUS] 메일 서버 실행 중...');
    console.log(`  수신: SMTP :${SMTP_PORT}`);
    console.log(`  발신: 큐 프로세서 (1분 간격)`);
    console.log(`  저장: ${store.DATA_DIR}`);
    console.log('  Ctrl+C로 종료\n');
}

module.exports = {
    init, startInbound, startOutbound,
    apiSendMail, apiListMails, apiReadMail, apiDeleteMail, apiStats,
    DOMAIN,
};
