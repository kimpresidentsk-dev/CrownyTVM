// mail-store.js — 셀 기반 메일 저장소
// CrownyTVM 크라우니셀 메일 시스템
// mail-data/ 디렉토리에 독립 저장 (이식·백업 용이)
'use strict';

const fs = require('fs');
const path = require('path');
const { generateMailId, toTernary, ternaryHash, MAIL_STATE } = require('./ternary');

const DATA_DIR = path.join(__dirname, '..', 'mail-data');
const INBOX_DIR = path.join(DATA_DIR, 'inbox');
const SENT_DIR = path.join(DATA_DIR, 'sent');
const QUEUE_DIR = path.join(DATA_DIR, 'queue');

// 디렉토리 보장
[DATA_DIR, INBOX_DIR, SENT_DIR, QUEUE_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// 메일 셀 생성 (type 406 = 메일)
function createMailCell(from, to, subject, body, attachments) {
    const id = generateMailId();
    const now = Date.now();
    return {
        id,
        type: 406,
        from,
        to: Array.isArray(to) ? to : [to],
        subject: (subject || '').slice(0, 200),
        body: (body || '').slice(0, 4000),
        attachments: (attachments || []).filter(a => a.size <= 1048576), // 1MB
        state: MAIL_STATE.DRAFT,
        trust: 0,
        hash: ternaryHash(from + to + subject + body),
        created: now,
        modified: now,
        ternaryTs: toTernary(now),
    };
}

// 메일 저장 (inbox / sent / queue)
function saveMail(mail, folder) {
    const dir = folder === 'sent' ? SENT_DIR : folder === 'queue' ? QUEUE_DIR : INBOX_DIR;
    const filename = mail.id + '.json';
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(mail, null, 2), 'utf8');
    return mail.id;
}

// 메일 읽기
function readMail(id, folder) {
    const dir = folder === 'sent' ? SENT_DIR : folder === 'queue' ? QUEUE_DIR : INBOX_DIR;
    const filepath = path.join(dir, id + '.json');
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

// 폴더 내 메일 목록 (최신순)
function listMails(folder, user) {
    const dir = folder === 'sent' ? SENT_DIR : folder === 'queue' ? QUEUE_DIR : INBOX_DIR;
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const mails = [];
    for (const f of files) {
        try {
            const mail = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            // 사용자 필터링
            if (user) {
                const addr = user.includes('@') ? user : user + '@crowny.org';
                if (folder === 'sent') {
                    if (mail.from !== addr) continue;
                } else {
                    if (!mail.to.includes(addr)) continue;
                }
            }
            mails.push({
                id: mail.id,
                from: mail.from,
                to: mail.to,
                subject: mail.subject,
                state: mail.state,
                created: mail.created,
                read: mail.read || false,
            });
        } catch (e) { /* 손상 파일 무시 */ }
    }
    return mails.sort((a, b) => b.created - a.created);
}

// 메일 상태 업데이트
function updateMailState(id, folder, newState) {
    const mail = readMail(id, folder);
    if (!mail) return false;
    mail.state = newState;
    mail.modified = Date.now();
    saveMail(mail, folder);
    return true;
}

// 읽음 처리
function markRead(id, folder) {
    const mail = readMail(id, folder);
    if (!mail) return false;
    mail.read = true;
    mail.modified = Date.now();
    saveMail(mail, folder);
    return true;
}

// 메일 삭제
function deleteMail(id, folder) {
    const dir = folder === 'sent' ? SENT_DIR : folder === 'queue' ? QUEUE_DIR : INBOX_DIR;
    const filepath = path.join(dir, id + '.json');
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        return true;
    }
    return false;
}

// 큐에서 inbox/sent로 이동
function moveMail(id, fromFolder, toFolder) {
    const mail = readMail(id, fromFolder);
    if (!mail) return false;
    saveMail(mail, toFolder);
    deleteMail(id, fromFolder);
    return true;
}

// 통계
function getStats(user) {
    const inbox = listMails('inbox', user);
    const sent = listMails('sent', user);
    const unread = inbox.filter(m => !m.read).length;
    return { inbox: inbox.length, sent: sent.length, unread, queue: listMails('queue').length };
}

module.exports = {
    createMailCell, saveMail, readMail, listMails,
    updateMailState, markRead, deleteMail, moveMail, getStats,
    DATA_DIR, INBOX_DIR, SENT_DIR, QUEUE_DIR,
};
