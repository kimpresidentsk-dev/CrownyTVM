// ═══════════════════════════════════════════════════════════════
// chain/ternary.js — 균형3진법 라이브러리 (Rust trit.rs 포팅)
// CrownyCell Chain · Phase 0.2
//
// Rust 원본: trit.rs (Trit, Trit6, Trit9)
//           크라우니/원천/기초/삼진수.rs (트릿단어 27-trit)
//
// 크라우니어 압축 대비: 모든 연산이 27-trit 워드 단위
// T=+1(▲티), O=0(■옴), N=-1(▼타)
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── 트릿 상수 ──

const T = 1;   // Ti (▲) — 긍정, 참, 동의
const O = 0;   // Om (■) — 중립, 보류
const N = -1;  // Ta (▼) — 부정, 거짓, 반대

// ── 트릿 기본 연산 (Rust Trit impl 포팅) ──

function tritNot(a) { return -a; }              // trit.rs:16
function tritAnd(a, b) { return Math.min(a, b); } // trit.rs:17 — min
function tritOr(a, b) { return Math.max(a, b); }  // trit.rs:18 — max
function tritConsensus(a, b) { return a === b ? a : O; } // trit.rs:19 — 합의

// 트릿 심볼
function tritSym(t) { return t > 0 ? '▲' : t < 0 ? '▼' : '■'; }
function tritChar(t) { return t > 0 ? 'T' : t < 0 ? 'N' : 'O'; }
function charToTrit(c) { return c === 'T' ? T : c === 'N' ? N : O; }

// ── Trit9: 9-trit 워드 (피연산자, 범위 -9841 ~ +9841) ──
// Rust 원본: trit.rs Trit9

function intToTrit9(val) {
    const trits = new Int8Array(9);
    let v = Math.abs(val);
    for (let i = 8; i >= 0; i--) {
        const r = v % 3;
        if (r === 0)      trits[i] = O;
        else if (r === 1) trits[i] = T;
        else              { trits[i] = N; v += 1; }
        v = Math.floor(v / 3);
    }
    if (val < 0) { for (let i = 0; i < 9; i++) trits[i] = -trits[i]; }
    return trits;
}

function trit9ToInt(trits) {
    let val = 0;
    for (let i = 0; i < 9; i++) val = val * 3 + trits[i];
    return val;
}

// ── TritWord: 27-trit 워드 (셀 기본 단위) ──
// Rust 원본: 크라우니/원천/기초/삼진수.rs 트릿단어
// 범위: -3,812,798,742,493 ~ +3,812,798,742,493

class TritWord {
    constructor(trits) {
        // trits: Int8Array(27) 또는 Array(27) of -1/0/1
        if (trits && trits.length === 27) {
            this.trits = new Int8Array(trits);
        } else {
            this.trits = new Int8Array(27); // 모두 Om(0)
        }
    }

    // 정수 → 27-trit 균형3진수
    static fromInt(val) {
        const trits = new Int8Array(27);
        let v = Math.abs(val);
        for (let i = 26; i >= 0; i--) {
            const r = v % 3;
            if (r === 0)      trits[i] = O;
            else if (r === 1) trits[i] = T;
            else              { trits[i] = N; v += 1; }
            v = Math.floor(v / 3);
        }
        if (val < 0) { for (let i = 0; i < 27; i++) trits[i] = -trits[i]; }
        return new TritWord(trits);
    }

    // 27-trit → 정수 (주의: JS Number 정밀도 한계 → BigInt 사용)
    toInt() {
        let val = 0n;
        for (let i = 0; i < 27; i++) val = val * 3n + BigInt(this.trits[i]);
        return Number(val);
    }

    toBigInt() {
        let val = 0n;
        for (let i = 0; i < 27; i++) val = val * 3n + BigInt(this.trits[i]);
        return val;
    }

    // 바이너리 직렬화 (2트릿 = 1바이트의 2비트, 27트릿 → 14바이트)
    // 인코딩: N=0b00, O=0b01, T=0b10 (2비트/트릿)
    toBytes() {
        const buf = Buffer.alloc(7); // 27 trits × 2 bits = 54 bits = 7 bytes (56 bits, 2 padding)
        for (let i = 0; i < 27; i++) {
            const byteIdx = Math.floor((i * 2) / 8);
            const bitIdx = (i * 2) % 8;
            const val = this.trits[i] + 1; // N=-1→0, O=0→1, T=1→2
            buf[byteIdx] |= (val & 0x03) << bitIdx;
        }
        return buf;
    }

    static fromBytes(buf) {
        const trits = new Int8Array(27);
        for (let i = 0; i < 27; i++) {
            const byteIdx = Math.floor((i * 2) / 8);
            const bitIdx = (i * 2) % 8;
            const val = (buf[byteIdx] >> bitIdx) & 0x03;
            trits[i] = val - 1; // 0→-1, 1→0, 2→+1
        }
        return new TritWord(trits);
    }

    // 논리 연산
    not() { return new TritWord(this.trits.map(t => -t)); }
    and(other) { return new TritWord(this.trits.map((t, i) => tritAnd(t, other.trits[i]))); }
    or(other) { return new TritWord(this.trits.map((t, i) => tritOr(t, other.trits[i]))); }
    consensus(other) { return new TritWord(this.trits.map((t, i) => tritConsensus(t, other.trits[i]))); }

    // 3진 덧셈 (with carry)
    add(other) {
        const result = new Int8Array(27);
        let carry = 0;
        for (let i = 26; i >= 0; i--) {
            let sum = this.trits[i] + other.trits[i] + carry;
            carry = 0;
            if (sum > 1) { sum -= 3; carry = 1; }
            else if (sum < -1) { sum += 3; carry = -1; }
            result[i] = sum;
        }
        return new TritWord(result);
    }

    // 비교
    equals(other) {
        for (let i = 0; i < 27; i++) if (this.trits[i] !== other.trits[i]) return false;
        return true;
    }

    compare(other) {
        for (let i = 0; i < 27; i++) {
            if (this.trits[i] > other.trits[i]) return 1;
            if (this.trits[i] < other.trits[i]) return -1;
        }
        return 0;
    }

    // 9-trit 워드 3개로 분해 (opcode, operandA, operandB 구조)
    toTrit9s() {
        return [
            this.trits.slice(0, 9),
            this.trits.slice(9, 18),
            this.trits.slice(18, 27),
        ];
    }

    static fromTrit9s(a, b, c) {
        const trits = new Int8Array(27);
        trits.set(a, 0);
        trits.set(b, 9);
        trits.set(c, 18);
        return new TritWord(trits);
    }

    // 문자열 표현 (Array.from: Int8Array.map은 Int8Array를 반환하므로)
    toString() { return Array.from(this.trits).map(t => tritChar(t)).join(''); }
    toSymbol() { return Array.from(this.trits).map(t => tritSym(t)).join(''); }

    // Zero word
    static zero() { return new TritWord(new Int8Array(27)); }
}

// ── 3진 머클 트리 (3-ary Merkle) ──
// 이진 대신 3진: 각 노드가 자식 3개 → 크라우니어 네이티브 구조
// SHA-256을 사용하되 구조는 3진

// Q1 FIX: sha256을 crypto.js에서 가져옴 (중복 제거)
const { sha256 } = require('./crypto');

function ternaryMerkleRoot(hashes) {
    if (hashes.length === 0) return sha256(Buffer.alloc(0));
    if (hashes.length === 1) return hashes[0];

    // 3개씩 묶어서 상위 해시 생성
    const next = [];
    for (let i = 0; i < hashes.length; i += 3) {
        const a = hashes[i];
        const b = hashes[i + 1] || a; // 부족하면 마지막 복제
        const c = hashes[i + 2] || b;
        next.push(sha256(Buffer.concat([a, b, c])));
    }
    return ternaryMerkleRoot(next);
}

// ── 다중 합의 투표 집계 ──
// votes: Array of T/O/N
// 반환: { result: T/O/N, sum: number, detail: {T: n, O: n, N: n} }

function tallyVotes(votes) {
    const detail = { T: 0, O: 0, N: 0 };
    let sum = 0;
    for (const v of votes) {
        sum += v;
        if (v > 0) detail.T++;
        else if (v < 0) detail.N++;
        else detail.O++;
    }
    return {
        result: sum > 0 ? T : sum < 0 ? N : O,
        sum,
        detail,
        confirmed: sum > 0,
        rejected: sum < 0,
        held: sum === 0,
    };
}

module.exports = {
    // 상수
    T, O, N,
    // 트릿 연산
    tritNot, tritAnd, tritOr, tritConsensus,
    tritSym, tritChar, charToTrit,
    // 9-trit
    intToTrit9, trit9ToInt,
    // 27-trit 워드
    TritWord,
    // 머클 트리
    ternaryMerkleRoot,
    sha256,
    // 합의
    tallyVotes,
};
