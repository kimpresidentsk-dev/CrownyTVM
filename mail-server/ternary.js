// ternary.js — 4상균형3진법 (Balanced Ternary) 유틸리티
// CrownyTVM 크라우니셀 메일 시스템 기반
// T = -1, 0 = 0, N = +1 (Crowny 표기)

'use strict';

// 10진수 → 균형3진 문자열
function toTernary(n) {
    if (n === 0) return '0';
    const digits = [];
    let num = Math.abs(Math.floor(n));
    while (num > 0) {
        let rem = num % 3;
        num = Math.floor(num / 3);
        if (rem === 2) { rem = -1; num += 1; }
        digits.push(rem);
    }
    if (n < 0) digits.forEach((d, i) => digits[i] = -d);
    return digits.reverse().map(d => d === -1 ? 'T' : d === 1 ? 'N' : '0').join('');
}

// 균형3진 문자열 → 10진수
function fromTernary(s) {
    let n = 0;
    for (const c of s) {
        n = n * 3 + (c === 'N' ? 1 : c === 'T' ? -1 : 0);
    }
    return n;
}

// 균형3진 해시 (문자열 → 27자리 균형3진 체크섬)
function ternaryHash(str) {
    const crypto = require('crypto');
    const hex = crypto.createHash('sha256').update(str).digest('hex');
    // SHA256의 앞 64bit를 균형3진으로
    const hi = parseInt(hex.slice(0, 8), 16);
    const lo = parseInt(hex.slice(8, 16), 16);
    const combined = hi ^ lo; // XOR for mixing
    return toTernary(combined).padStart(20, '0');
}

// 메일 ID 생성: 타임스탬프 + 랜덤을 균형3진으로
function generateMailId() {
    const ts = Date.now();
    const rnd = Math.floor(Math.random() * 19683); // 3^9
    const id = 'CRM' + toTernary(ts) + toTernary(rnd).padStart(6, '0');
    return id;
}

// 4상 상태 (메일 생명주기)
const MAIL_STATE = {
    DRAFT:    0,  // 작성중 (0)
    QUEUED:   1,  // 발송대기 (N)
    SENT:     2,  // 발송완료 (N0)
    DELIVERED:3,  // 수신확인 (NN)
    FAILED:  -1,  // 실패 (T)
    BOUNCED: -2,  // 반송 (TT)
};

// 신뢰도 계산 (셀 로직)
function calcTrust(mail) {
    let trust = 0;
    if (mail.dkimVerified) trust += 3;
    if (mail.spfPass) trust += 2;
    if (mail.tlsUsed) trust += 1;
    if (mail.isInternal) trust += 3; // @crowny.org 내부
    return Math.min(trust, 9); // 0~9
}

module.exports = {
    toTernary, fromTernary, ternaryHash,
    generateMailId, MAIL_STATE, calcTrust
};
