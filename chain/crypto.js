// ═══════════════════════════════════════════════════════════════
// chain/crypto.js — Ed25519 키 관리 + 3진 주소 도출
// CrownyCell Chain · Phase 0.1
//
// 최종 목표: 크라우니어(기계어) 레이어로 압축
// 현재: Node.js 프로토타입 (구조를 27-trit 셀 단위로 유지)
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

// ── Ed25519 키페어 생성 ──
// Ed25519 = Edwards-curve Digital Signature Algorithm on Curve25519
// 비밀키 32B, 공개키 32B, 서명 64B, 보안강도 128-bit

function generateKeypair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding:  { type: 'spki',  format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    return {
        publicKey,   // Buffer (44 bytes DER-encoded, 32 bytes raw inside)
        privateKey,  // Buffer (48 bytes DER-encoded, 32 bytes raw inside)
    };
}

// ── 서명 & 검증 ──

function sign(message, privateKeyDer) {
    // message: Buffer or string, privateKeyDer: Buffer (DER format)
    const keyObj = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
    return crypto.sign(null, Buffer.from(message), keyObj);
}

function verify(message, signature, publicKeyDer) {
    // returns boolean
    try {
        const keyObj = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
        return crypto.verify(null, Buffer.from(message), keyObj, signature);
    } catch { return false; }
}

// ── 공개키 → 3진 주소 도출 ──
// 공개키(32B) → SHA-256 → 바이트→트릿 변환 → CRW + 54트릿 + 3체크섬 = 57자

// 바이트를 균형3진법 트릿 배열로 변환 (각 바이트 → 5트릿, 3^5=243>256)
function bytesToTrits(buf) {
    const trits = [];
    for (let i = 0; i < buf.length; i++) {
        let val = buf[i]; // 0-255
        for (let j = 4; j >= 0; j--) {
            const r = val % 3;
            if (r === 0)      trits.push(0);   // Om
            else if (r === 1) trits.push(1);    // Ti (+1)
            else              { trits.push(-1); val += 1; } // Ta (-1), carry
            val = Math.floor(val / 3);
        }
    }
    return trits;
}

// 트릿 → 문자: T(+1)=▲, 0(0)=■, N(-1)=▼ — 크라우니어 심볼
// 주소용 약식: T(+1), O(0), N(-1)
const TRIT_CHARS = { '-1': 'N', '0': 'O', '1': 'T' };
const CHAR_TRITS = { 'N': -1, 'O': 0, 'T': 1 };

function tritsToString(trits) {
    return trits.map(t => TRIT_CHARS[String(t)] || 'O').join('');
}

function stringToTrits(s) {
    return Array.from(s).map(c => CHAR_TRITS[c] || 0);
}

// 공개키 DER → CRW 주소 (57자)
function publicKeyToAddress(publicKeyDer) {
    // DER에서 raw 32바이트 추출 (SPKI 헤더 12바이트 스킵)
    const raw = publicKeyDer.length === 44 ? publicKeyDer.slice(12) : publicKeyDer;
    const hash = crypto.createHash('sha256').update(raw).digest();

    // 해시(32B) → 160트릿 → 54트릿 선택 (6 × 9-trit 워드)
    const allTrits = bytesToTrits(hash);
    const addrTrits = allTrits.slice(0, 54);

    // 3-trit 체크섬: 54트릿 합 mod 27 → 3트릿 균형3진수
    const sum = addrTrits.reduce((a, t) => a + t, 0);
    const checkVal = ((sum % 27) + 27) % 27; // 0-26
    const check = [
        Math.floor(checkVal / 9) - 1,
        Math.floor((checkVal % 9) / 3) - 1,
        (checkVal % 3) - 1,
    ];

    return 'CRW' + tritsToString(addrTrits) + tritsToString(check);
}

// 주소 체크섬 검증
function verifyAddress(address) {
    if (!address || !address.startsWith('CRW') || address.length !== 60) return false;
    const body = address.slice(3, 57);
    const checkStr = address.slice(57, 60);
    const trits = stringToTrits(body);
    const sum = trits.reduce((a, t) => a + t, 0);
    const checkVal = ((sum % 27) + 27) % 27;
    const expected = [
        Math.floor(checkVal / 9) - 1,
        Math.floor((checkVal % 9) / 3) - 1,
        (checkVal % 3) - 1,
    ];
    return tritsToString(expected) === checkStr;
}

// ── 키 직렬화 (저장용) ──

function keypairToHex(keypair) {
    return {
        publicKey: keypair.publicKey.toString('hex'),
        privateKey: keypair.privateKey.toString('hex'),
    };
}

function keypairFromHex(hex) {
    return {
        publicKey: Buffer.from(hex.publicKey, 'hex'),
        privateKey: Buffer.from(hex.privateKey, 'hex'),
    };
}

// ── 비밀키 암호화 (사용자 비밀번호로) ──

function encryptPrivateKey(privateKeyDer, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(privateKeyDer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        encrypted: encrypted.toString('hex'),
        tag: tag.toString('hex'),
    };
}

function decryptPrivateKey(encData, password) {
    const salt = Buffer.from(encData.salt, 'hex');
    const iv = Buffer.from(encData.iv, 'hex');
    const encrypted = Buffer.from(encData.encrypted, 'hex');
    const tag = Buffer.from(encData.tag, 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ── 해시 유틸 ──

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest();
}

function sha256hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// ── 기존 사용자 마이그레이션용: 결정론적 키 생성 ──
// username + password_hash → 항상 같은 Ed25519 키페어

function deterministicKeypair(username, passwordHash) {
    // seed = SHA-256(username + ':crowny-cell-chain:' + passwordHash)
    const seed = sha256(username + ':crowny-cell-chain:' + passwordHash);
    // Ed25519는 32바이트 시드에서 키페어 생성 가능
    // Node.js crypto는 직접 시드→키 지원 안 하므로 generateKeyPairSync 사용
    // 대신, 시드를 HMAC으로 확장하여 결정론적 개인키 생성
    const expandedSeed = crypto.createHmac('sha512', 'crowny-ed25519').update(seed).digest();
    // Ed25519 개인키 = 처음 32바이트 (clamping은 sign 시 자동 적용)
    // DER 인코딩: PKCS8 prefix(16B) + raw key(32B)
    const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const rawPrivate = expandedSeed.slice(0, 32);
    const privateKeyDer = Buffer.concat([PKCS8_ED25519_PREFIX, rawPrivate]);

    // 공개키 도출
    const keyObj = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
    const publicKeyDer = crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'der' });

    return { publicKey: publicKeyDer, privateKey: privateKeyDer };
}

module.exports = {
    generateKeypair,
    sign,
    verify,
    publicKeyToAddress,
    verifyAddress,
    keypairToHex,
    keypairFromHex,
    encryptPrivateKey,
    decryptPrivateKey,
    deterministicKeypair,
    sha256,
    sha256hex,
    bytesToTrits,
    tritsToString,
    stringToTrits,
    TRIT_CHARS,
    CHAR_TRITS,
};
