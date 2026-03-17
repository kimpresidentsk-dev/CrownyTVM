// mime.js — MIME 파싱 및 생성 (순수 Node.js)
// CrownyTVM 크라우니셀 메일 시스템
'use strict';

const crypto = require('crypto');

// MIME boundary 생성
function makeBoundary() {
    return '----CrownyMail_' + crypto.randomBytes(16).toString('hex');
}

// 간단한 텍스트 이메일 생성
function buildTextEmail(from, to, subject, body, messageId) {
    const date = new Date().toUTCString();
    const lines = [
        `From: ${from}`,
        `To: ${Array.isArray(to) ? to.join(', ') : to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Date: ${date}`,
        `Message-ID: <${messageId || crypto.randomUUID()}@crowny.org>`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        `X-Mailer: CrownyTVM-Mail/1.0`,
        ``,
        Buffer.from(body).toString('base64').match(/.{1,76}/g).join('\r\n'),
    ];
    return lines.join('\r\n');
}

// 첨부파일 포함 이메일 생성
function buildMimeEmail(from, to, subject, body, attachments, messageId) {
    if (!attachments || attachments.length === 0) {
        return buildTextEmail(from, to, subject, body, messageId);
    }

    const boundary = makeBoundary();
    const date = new Date().toUTCString();

    const headers = [
        `From: ${from}`,
        `To: ${Array.isArray(to) ? to.join(', ') : to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Date: ${date}`,
        `Message-ID: <${messageId || crypto.randomUUID()}@crowny.org>`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        `X-Mailer: CrownyTVM-Mail/1.0`,
    ].join('\r\n');

    // 본문 파트
    const textPart = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        Buffer.from(body).toString('base64').match(/.{1,76}/g).join('\r\n'),
    ].join('\r\n');

    // 첨부 파트
    const attParts = attachments.map(att => {
        const b64 = (att.data instanceof Buffer ? att.data : Buffer.from(att.data, 'base64')).toString('base64');
        return [
            `--${boundary}`,
            `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`,
            `Content-Disposition: attachment; filename="${att.filename}"`,
            `Content-Transfer-Encoding: base64`,
            ``,
            b64.match(/.{1,76}/g).join('\r\n'),
        ].join('\r\n');
    }).join('\r\n');

    return headers + '\r\n\r\n' + textPart + '\r\n' + attParts + '\r\n--' + boundary + '--\r\n';
}

// 수신 MIME 파싱 (간소화)
function parseMimeEmail(raw) {
    const result = { headers: {}, body: '', attachments: [] };

    // 헤더/본문 분리
    const sepIdx = raw.indexOf('\r\n\r\n');
    if (sepIdx < 0) {
        // \n\n 폴백
        const sepIdx2 = raw.indexOf('\n\n');
        if (sepIdx2 < 0) { result.body = raw; return result; }
        result.headers = parseHeaders(raw.slice(0, sepIdx2));
        result.body = raw.slice(sepIdx2 + 2);
    } else {
        result.headers = parseHeaders(raw.slice(0, sepIdx));
        result.body = raw.slice(sepIdx + 4);
    }

    // Subject 디코딩
    if (result.headers.subject) {
        result.headers.subject = decodeRfc2047(result.headers.subject);
    }

    // multipart 처리
    const ct = result.headers['content-type'] || '';
    const boundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);
    if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = result.body.split('--' + boundary);
        result.body = '';

        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (part.startsWith('--')) break; // 종료 경계

            const pSep = part.indexOf('\r\n\r\n') >= 0 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n');
            if (pSep < 0) continue;
            const pHeaders = parseHeaders(part.slice(0, pSep));
            let pBody = part.slice(pSep + (part.indexOf('\r\n\r\n') >= 0 ? 4 : 2)).trim();

            const pCt = pHeaders['content-type'] || '';
            const pDisp = pHeaders['content-disposition'] || '';
            const cte = pHeaders['content-transfer-encoding'] || '';

            if (pDisp.includes('attachment') || (pCt && !pCt.startsWith('text/'))) {
                const fnMatch = pDisp.match(/filename="?([^";\r\n]+)"?/i) || pCt.match(/name="?([^";\r\n]+)"?/i);
                const filename = fnMatch ? fnMatch[1].trim() : 'attachment';
                let data = pBody;
                if (cte.toLowerCase() === 'base64') {
                    data = pBody.replace(/\s/g, '');
                }
                result.attachments.push({
                    filename,
                    contentType: pCt.split(';')[0].trim(),
                    data,
                    size: cte.toLowerCase() === 'base64' ? Math.floor(data.length * 3 / 4) : data.length,
                });
            } else {
                // 텍스트 본문
                if (cte.toLowerCase() === 'base64') {
                    result.body = Buffer.from(pBody.replace(/\s/g, ''), 'base64').toString('utf8');
                } else if (cte.toLowerCase() === 'quoted-printable') {
                    result.body = decodeQP(pBody);
                } else {
                    result.body = pBody;
                }
            }
        }
    } else {
        // 단일 파트
        const cte = result.headers['content-transfer-encoding'] || '';
        if (cte.toLowerCase() === 'base64') {
            result.body = Buffer.from(result.body.replace(/\s/g, ''), 'base64').toString('utf8');
        } else if (cte.toLowerCase() === 'quoted-printable') {
            result.body = decodeQP(result.body);
        }
    }

    return result;
}

// 헤더 파싱
function parseHeaders(headerBlock) {
    const result = {};
    const lines = headerBlock.split(/\r?\n/);
    let current = '';
    for (const line of lines) {
        if (/^\s/.test(line) && current) {
            result[current] += ' ' + line.trim();
        } else {
            const idx = line.indexOf(':');
            if (idx > 0) {
                current = line.slice(0, idx).toLowerCase().trim();
                result[current] = line.slice(idx + 1).trim();
            }
        }
    }
    return result;
}

// RFC 2047 디코딩 (=?charset?encoding?text?=)
function decodeRfc2047(str) {
    return str.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi, (_, charset, enc, text) => {
        if (enc.toUpperCase() === 'B') {
            return Buffer.from(text, 'base64').toString('utf8');
        }
        return decodeQP(text.replace(/_/g, ' '));
    });
}

// Quoted-Printable 디코딩
function decodeQP(str) {
    return str.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    }).replace(/=\r?\n/g, '');
}

module.exports = { buildTextEmail, buildMimeEmail, parseMimeEmail, makeBoundary };
