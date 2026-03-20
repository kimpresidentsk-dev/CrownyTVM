// ═══════════════════════════════════════════════════════════════
// chain/cell.js — 27-슬롯 셀 (압축 준비 완료)
// CrownyCell Chain
//
// 압축 준비 (C1-C10):
//   C3: TX_TYPE → 정수 (1-8)
//   C4: CURRENCY → 트릿 (T=CRN, O=FNC, N=CRM)
//   C5: 주소 → 2-슬롯 TritWord 페어 (54트릿)
//   C6: 메모 → 문자열 테이블 참조 ID
//   C7: 타임스탬프 → 초 단위 (Rust 호환)
//   C8: 인식론 → 4상태 + 전이 함수
//   C9: 직렬화 → 결정론적 바이너리
//
// 크라우니어 최종 목표: 27슬롯 × 7바이트 = 189바이트 고정
// 현재: 하이브리드 (정수/트릿 슬롯 + 바이너리 래퍼)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { TritWord } = require('./ternary');
const { sha256hex } = require('./crypto');

// ── 슬롯 인덱스 상수 (셀.rs 매핑, 불변) ──

const SLOT = {
    SUBJECT:     0,   // 주체 (from 주소 part 1)
    PREDICATE:   1,   // 술어 (TX 타입 정수)
    OBJECT:      2,   // 대상 (to 주소 part 1)
    EPISTEMIC:   3,   // 인식상태
    TRUST:       4,   // 신뢰값 (-13 ~ +13)
    EVIDENCE_N:  5,   // 증거수
    EVIDENCE_1:  6,   // 증거/주소 part 2 (from)
    EVIDENCE_2:  7,   // 증거/주소 part 2 (to)
    EVIDENCE_3:  8,   // 증거 셀 참조 3
    RESERVED_1:  9,
    RESERVED_2:  10,
    RESERVED_3:  11,
    TIMESTAMP:   12,  // 타임스탬프 (C7: 초 단위)
    CATEGORY:    13,  // 통화 (C4: 트릿 값)
    DOMAIN:      14,  // 금액
    LAYER:       15,  // nonce
    DATA_START:  16,  // 사용자 데이터 시작
    DATA_END:    22,  // 사용자 데이터 끝
    SYNAPSE:     23,  // ◆음 — 시냅스
    TI_LINK:     24,  // ▲티 — 상위
    OM_LINK:     25,  // ●옴 — 현재
    TA_LINK:     26,  // ▼타 — 하위
};

const CELL_SIZE = 27;

// ── C3: TX_TYPE → 정수 (크라우니어: 9-trit 옵코드로 압축 가능) ──

const TX_TYPE = {
    TRANSFER:      1,
    SWAP:          2,
    CELL_CREATE:   3,
    CELL_LINK:     4,
    CELL_EVIDENCE: 5,
    STAKE:         6,
    UNSTAKE:       7,
    REGISTER:      8,
};

// 역방향 조회 (디버깅/표시용)
const TX_TYPE_NAME = {};
for (const [k, v] of Object.entries(TX_TYPE)) TX_TYPE_NAME[v] = k.toLowerCase();

// ── C4: CURRENCY → 트릿 값 (CRN=+1, FNC=0, CRM=-1) ──

const CURRENCY = {
    CRN: 1,    // Ti (+1) — 최상위
    FNC: 0,    // Om (0)  — 중간
    CRM: -1,   // Ta (-1) — 기본
};

const CURRENCY_NAME = { 1: 'CRN', 0: 'FNC', '-1': 'CRM' };

// 문자열 ↔ 트릿 변환 (하위 호환)
function currencyToTrit(c) {
    if (typeof c === 'number') return c;
    return CURRENCY[c] ?? -1;
}
function tritToCurrency(t) {
    if (typeof t === 'string') return t;
    return CURRENCY_NAME[String(t)] || 'CRM';
}

// ── C8: 인식론 4상태 + 전이 (Rust 티옴타음.rs 매핑) ──

const EPISTEMIC = {
    EUM:      0,   // 음(Eum) — 미지/무
    OM:       1,   // 옴(Om)  — 가능
    TI:       2,   // 티(Ti)  — 개연
    CERTAIN:  3,   // 확정
};

// 전진(forward): Eum→Om→Ti→Certain
function epistemicForward(state) {
    return state < 3 ? state + 1 : 3;
}
// 후퇴(backward): Certain→Ti→Om→Eum
function epistemicBackward(state) {
    return state > 0 ? state - 1 : 0;
}
// 반전(reversal): Ti↔Eum, Om↔Certain (대칭 반전)
function epistemicReversal(state) {
    return 3 - state;
}

// ── 값 태그 (바이너리 직렬화) ──

const VALUE_TYPE = {
    NONE:     0x00,
    INT:      0x01,
    FLOAT:    0x02,
    STRING:   0x03,
    TRIT:     0x04,
    REF:      0x05,
    BYTES:    0x06,
};

// ── CrownyCell 클래스 ──

class CrownyCell {
    constructor() {
        this.slots = new Array(CELL_SIZE).fill(null);
    }

    get(idx) { return (idx >= 0 && idx < CELL_SIZE) ? this.slots[idx] : null; }
    set(idx, value) { if (idx >= 0 && idx < CELL_SIZE) this.slots[idx] = value; return this; }

    subject(v)   { return v !== undefined ? this.set(SLOT.SUBJECT, v) : this.get(SLOT.SUBJECT); }
    predicate(v) { return v !== undefined ? this.set(SLOT.PREDICATE, v) : this.get(SLOT.PREDICATE); }
    object(v)    { return v !== undefined ? this.set(SLOT.OBJECT, v) : this.get(SLOT.OBJECT); }
    timestamp(v) { return v !== undefined ? this.set(SLOT.TIMESTAMP, v) : this.get(SLOT.TIMESTAMP); }
    trust(v)     { return v !== undefined ? this.set(SLOT.TRUST, v) : this.get(SLOT.TRUST); }
    data(idx, v) {
        const slot = SLOT.DATA_START + idx;
        return v !== undefined ? this.set(slot, v) : this.get(slot);
    }

    // ── C9: 결정론적 바이너리 직렬화 ──
    // 포맷: [27 × (type_tag:1B + value:variable)]
    // 슬롯 순서가 곧 직렬화 순서 → 결정론적 해시 보장

    serialize() {
        const parts = [];
        for (let i = 0; i < CELL_SIZE; i++) {
            const val = this.slots[i];
            if (val === null || val === undefined) {
                parts.push(Buffer.from([VALUE_TYPE.NONE]));
            } else if (typeof val === 'number' && Number.isInteger(val)) {
                const buf = Buffer.alloc(9);
                buf[0] = VALUE_TYPE.INT;
                buf.writeBigInt64BE(BigInt(val), 1);
                parts.push(buf);
            } else if (typeof val === 'number') {
                const buf = Buffer.alloc(9);
                buf[0] = VALUE_TYPE.FLOAT;
                buf.writeDoubleBE(val, 1);
                parts.push(buf);
            } else if (typeof val === 'string') {
                const strBuf = Buffer.from(val, 'utf8');
                const buf = Buffer.alloc(3 + strBuf.length);
                buf[0] = VALUE_TYPE.STRING;
                buf.writeUInt16BE(strBuf.length, 1);
                strBuf.copy(buf, 3);
                parts.push(buf);
            } else if (val instanceof TritWord) {
                const buf = Buffer.alloc(8);
                buf[0] = VALUE_TYPE.TRIT;
                val.toBytes().copy(buf, 1);
                parts.push(buf);
            } else if (Buffer.isBuffer(val)) {
                const buf = Buffer.alloc(3 + val.length);
                buf[0] = VALUE_TYPE.BYTES;
                buf.writeUInt16BE(val.length, 1);
                val.copy(buf, 3);
                parts.push(buf);
            } else {
                const json = JSON.stringify(val);
                const strBuf = Buffer.from(json, 'utf8');
                const buf = Buffer.alloc(3 + strBuf.length);
                buf[0] = VALUE_TYPE.STRING;
                buf.writeUInt16BE(strBuf.length, 1);
                strBuf.copy(buf, 3);
                parts.push(buf);
            }
        }
        return Buffer.concat(parts);
    }

    static deserialize(buf) {
        const cell = new CrownyCell();
        let offset = 0;
        for (let i = 0; i < CELL_SIZE && offset < buf.length; i++) {
            const type = buf[offset++];
            switch (type) {
                case VALUE_TYPE.NONE:
                    cell.slots[i] = null;
                    break;
                case VALUE_TYPE.INT:
                    cell.slots[i] = Number(buf.readBigInt64BE(offset));
                    offset += 8;
                    break;
                case VALUE_TYPE.FLOAT:
                    cell.slots[i] = buf.readDoubleBE(offset);
                    offset += 8;
                    break;
                case VALUE_TYPE.STRING: {
                    const len = buf.readUInt16BE(offset); offset += 2;
                    cell.slots[i] = buf.slice(offset, offset + len).toString('utf8');
                    offset += len;
                    break;
                }
                case VALUE_TYPE.TRIT:
                    cell.slots[i] = TritWord.fromBytes(buf.slice(offset, offset + 7));
                    offset += 7;
                    break;
                case VALUE_TYPE.REF:
                    cell.slots[i] = Number(buf.readBigInt64BE(offset));
                    offset += 8;
                    break;
                case VALUE_TYPE.BYTES: {
                    const len = buf.readUInt16BE(offset); offset += 2;
                    cell.slots[i] = buf.slice(offset, offset + len);
                    offset += len;
                    break;
                }
                default:
                    cell.slots[i] = null;
            }
        }
        return cell;
    }

    hash() { return sha256hex(this.serialize()); }

    toJSON() {
        return { slots: this.slots.map(v => v instanceof TritWord ? { _tw: v.toString() } : v) };
    }

    static fromJSON(json) {
        const cell = new CrownyCell();
        if (json.slots) {
            for (let i = 0; i < CELL_SIZE && i < json.slots.length; i++) {
                const v = json.slots[i];
                if (v && typeof v === 'object' && v._tw) {
                    cell.slots[i] = new TritWord(Array.from(v._tw).map(c =>
                        c === 'T' ? 1 : c === 'N' ? -1 : 0));
                } else {
                    cell.slots[i] = v;
                }
            }
        }
        return cell;
    }

    // ── 팩토리 (C3+C4+C7 적용) ──

    static createTransfer(from, to, amount, currency, nonce, memo) {
        const cell = new CrownyCell();
        cell.set(SLOT.SUBJECT, from);
        cell.set(SLOT.PREDICATE, TX_TYPE.TRANSFER);        // C3: 정수
        cell.set(SLOT.OBJECT, to);
        cell.set(SLOT.TIMESTAMP, Math.floor(Date.now() / 1000)); // C7: 초
        cell.set(SLOT.CATEGORY, currencyToTrit(currency));  // C4: 트릿
        cell.set(SLOT.DOMAIN, amount);
        cell.set(SLOT.LAYER, nonce);
        if (memo) cell.set(SLOT.DATA_START, memo);
        return cell;
    }

    static createSwap(from, fromCurrency, toCurrency, fromAmount, toAmount, nonce) {
        const cell = new CrownyCell();
        cell.set(SLOT.SUBJECT, from);
        cell.set(SLOT.PREDICATE, TX_TYPE.SWAP);             // C3: 정수
        cell.set(SLOT.TIMESTAMP, Math.floor(Date.now() / 1000)); // C7: 초
        cell.set(SLOT.CATEGORY, currencyToTrit(fromCurrency)); // C4: 트릿
        cell.set(SLOT.DOMAIN, fromAmount);
        cell.set(SLOT.DATA_START, currencyToTrit(toCurrency)); // C4: 트릿
        cell.set(SLOT.DATA_START + 1, toAmount);
        cell.set(SLOT.LAYER, nonce);
        return cell;
    }
}

module.exports = {
    CrownyCell,
    SLOT, CELL_SIZE,
    TX_TYPE, TX_TYPE_NAME,
    CURRENCY, CURRENCY_NAME,
    currencyToTrit, tritToCurrency,
    EPISTEMIC, epistemicForward, epistemicBackward, epistemicReversal,
    VALUE_TYPE,
};
