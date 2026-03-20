// ═══════════════════════════════════════════════════════════════
// chain/compact.js — 크라우니어 코어: 189바이트 고정 셀
// CrownyCell Chain
//
// 27슬롯 × 7바이트(TritWord) = 189바이트 고정
//
// 모든 값을 TritWord로 인코딩:
//   정수 → TritWord.fromInt()
//   주소 → 2슬롯 (54트릿 = SUBJECT+EVIDENCE_1, OBJECT+EVIDENCE_2)
//   문자열 → StringTable 참조 ID (TritWord.fromInt(id))
//   null → TritWord.zero()
//
// 바이너리 래퍼 (서명): 189B 셀 + 44B pubkey + 64B sig = 297B
// ═══════════════════════════════════════════════════════════════
'use strict';

const { TritWord } = require('./ternary');
const { sha256, sha256hex, bytesToTrits, tritsToString, stringToTrits } = require('./crypto');
const { SLOT, CELL_SIZE } = require('./cell');

const COMPACT_CELL_SIZE = 189; // 27 × 7 bytes
const COMPACT_TX_SIZE = 297;   // 189 + 44(pubkey DER) + 64(sig)

// ── 문자열 테이블 (C6: 메모/이름 → ID 참조) ──

class StringTable {
    constructor() {
        this.strings = new Map(); // string → id
        this.ids = new Map();     // id → string
        this.nextId = 1;
    }

    intern(str) {
        if (!str) return 0;
        if (this.strings.has(str)) return this.strings.get(str);
        const id = this.nextId++;
        this.strings.set(str, id);
        this.ids.set(id, str);
        return id;
    }

    lookup(id) {
        if (id === 0) return null;
        return this.ids.get(id) || null;
    }

    toJSON() {
        const entries = [];
        for (const [str, id] of this.strings) entries.push([id, str]);
        return entries.sort((a, b) => a[0] - b[0]);
    }

    static fromJSON(json) {
        const st = new StringTable();
        if (Array.isArray(json)) {
            for (const [id, str] of json) {
                st.strings.set(str, id);
                st.ids.set(id, str);
                if (id >= st.nextId) st.nextId = id + 1;
            }
        }
        return st;
    }

    get size() { return this.strings.size; }
}

// ── 주소 → 2-TritWord 인코딩 (C5) ──
// CRW 주소: 3 prefix + 54 trits + 3 checksum = 60 chars
// 54 trits = 2 × 27 trits = 2 TritWord

function addressToTritWords(address) {
    if (!address || typeof address !== 'string') return [TritWord.zero(), TritWord.zero()];
    // CRW 접두어 제거, 본문 54트릿 추출
    const body = address.startsWith('CRW') ? address.slice(3, 57) : address.slice(0, 54);
    const trits = [];
    for (const c of body) {
        trits.push(c === 'T' ? 1 : c === 'N' ? -1 : 0);
    }
    while (trits.length < 54) trits.push(0); // 패딩
    return [
        new TritWord(trits.slice(0, 27)),  // 상위 27트릿
        new TritWord(trits.slice(27, 54)), // 하위 27트릿
    ];
}

function tritWordsToAddress(tw1, tw2) {
    if (!tw1 || !tw2) return '';
    const trits = [...Array.from(tw1.trits), ...Array.from(tw2.trits)];
    const body = trits.map(t => t > 0 ? 'T' : t < 0 ? 'N' : 'O').join('');
    // 체크섬 재계산
    const sum = trits.reduce((a, t) => a + t, 0);
    const checkVal = ((sum % 27) + 27) % 27;
    const check = [
        Math.floor(checkVal / 9) - 1,
        Math.floor((checkVal % 9) / 3) - 1,
        (checkVal % 3) - 1,
    ].map(t => t > 0 ? 'T' : t < 0 ? 'N' : 'O').join('');
    return 'CRW' + body + check;
}

// ── 셀 → 189바이트 압축 ──

function compactSerialize(crownyCell, stringTable) {
    const buf = Buffer.alloc(COMPACT_CELL_SIZE);
    const st = stringTable || new StringTable();

    // 주소 보조 슬롯 추적 (이 슬롯은 주소 하위 27트릿이 들어감)
    const addressAuxSlots = new Set();

    // Pass 1: 주소 슬롯 먼저 처리 (보조 슬롯 선점)
    for (const [mainSlot, auxSlot] of [[SLOT.SUBJECT, SLOT.EVIDENCE_1], [SLOT.OBJECT, SLOT.EVIDENCE_2]]) {
        const val = crownyCell.get(mainSlot);
        if (typeof val === 'string' && val.startsWith('CRW') && val.length >= 57) {
            const [tw1, tw2] = addressToTritWords(val);
            tw1.toBytes().copy(buf, mainSlot * 7);
            tw2.toBytes().copy(buf, auxSlot * 7);
            addressAuxSlots.add(mainSlot);
            addressAuxSlots.add(auxSlot);
        }
    }

    // Pass 2: 나머지 슬롯
    for (let i = 0; i < CELL_SIZE; i++) {
        if (addressAuxSlots.has(i)) continue; // 이미 주소로 채워진 슬롯 스킵

        const val = crownyCell.get(i);
        let tw;

        if (val === null || val === undefined) {
            tw = TritWord.zero();
        } else if (val instanceof TritWord) {
            tw = val;
        } else if (typeof val === 'number') {
            tw = TritWord.fromInt(Math.round(val));
        } else if (typeof val === 'string') {
            if (val.startsWith('CRW') && val.length >= 57) {
                tw = TritWord.fromInt(st.intern(val)); // 비-주소 슬롯의 주소는 테이블로
            } else {
                tw = TritWord.fromInt(st.intern(val));
            }
        } else {
            tw = TritWord.fromInt(st.intern(JSON.stringify(val)));
        }

        tw.toBytes().copy(buf, i * 7);
    }

    return buf;
}

function compactDeserialize(buf, stringTable, slotTypes) {
    const { CrownyCell } = require('./cell');
    const cell = new CrownyCell();
    const st = stringTable || new StringTable();

    // 기본 슬롯 타입 맵 (어떤 슬롯이 주소인지, 정수인지)
    const types = slotTypes || {
        [SLOT.SUBJECT]:   'address',
        [SLOT.OBJECT]:    'address',
        [SLOT.PREDICATE]: 'int',
        [SLOT.TIMESTAMP]: 'int',
        [SLOT.CATEGORY]:  'int',   // 트릿 값
        [SLOT.DOMAIN]:    'int',   // 금액
        [SLOT.LAYER]:     'int',   // nonce
        [SLOT.TRUST]:     'int',
        [SLOT.EVIDENCE_N]:'int',
        [SLOT.EPISTEMIC]: 'int',
    };

    for (let i = 0; i < CELL_SIZE; i++) {
        const tw = TritWord.fromBytes(buf.slice(i * 7, (i + 1) * 7));
        const type = types[i] || 'auto';

        if (type === 'address') {
            // 주소: 이 슬롯(상위 27트릿) + 보조 슬롯(하위 27트릿) 복원
            const auxSlot = i === SLOT.SUBJECT ? SLOT.EVIDENCE_1 :
                            i === SLOT.OBJECT ? SLOT.EVIDENCE_2 : -1;
            if (auxSlot >= 0) {
                const tw2 = TritWord.fromBytes(buf.slice(auxSlot * 7, (auxSlot + 1) * 7));
                const addr = tritWordsToAddress(tw, tw2);
                cell.set(i, addr || null);
            } else {
                cell.set(i, tw.toInt());
            }
        } else if (type === 'int') {
            cell.set(i, tw.toInt());
        } else if (type === 'string') {
            const id = tw.toInt();
            cell.set(i, id === 0 ? null : st.lookup(id));
        } else {
            // auto: 0이면 null, 아니면 정수
            const val = tw.toInt();
            cell.set(i, val === 0 ? null : val);
        }
    }

    return cell;
}

// ── 트랜잭션 → 297바이트 압축 ──
// [189B compact cell][44B pubkey DER][64B signature]

function compactSerializeTx(transaction, stringTable) {
    const cellBuf = compactSerialize(transaction.cell, stringTable);
    const pubBuf = transaction.senderPubKey || Buffer.alloc(44);
    const sigBuf = transaction.signature || Buffer.alloc(64);

    const buf = Buffer.alloc(COMPACT_TX_SIZE);
    cellBuf.copy(buf, 0);
    pubBuf.copy(buf, COMPACT_CELL_SIZE, 0, Math.min(pubBuf.length, 44));
    sigBuf.copy(buf, COMPACT_CELL_SIZE + 44, 0, Math.min(sigBuf.length, 64));

    return buf;
}

// ── 셀 해시 (압축된 189B의 SHA-256) ──

function compactHash(crownyCell, stringTable) {
    return sha256hex(compactSerialize(crownyCell, stringTable));
}

// ── 통계 ──

function compressionStats(crownyCell) {
    const original = crownyCell.serialize();
    const compact = compactSerialize(crownyCell);
    return {
        original: original.length,
        compact: compact.length,
        ratio: (compact.length / original.length * 100).toFixed(1) + '%',
        savings: original.length - compact.length,
    };
}

module.exports = {
    COMPACT_CELL_SIZE,
    COMPACT_TX_SIZE,
    StringTable,
    addressToTritWords,
    tritWordsToAddress,
    compactSerialize,
    compactDeserialize,
    compactSerializeTx,
    compactHash,
    compressionStats,
};
