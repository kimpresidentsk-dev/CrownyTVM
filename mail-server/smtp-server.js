// smtp-server.js — SMTP 수신 서버 (Node.js net만 사용)
// CrownyTVM 크라우니셀 메일 시스템
// RFC 5321 최소 구현 — crowny.org 수신용
'use strict';

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { parseMimeEmail } = require('./mime');
const store = require('./mail-store');
const { calcTrust, MAIL_STATE } = require('./ternary');

const LOG_DIR = path.join(__dirname, '..', 'mail-data', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log('[SMTP-IN]', msg);
    fs.appendFileSync(path.join(LOG_DIR, 'smtp-in.log'), line + '\n');
}

// SMTP 세션 상태 머신
class SmtpSession {
    constructor(socket, domain) {
        this.socket = socket;
        this.domain = domain;
        this.state = 'GREETING';
        this.from = '';
        this.to = [];
        this.data = '';
        this.inData = false;
        this.buffer = '';
        this.ehlo = '';
        this.tlsUsed = socket.encrypted || false;
    }

    send(code, msg) {
        try {
            this.socket.write(`${code} ${msg}\r\n`);
        } catch (e) { /* 연결 끊김 */ }
    }

    reset() {
        this.from = '';
        this.to = [];
        this.data = '';
        this.inData = false;
    }

    processLine(line) {
        // DATA 모드
        if (this.inData) {
            if (line === '.') {
                this.inData = false;
                this.deliverMail();
                this.send(250, 'OK message queued');
                this.reset();
                return;
            }
            // dot-stuffing 해제
            this.data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
            return;
        }

        const cmd = line.slice(0, 4).toUpperCase();
        const arg = line.slice(5).trim();

        switch (cmd) {
            case 'EHLO':
            case 'HELO':
                this.ehlo = arg;
                this.state = 'READY';
                if (cmd === 'EHLO') {
                    this.send(250, `${this.domain} Hello ${arg}`);
                    // 확장 지원 목록
                    this.socket.write(`250-SIZE 5242880\r\n`);
                    this.socket.write(`250 8BITMIME\r\n`);
                } else {
                    this.send(250, `${this.domain} Hello ${arg}`);
                }
                break;

            case 'MAIL':
                if (this.state !== 'READY') { this.send(503, 'Bad sequence'); return; }
                const fromMatch = line.match(/FROM:\s*<([^>]*)>/i);
                if (!fromMatch) { this.send(501, 'Syntax error in MAIL FROM'); return; }
                this.from = fromMatch[1];
                this.state = 'MAIL';
                this.send(250, 'OK');
                break;

            case 'RCPT':
                if (this.state !== 'MAIL' && this.state !== 'RCPT') { this.send(503, 'Bad sequence'); return; }
                const toMatch = line.match(/TO:\s*<([^>]*)>/i);
                if (!toMatch) { this.send(501, 'Syntax error in RCPT TO'); return; }
                const recipient = toMatch[1].toLowerCase();
                // crowny.org 도메인만 수신
                if (!recipient.endsWith('@' + this.domain) && !recipient.endsWith('@crowny.org')) {
                    this.send(550, 'No such user');
                    return;
                }
                this.to.push(recipient);
                this.state = 'RCPT';
                this.send(250, 'OK');
                break;

            case 'DATA':
                if (this.state !== 'RCPT' || this.to.length === 0) { this.send(503, 'Bad sequence'); return; }
                this.inData = true;
                this.send(354, 'Start mail input; end with <CRLF>.<CRLF>');
                break;

            case 'RSET':
                this.reset();
                this.state = 'READY';
                this.send(250, 'OK');
                break;

            case 'NOOP':
                this.send(250, 'OK');
                break;

            case 'QUIT':
                this.send(221, `${this.domain} Bye`);
                this.socket.end();
                break;

            case 'VRFY':
                this.send(252, 'Cannot VRFY user');
                break;

            default:
                this.send(500, 'Command not recognized');
        }
    }

    deliverMail() {
        try {
            const parsed = parseMimeEmail(this.data);
            const subject = parsed.headers.subject || '(제목 없음)';
            const body = parsed.body || '';

            log(`DELIVER from=${this.from} to=${this.to.join(',')} subject="${subject.slice(0, 50)}"`);

            // 크기 제한: 본문 4000자, 첨부 1MB
            const trimmedBody = body.slice(0, 4000);
            const filteredAtts = (parsed.attachments || []).filter(a => a.size <= 1048576);

            // 각 수신자에게 배달
            for (const recipient of this.to) {
                const mail = store.createMailCell(this.from, recipient, subject, trimmedBody, filteredAtts);
                mail.state = MAIL_STATE.DELIVERED;
                mail.rawHeaders = parsed.headers;
                mail.trust = calcTrust({
                    dkimVerified: false, // TODO: DKIM 검증
                    spfPass: false,      // TODO: SPF 검증
                    tlsUsed: this.tlsUsed,
                    isInternal: this.from.endsWith('@crowny.org'),
                });
                mail.externalFrom = !this.from.endsWith('@crowny.org');
                store.saveMail(mail, 'inbox');
                log(`SAVED mail ${mail.id} for ${recipient}`);
            }
        } catch (e) {
            log(`DELIVER ERROR: ${e.message}`);
        }
    }
}

// SMTP 서버 시작
function startSmtpServer(options) {
    const port = options.port || 25;
    const domain = options.domain || 'crowny.org';

    const server = net.createServer((socket) => {
        const remote = socket.remoteAddress + ':' + socket.remotePort;
        log(`CONNECTION from ${remote}`);

        const session = new SmtpSession(socket, domain);
        session.send(220, `${domain} CrownyTVM ESMTP ready`);

        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString();
            let idx;
            while ((idx = buffer.indexOf('\r\n')) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                session.processLine(line);
            }
            // \n 만 오는 경우도 처리
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx).replace(/\r$/, '');
                buffer = buffer.slice(idx + 1);
                session.processLine(line);
            }
        });

        socket.on('error', (err) => {
            log(`SOCKET ERROR ${remote}: ${err.message}`);
        });

        socket.on('close', () => {
            log(`DISCONNECT ${remote}`);
        });

        // 5분 타임아웃
        socket.setTimeout(300000, () => {
            session.send(421, 'Timeout');
            socket.end();
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EACCES') {
            log(`포트 ${port} 권한 부족 — sudo 필요 (포트 25는 root 권한 필요)`);
        } else if (err.code === 'EADDRINUSE') {
            log(`포트 ${port} 이미 사용 중`);
        } else {
            log(`서버 오류: ${err.message}`);
        }
    });

    server.listen(port, '0.0.0.0', () => {
        log(`SMTP 수신 서버 시작: 0.0.0.0:${port} (${domain})`);
    });

    return server;
}

module.exports = { startSmtpServer, SmtpSession };
