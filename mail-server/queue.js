// queue.js — 발신 큐 관리자 (재시도 로직)
// CrownyTVM 크라우니셀 메일 시스템
'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./mail-store');
const { sendMail } = require('./smtp-client');
const { buildTextEmail, buildMimeEmail } = require('./mime');
const { signEmail } = require('./dkim');
const { MAIL_STATE } = require('./ternary');

const LOG_DIR = path.join(store.DATA_DIR, 'logs');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log('[QUEUE]', msg);
    fs.appendFileSync(path.join(LOG_DIR, 'queue.log'), line + '\n');
}

// 재시도 간격 (분): 0, 5, 15, 60, 240, 720 (최대 6회)
const RETRY_DELAYS = [0, 5, 15, 60, 240, 720];
const MAX_RETRIES = RETRY_DELAYS.length;

// 큐에 메일 추가
function enqueue(mail) {
    mail.state = MAIL_STATE.QUEUED;
    mail.retries = 0;
    mail.nextRetry = Date.now();
    mail.lastError = null;
    store.saveMail(mail, 'queue');
    log(`ENQUEUED ${mail.id} from=${mail.from} to=${mail.to.join(',')}`);
    return mail.id;
}

// 큐 처리 (한 번 실행)
async function processQueue(domain) {
    const queueDir = store.QUEUE_DIR;
    if (!fs.existsSync(queueDir)) return;

    const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
    const now = Date.now();

    for (const f of files) {
        let mail;
        try {
            mail = JSON.parse(fs.readFileSync(path.join(queueDir, f), 'utf8'));
        } catch (e) { continue; }

        // 아직 재시도 시간 안됨
        if (mail.nextRetry && mail.nextRetry > now) continue;

        log(`PROCESSING ${mail.id} (retry ${mail.retries || 0})`);

        try {
            // 내부 메일과 외부 메일 분리
            const internalRecipients = mail.to.filter(t => t.endsWith('@crowny.org') || t.endsWith('@' + domain));
            const externalRecipients = mail.to.filter(t => !t.endsWith('@crowny.org') && !t.endsWith('@' + domain));

            // 내부 메일 직접 배달
            for (const rcpt of internalRecipients) {
                const inboxMail = { ...mail };
                inboxMail.to = [rcpt];
                inboxMail.state = MAIL_STATE.DELIVERED;
                store.saveMail(inboxMail, 'inbox');
                log(`INTERNAL delivered ${mail.id} → ${rcpt}`);
            }

            // 외부 메일 SMTP 발송
            if (externalRecipients.length > 0) {
                // MIME 이메일 생성
                const rawEmail = mail.attachments && mail.attachments.length > 0
                    ? buildMimeEmail(mail.from, externalRecipients, mail.subject, mail.body, mail.attachments, mail.id)
                    : buildTextEmail(mail.from, externalRecipients, mail.subject, mail.body, mail.id);

                // DKIM 서명
                let signedEmail = rawEmail;
                try {
                    const dkimHeader = signEmail(rawEmail, domain || 'crowny.org');
                    signedEmail = dkimHeader + '\r\n' + rawEmail;
                } catch (e) {
                    log(`DKIM sign failed: ${e.message}`);
                }

                const results = await sendMail(mail.from, externalRecipients, signedEmail);
                const allSuccess = results.every(r => r.success);

                if (!allSuccess) {
                    const failed = results.filter(r => !r.success);
                    throw new Error(failed.map(r => `${r.domain}: ${r.error}`).join('; '));
                }
            }

            // 성공 → sent로 이동
            mail.state = MAIL_STATE.SENT;
            mail.sentAt = Date.now();
            store.saveMail(mail, 'sent');
            store.deleteMail(mail.id, 'queue');
            log(`SENT ${mail.id}`);

        } catch (e) {
            mail.retries = (mail.retries || 0) + 1;
            mail.lastError = e.message;
            log(`FAILED ${mail.id}: ${e.message} (retry ${mail.retries}/${MAX_RETRIES})`);

            if (mail.retries >= MAX_RETRIES) {
                // 최대 재시도 초과 → 실패 처리
                mail.state = MAIL_STATE.BOUNCED;
                store.saveMail(mail, 'sent'); // sent에 실패 기록
                store.deleteMail(mail.id, 'queue');
                log(`BOUNCED ${mail.id} after ${MAX_RETRIES} retries`);

                // 발신자에게 반송 알림
                try {
                    const bounceMail = store.createMailCell(
                        'postmaster@crowny.org',
                        mail.from,
                        `메일 전송 실패: ${mail.subject}`,
                        `다음 메일을 전송할 수 없습니다.\n\n수신: ${mail.to.join(', ')}\n제목: ${mail.subject}\n오류: ${mail.lastError}\n\n재시도 ${MAX_RETRIES}회 실패 후 반송되었습니다.`
                    );
                    bounceMail.state = MAIL_STATE.DELIVERED;
                    store.saveMail(bounceMail, 'inbox');
                } catch (be) { log(`Bounce notification failed: ${be.message}`); }
            } else {
                // 다음 재시도 예약
                const delayMin = RETRY_DELAYS[mail.retries] || 720;
                mail.nextRetry = Date.now() + delayMin * 60000;
                store.saveMail(mail, 'queue');
                log(`RETRY scheduled ${mail.id} in ${delayMin}min`);
            }
        }
    }
}

// 주기적 큐 처리 시작
function startQueueProcessor(domain, intervalMs) {
    intervalMs = intervalMs || 60000; // 기본 1분
    log(`Queue processor started (interval: ${intervalMs / 1000}s)`);

    // 즉시 한 번 실행
    processQueue(domain).catch(e => log(`Queue error: ${e.message}`));

    // 주기적 실행
    const timer = setInterval(() => {
        processQueue(domain).catch(e => log(`Queue error: ${e.message}`));
    }, intervalMs);

    return timer;
}

module.exports = { enqueue, processQueue, startQueueProcessor };
