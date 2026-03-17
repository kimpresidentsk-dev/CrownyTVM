// smtp-client.js — SMTP 발신 클라이언트 (Node.js net/tls/dns만 사용)
// CrownyTVM 크라우니셀 메일 시스템
// MX 레코드 조회 → 직접 SMTP 연결 → 메일 전송
'use strict';

const net = require('net');
const tls = require('tls');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'mail-data', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log('[SMTP-OUT]', msg);
    fs.appendFileSync(path.join(LOG_DIR, 'smtp-out.log'), line + '\n');
}

// MX 레코드 조회
function resolveMX(domain) {
    return new Promise((resolve, reject) => {
        dns.resolveMx(domain, (err, addresses) => {
            if (err) return reject(err);
            // 우선순위 낮은 순 정렬
            addresses.sort((a, b) => a.priority - b.priority);
            resolve(addresses);
        });
    });
}

// SMTP 명령 전송 + 응답 대기
function smtpCommand(socket, cmd) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SMTP timeout')), 30000);

        function onData(chunk) {
            clearTimeout(timeout);
            socket.removeListener('data', onData);
            const response = chunk.toString();
            const code = parseInt(response.slice(0, 3));
            resolve({ code, response: response.trim() });
        }

        socket.on('data', onData);
        socket.on('error', (e) => { clearTimeout(timeout); reject(e); });

        if (cmd) {
            socket.write(cmd + '\r\n');
        }
    });
}

// 초기 배너 읽기
function readBanner(socket) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Banner timeout')), 15000);

        function onData(chunk) {
            clearTimeout(timeout);
            socket.removeListener('data', onData);
            const response = chunk.toString();
            const code = parseInt(response.slice(0, 3));
            resolve({ code, response: response.trim() });
        }

        socket.on('data', onData);
        socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
}

// STARTTLS 업그레이드
function upgradeToTls(socket, host) {
    return new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({
            socket,
            servername: host,
            rejectUnauthorized: false, // 자체 서명 허용
        }, () => {
            resolve(tlsSocket);
        });
        tlsSocket.on('error', reject);
    });
}

// 메일 전송 (하나의 수신 도메인에 대해)
async function sendToMx(from, recipients, rawEmail, domain) {
    log(`MX lookup: ${domain}`);
    let mxRecords;
    try {
        mxRecords = await resolveMX(domain);
    } catch (e) {
        // MX 없으면 A 레코드로 직접 시도
        log(`MX lookup failed for ${domain}, trying A record`);
        mxRecords = [{ exchange: domain, priority: 10 }];
    }

    let lastError = null;
    for (const mx of mxRecords) {
        try {
            log(`Connecting to ${mx.exchange}:25`);
            const result = await sendViaMx(from, recipients, rawEmail, mx.exchange);
            return result;
        } catch (e) {
            lastError = e;
            log(`MX ${mx.exchange} failed: ${e.message}`);
        }
    }
    throw lastError || new Error('All MX servers failed');
}

// 단일 MX 서버로 전송
async function sendViaMx(from, recipients, rawEmail, mxHost) {
    return new Promise((resolve, reject) => {
        let socket = net.createConnection(25, mxHost);
        let usedTls = false;

        socket.on('error', (e) => reject(e));
        socket.setTimeout(60000, () => {
            socket.destroy();
            reject(new Error('Connection timeout'));
        });

        (async () => {
            try {
                // 배너 읽기
                const banner = await readBanner(socket);
                if (banner.code !== 220) throw new Error(`Bad banner: ${banner.response}`);

                // EHLO
                const ehlo = await smtpCommand(socket, `EHLO crowny.org`);
                if (ehlo.code !== 250) throw new Error(`EHLO failed: ${ehlo.response}`);

                // STARTTLS 시도
                if (ehlo.response.includes('STARTTLS')) {
                    const stls = await smtpCommand(socket, 'STARTTLS');
                    if (stls.code === 220) {
                        socket = await upgradeToTls(socket, mxHost);
                        usedTls = true;
                        // TLS 후 다시 EHLO
                        await smtpCommand(socket, `EHLO crowny.org`);
                    }
                }

                // MAIL FROM
                const mailFrom = await smtpCommand(socket, `MAIL FROM:<${from}>`);
                if (mailFrom.code !== 250) throw new Error(`MAIL FROM failed: ${mailFrom.response}`);

                // RCPT TO (각 수신자)
                for (const rcpt of recipients) {
                    const rcptTo = await smtpCommand(socket, `RCPT TO:<${rcpt}>`);
                    if (rcptTo.code !== 250 && rcptTo.code !== 251) {
                        log(`RCPT TO <${rcpt}> rejected: ${rcptTo.response}`);
                    }
                }

                // DATA
                const data = await smtpCommand(socket, 'DATA');
                if (data.code !== 354) throw new Error(`DATA failed: ${data.response}`);

                // 메일 본문 전송 (dot-stuffing)
                const lines = rawEmail.split('\r\n');
                for (const line of lines) {
                    const safeLine = line.startsWith('.') ? '.' + line : line;
                    socket.write(safeLine + '\r\n');
                }

                // 종료
                const done = await smtpCommand(socket, '.');
                if (done.code !== 250) throw new Error(`Send failed: ${done.response}`);

                // QUIT
                try { await smtpCommand(socket, 'QUIT'); } catch (e) { /* 무시 */ }
                socket.end();

                log(`SENT to ${mxHost} (TLS: ${usedTls})`);
                resolve({ success: true, mxHost, tls: usedTls, response: done.response });
            } catch (e) {
                try { socket.end(); } catch (e2) { /* 무시 */ }
                reject(e);
            }
        })();
    });
}

// 여러 수신자 도메인별로 그룹화 후 전송
async function sendMail(from, recipients, rawEmail) {
    // 도메인별 그룹화
    const groups = {};
    for (const rcpt of recipients) {
        const domain = rcpt.split('@')[1];
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(rcpt);
    }

    const results = [];
    for (const [domain, rcpts] of Object.entries(groups)) {
        // 내부 메일은 직접 저장
        if (domain === 'crowny.org') {
            log(`Internal delivery: ${rcpts.join(',')}`);
            results.push({ domain, success: true, internal: true });
            continue;
        }

        try {
            const result = await sendToMx(from, rcpts, rawEmail, domain);
            results.push({ domain, ...result });
        } catch (e) {
            log(`FAILED to ${domain}: ${e.message}`);
            results.push({ domain, success: false, error: e.message });
        }
    }

    return results;
}

module.exports = { sendMail, sendToMx, resolveMX };
