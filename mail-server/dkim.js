// dkim.js — DKIM 서명 (Node.js crypto만 사용)
// CrownyTVM 크라우니셀 메일 시스템
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DKIM_DIR = path.join(__dirname, '..', 'mail-data', 'dkim');

// DKIM 키 생성 (RSA 2048)
function generateDkimKeys(domain) {
    if (!fs.existsSync(DKIM_DIR)) fs.mkdirSync(DKIM_DIR, { recursive: true });
    const privPath = path.join(DKIM_DIR, domain + '.private.pem');
    const pubPath = path.join(DKIM_DIR, domain + '.public.pem');

    if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
        return {
            privateKey: fs.readFileSync(privPath, 'utf8'),
            publicKey: fs.readFileSync(pubPath, 'utf8'),
        };
    }

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    fs.writeFileSync(privPath, privateKey, 'utf8');
    fs.writeFileSync(pubPath, publicKey, 'utf8');

    return { privateKey, publicKey };
}

// DNS TXT 레코드용 공개키 추출
function getDkimDnsRecord(domain) {
    const pubPath = path.join(DKIM_DIR, domain + '.public.pem');
    if (!fs.existsSync(pubPath)) return null;
    const pem = fs.readFileSync(pubPath, 'utf8');
    // PEM 헤더/푸터 제거, base64만
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    return `v=DKIM1; k=rsa; p=${b64}`;
}

// DKIM-Signature 헤더 생성
function signEmail(rawEmail, domain, selector) {
    selector = selector || 'crowny';
    const privPath = path.join(DKIM_DIR, domain + '.private.pem');
    if (!fs.existsSync(privPath)) {
        generateDkimKeys(domain);
    }
    const privateKey = fs.readFileSync(privPath, 'utf8');

    // 헤더와 본문 분리
    const parts = rawEmail.split('\r\n\r\n');
    const headerBlock = parts[0];
    const bodyBlock = parts.slice(1).join('\r\n\r\n');

    // 본문 해시 (relaxed canonicalization 간소화)
    const bodyCanon = canonicalizeBody(bodyBlock);
    const bodyHash = crypto.createHash('sha256').update(bodyCanon).digest('base64');

    // 서명할 헤더 목록
    const signHeaders = ['from', 'to', 'subject', 'date', 'message-id'];
    const headerLines = parseHeaderLines(headerBlock);
    const signedHeaderNames = [];
    let headerCanon = '';

    for (const name of signHeaders) {
        const val = headerLines[name.toLowerCase()];
        if (val) {
            signedHeaderNames.push(name);
            headerCanon += name.toLowerCase() + ':' + val.trim() + '\r\n';
        }
    }

    // DKIM-Signature 템플릿 (b= 비어있는 상태)
    const dkimTemplate = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
        `h=${signedHeaderNames.join(':')}; bh=${bodyHash}; b=`;

    headerCanon += 'dkim-signature:' + dkimTemplate;

    // RSA-SHA256 서명
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(headerCanon);
    const signature = signer.sign(privateKey, 'base64');

    return `DKIM-Signature: ${dkimTemplate}${signature}`;
}

// 헤더 파싱
function parseHeaderLines(headerBlock) {
    const result = {};
    const lines = headerBlock.split('\r\n');
    let current = '';
    for (const line of lines) {
        if (/^\s/.test(line) && current) {
            result[current] += ' ' + line.trim();
        } else {
            const idx = line.indexOf(':');
            if (idx > 0) {
                current = line.slice(0, idx).toLowerCase();
                result[current] = line.slice(idx + 1).trim();
            }
        }
    }
    return result;
}

// Relaxed body canonicalization (간소화)
function canonicalizeBody(body) {
    let canon = body.replace(/[ \t]+\r\n/g, '\r\n'); // trailing whitespace
    canon = canon.replace(/[ \t]+/g, ' '); // multiple spaces → one
    canon = canon.replace(/(\r\n)+$/, '\r\n'); // trailing empty lines → one CRLF
    if (!canon.endsWith('\r\n')) canon += '\r\n';
    return canon;
}

module.exports = { generateDkimKeys, getDkimDnsRecord, signEmail };
