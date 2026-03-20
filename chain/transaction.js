// ═══════════════════════════════════════════════════════════════
// chain/transaction.js — 서명된 트랜잭션 (Phase 1.1)
// CrownyCell Chain
//
// 트랜잭션 = 서명된 27-슬롯 셀
// Ed25519 서명으로 발신자 증명, nonce로 리플레이 방지
// 크라우니어 압축 대비: 셀 구조 유지, 서명은 별도 envelope
// ═══════════════════════════════════════════════════════════════
'use strict';

const { CrownyCell, SLOT, TX_TYPE, TX_TYPE_NAME, CURRENCY, CURRENCY_NAME, tritToCurrency, currencyToTrit } = require('./cell');
const { sign, verify, sha256, sha256hex } = require('./crypto');

class Transaction {
    constructor(cell, senderPubKey, signature) {
        this.cell = cell || new CrownyCell();  // 27-슬롯 셀 본문
        this.senderPubKey = senderPubKey || null; // Buffer (DER)
        this.signature = signature || null;        // Buffer (64B)
    }

    // ── 트랜잭션 해시 (셀 직렬화의 SHA-256) ──
    hash() {
        return sha256hex(this.cell.serialize());
    }

    hashBuffer() {
        return sha256(this.cell.serialize());
    }

    // ── 서명할 메시지 = 셀의 바이너리 직렬화 ──
    signingPayload() {
        return this.cell.serialize();
    }

    // ── 서명 ──
    sign(privateKeyDer) {
        this.signature = sign(this.signingPayload(), privateKeyDer);
        return this;
    }

    // ── 검증 ──
    verify() {
        if (!this.senderPubKey || !this.signature) return false;
        return verify(this.signingPayload(), this.signature, this.senderPubKey);
    }

    // ── 접근자 ──
    get type()      { return this.cell.get(SLOT.PREDICATE); }
    get from()      { return this.cell.get(SLOT.SUBJECT); }
    get to()        { return this.cell.get(SLOT.OBJECT); }
    get amount()    { return this.cell.get(SLOT.DOMAIN); }
    get currency()  { return this.cell.get(SLOT.CATEGORY); }
    get nonce()     { return this.cell.get(SLOT.LAYER); }
    get timestamp() { return this.cell.get(SLOT.TIMESTAMP); }
    get memo()      { return this.cell.get(SLOT.DATA_START); }

    // ── 직렬화 (네트워크/저장용) ──
    // 포맷: [pubKeyLen:2B][pubKey][sigLen:2B][sig][cellData]
    serialize() {
        const cellBuf = this.cell.serialize();
        const pubBuf = this.senderPubKey || Buffer.alloc(0);
        const sigBuf = this.signature || Buffer.alloc(0);

        const buf = Buffer.alloc(2 + pubBuf.length + 2 + sigBuf.length + cellBuf.length);
        let offset = 0;
        buf.writeUInt16BE(pubBuf.length, offset); offset += 2;
        pubBuf.copy(buf, offset); offset += pubBuf.length;
        buf.writeUInt16BE(sigBuf.length, offset); offset += 2;
        sigBuf.copy(buf, offset); offset += sigBuf.length;
        cellBuf.copy(buf, offset);
        return buf;
    }

    static deserialize(buf) {
        let offset = 0;
        const pubLen = buf.readUInt16BE(offset); offset += 2;
        const pubKey = pubLen > 0 ? buf.slice(offset, offset + pubLen) : null; offset += pubLen;
        const sigLen = buf.readUInt16BE(offset); offset += 2;
        const sig = sigLen > 0 ? buf.slice(offset, offset + sigLen) : null; offset += sigLen;
        const cell = CrownyCell.deserialize(buf.slice(offset));
        return new Transaction(cell, pubKey, sig);
    }

    // ── JSON 변환 ──
    toJSON() {
        const j = {
            hash: this.hash(),
            type: this.type,                              // C3: 정수
            typeName: TX_TYPE_NAME[this.type] || 'unknown', // 표시용
            from: this.from,
            to: this.to,
            amount: this.amount,
            currency: this.currency,                      // C4: 트릿 값
            currencyName: tritToCurrency(this.currency),  // 표시용
            nonce: this.nonce,
            timestamp: this.timestamp,
            memo: this.memo,
            senderPubKey: this.senderPubKey ? this.senderPubKey.toString('hex') : null,
            signature: this.signature ? this.signature.toString('hex') : null,
        };
        // swap TX 추가 필드
        if (this.type === TX_TYPE.SWAP) {
            const toCurrency = this.cell.get(SLOT.DATA_START);
            const toAmount = this.cell.get(SLOT.DATA_START + 1);
            if (toCurrency != null) { j.toCurrency = toCurrency; j.toCurrencyName = tritToCurrency(toCurrency); }
            if (toAmount != null) j.toAmount = toAmount;
        }
        return j;
    }

    // ── 팩토리 메서드 ──

    static transfer(fromAddr, toAddr, amount, currency, nonce, memo, senderPubKey) {
        const cell = CrownyCell.createTransfer(fromAddr, toAddr, amount, currency, nonce, memo);
        return new Transaction(cell, senderPubKey);
    }

    static swap(fromAddr, fromCurrency, toCurrency, fromAmount, toAmount, nonce, senderPubKey) {
        const cell = CrownyCell.createSwap(fromAddr, fromCurrency, toCurrency, fromAmount, toAmount, nonce);
        return new Transaction(cell, senderPubKey);
    }

    // ── B3 FIX: JSON 왕복 복원 ──
    static fromJSON(json) {
        if (!json) return null;
        const cell = new CrownyCell();
        cell.set(SLOT.SUBJECT, json.from ?? null);
        // C3: type이 문자열이면 TX_TYPE에서 정수로 변환 (하위 호환)
        let txType = json.type;
        if (typeof txType === 'string') {
            txType = TX_TYPE[txType.toUpperCase()] ?? txType;
        }
        cell.set(SLOT.PREDICATE, txType ?? null);
        cell.set(SLOT.OBJECT, json.to ?? null);
        cell.set(SLOT.TIMESTAMP, json.timestamp ?? null);
        // C4: currency가 문자열이면 트릿으로 변환
        cell.set(SLOT.CATEGORY, typeof json.currency === 'string' ? currencyToTrit(json.currency) : (json.currency ?? null));
        cell.set(SLOT.DOMAIN, json.amount ?? null);
        cell.set(SLOT.LAYER, json.nonce ?? null);
        // swap 필드 (memo보다 우선)
        if (json.toCurrency != null) {
            cell.set(SLOT.DATA_START, typeof json.toCurrency === 'string' ? currencyToTrit(json.toCurrency) : json.toCurrency);
        } else if (json.memo != null) {
            cell.set(SLOT.DATA_START, json.memo);
        }
        if (json.toAmount != null) cell.set(SLOT.DATA_START + 1, json.toAmount);

        const pubKey = json.senderPubKey ? Buffer.from(json.senderPubKey, 'hex') : null;
        const sig = json.signature ? Buffer.from(json.signature, 'hex') : null;
        return new Transaction(cell, pubKey, sig);
    }
}

// ── 트랜잭션 유효성 기본 검사 (서명 외) ──

function validateTransaction(tx) {
    const errors = [];
    if (tx.type == null) errors.push('missing type');
    if (!tx.from) errors.push('missing from address');
    if (tx.type === TX_TYPE.TRANSFER) {
        if (!tx.to) errors.push('missing to address');
        if (typeof tx.amount !== 'number' || tx.amount <= 0) errors.push('invalid amount');
        // C4: currency는 이제 트릿 (-1, 0, 1) 또는 문자열
        const cur = tx.currency;
        if (cur == null || (typeof cur === 'number' && ![-1, 0, 1].includes(cur))) errors.push('invalid currency');
    }
    if (tx.type === TX_TYPE.SWAP) {
        if (typeof tx.amount !== 'number' || tx.amount <= 0) errors.push('invalid amount');
    }
    if (typeof tx.nonce !== 'number' || tx.nonce < 0) errors.push('invalid nonce');
    if (!tx.timestamp) errors.push('missing timestamp');
    if (!tx.verify()) errors.push('invalid signature');
    return { valid: errors.length === 0, errors };
}

module.exports = { Transaction, validateTransaction };
