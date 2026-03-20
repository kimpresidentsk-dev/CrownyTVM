// ═══════════════════════════════════════════════════════════════
// chain/state.js — 계정 상태 관리 (압축 준비)
// CrownyCell Chain
//
// C3+C4 적용: TX_TYPE 정수, CURRENCY 트릿
// Account: 잔액 키는 문자열 'CRN'/'FNC'/'CRM' 유지 (내부)
// 외부에서 트릿으로 받으면 tritToCurrency로 변환
// ═══════════════════════════════════════════════════════════════
'use strict';

const { sha256hex } = require('./crypto');
const { TX_TYPE, CURRENCY, tritToCurrency, SLOT } = require('./cell');

// ── 스왑 비율 (상향만) ──
const SWAP_RATES = {
    'CRM:FNC': { divisor: 100, min: 100 },
    'FNC:CRN': { divisor: 10,  min: 10 },
};

class Account {
    constructor(address) {
        this.address = address;
        this.nonce = 0;
        this.balances = { CRN: 0, FNC: 0, CRM: 0 };
        this.epistemicScore = 0;
    }

    clone() {
        const a = new Account(this.address);
        a.nonce = this.nonce;
        a.balances = { ...this.balances };
        a.epistemicScore = this.epistemicScore;
        return a;
    }

    toJSON() {
        return {
            address: this.address,
            nonce: this.nonce,
            balances: { ...this.balances },
            epistemicScore: this.epistemicScore,
        };
    }

    static fromJSON(json) {
        const a = new Account(json.address);
        a.nonce = json.nonce || 0;
        a.balances = json.balances ? { ...json.balances } : { CRN: 0, FNC: 0, CRM: 0 };
        a.epistemicScore = json.epistemicScore || 0;
        return a;
    }
}

// 통화 키 해석: 트릿 또는 문자열 → 문자열 키
function _cur(val) {
    if (typeof val === 'string' && ['CRN', 'FNC', 'CRM'].includes(val)) return val;
    return tritToCurrency(val);
}

class StateManager {
    constructor() {
        this.accounts = new Map();
    }

    getAccount(address) {
        if (!this.accounts.has(address)) {
            this.accounts.set(address, new Account(address));
        }
        return this.accounts.get(address);
    }

    getBalance(address, currency) {
        return this.getAccount(address).balances[_cur(currency)] || 0;
    }

    snapshot() {
        const snap = new Map();
        for (const [addr, acct] of this.accounts) snap.set(addr, acct.clone());
        return snap;
    }

    restore(snap) { this.accounts = snap; }

    // C10: 결정론적 상태 루트 (바이너리, JSON.stringify 대신 정렬+직렬화)
    stateRoot() {
        const sorted = Array.from(this.accounts.entries())
            .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        // 결정론적 바이너리: address + nonce + CRN + FNC + CRM
        const parts = [];
        for (const [addr, acct] of sorted) {
            const buf = Buffer.alloc(8 * 4); // nonce + 3 balances
            buf.writeBigInt64BE(BigInt(acct.nonce), 0);
            buf.writeBigInt64BE(BigInt(Math.round((acct.balances.CRN || 0) * 1000)), 8);
            buf.writeBigInt64BE(BigInt(Math.round((acct.balances.FNC || 0) * 1000)), 16);
            buf.writeBigInt64BE(BigInt(Math.round((acct.balances.CRM || 0) * 1000)), 24);
            parts.push(Buffer.from(addr, 'utf8'));
            parts.push(buf);
        }
        return sha256hex(Buffer.concat(parts));
    }

    // ── 트랜잭션 적용 ──

    applyTransaction(tx) {
        const type = tx.type;
        switch (type) {
            case TX_TYPE.TRANSFER: return this._applyTransfer(tx);
            case TX_TYPE.SWAP:     return this._applySwap(tx);
            case TX_TYPE.REGISTER: return this._applyRegister(tx);
            case TX_TYPE.CELL_CREATE:
            case TX_TYPE.CELL_LINK:
            case TX_TYPE.CELL_EVIDENCE:
                return this._applyCellOp(tx);
            default:
                return { success: false, error: `unknown tx type: ${type}` };
        }
    }

    _applyTransfer(tx) {
        const from = this.getAccount(tx.from);
        const cur = _cur(tx.currency); // C4: 트릿→문자열 변환
        const amount = tx.amount;

        if (tx.nonce !== from.nonce + 1) {
            return { success: false, error: `nonce mismatch: expected ${from.nonce + 1}, got ${tx.nonce}` };
        }
        if ((from.balances[cur] || 0) < amount) {
            return { success: false, error: `insufficient ${cur}: have ${from.balances[cur]}, need ${amount}` };
        }

        from.balances[cur] -= amount;
        from.nonce = tx.nonce;

        const to = this.getAccount(tx.to);
        to.balances[cur] = (to.balances[cur] || 0) + amount;

        return { success: true };
    }

    _applySwap(tx) {
        const from = this.getAccount(tx.from);
        const fromCur = _cur(tx.currency);
        const fromAmount = tx.amount;
        const toCur = _cur(tx.cell ? tx.cell.get(SLOT.DATA_START) : null);
        const toAmount = tx.cell ? tx.cell.get(SLOT.DATA_START + 1) : null;

        if (tx.nonce !== from.nonce + 1) {
            return { success: false, error: 'nonce mismatch' };
        }

        const rateKey = `${fromCur}:${toCur}`;
        const rate = SWAP_RATES[rateKey];
        if (!rate) return { success: false, error: `invalid swap path: ${rateKey}` };
        if (fromAmount < rate.min) return { success: false, error: `minimum swap: ${rate.min} ${fromCur}` };
        if ((from.balances[fromCur] || 0) < fromAmount) return { success: false, error: `insufficient ${fromCur}` };

        const expectedTo = fromAmount / rate.divisor;
        if (toAmount > expectedTo * 1.03 || toAmount < expectedTo * 0.97) {
            return { success: false, error: 'swap amount out of range' };
        }

        from.balances[fromCur] -= fromAmount;
        from.balances[toCur] = (from.balances[toCur] || 0) + toAmount;
        from.nonce = tx.nonce;

        return { success: true };
    }

    _applyRegister(tx) {
        const acct = this.getAccount(tx.from);
        if (acct.nonce > 0) return { success: false, error: 'account already registered' };
        return { success: true };
    }

    _applyCellOp(tx) {
        const from = this.getAccount(tx.from);
        if (tx.nonce !== from.nonce + 1) return { success: false, error: 'nonce mismatch' };
        from.nonce = tx.nonce;
        from.epistemicScore += 1;
        return { success: true };
    }

    applyBlock(block) {
        const snap = this.snapshot();
        for (const tx of block.transactions) {
            const result = this.applyTransaction(tx);
            if (!result.success) {
                this.restore(snap);
                return { success: false, error: result.error, failedTx: tx.hash ? tx.hash() : null };
            }
        }
        return { success: true };
    }

    toJSON() {
        const accounts = {};
        for (const [addr, acct] of this.accounts) accounts[addr] = acct.toJSON();
        return { accounts, stateRoot: this.stateRoot() };
    }

    static fromJSON(json) {
        const sm = new StateManager();
        if (json.accounts) {
            for (const [addr, data] of Object.entries(json.accounts)) {
                sm.accounts.set(addr, Account.fromJSON(data));
            }
        }
        return sm;
    }
}

module.exports = { StateManager, Account, SWAP_RATES };
