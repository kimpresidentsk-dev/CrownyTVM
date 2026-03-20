// ═══════════════════════════════════════════════════════════════
// chain/indexer.js — 트랜잭션 인덱서
// CrownyCell Chain
//
// 주소별 TX 히스토리, 블록별 TX 매핑
// 체인 저장소와 별도로 인덱스 관리
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { TX_TYPE_NAME, tritToCurrency } = require('./cell');

class TxIndexer {
    constructor(dataDir) {
        this.dir = path.join(dataDir || path.join(__dirname, '..', 'data', 'chain'), 'index');
        if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
        this.addrIndex = this._load('addr-index.json') || {};  // address → [txEntry]
        this.lastIndexedHeight = this._load('meta.json')?.lastHeight ?? -1;
    }

    // ── 블록 인덱싱 ──

    indexBlock(blockJSON) {
        if (!blockJSON || blockJSON.height <= this.lastIndexedHeight) return 0;
        let count = 0;
        const txs = blockJSON.transactions || [];
        for (const tx of txs) {
            const entry = {
                hash: tx.hash,
                type: tx.type,
                typeName: tx.typeName || TX_TYPE_NAME[tx.type] || 'unknown',
                from: tx.from,
                to: tx.to,
                amount: tx.amount,
                currency: tx.currency,
                currencyName: tx.currencyName || tritToCurrency(tx.currency),
                nonce: tx.nonce,
                timestamp: tx.timestamp,
                memo: tx.memo,
                blockHeight: blockJSON.height,
            };
            // swap 추가 필드
            if (tx.toCurrency != null) {
                entry.toCurrency = tx.toCurrency;
                entry.toCurrencyName = tx.toCurrencyName || tritToCurrency(tx.toCurrency);
                entry.toAmount = tx.toAmount;
            }
            // from 주소 인덱스
            if (tx.from) {
                if (!this.addrIndex[tx.from]) this.addrIndex[tx.from] = [];
                this.addrIndex[tx.from].push(entry);
            }
            // to 주소 인덱스 (transfer만)
            if (tx.to && tx.to !== tx.from) {
                if (!this.addrIndex[tx.to]) this.addrIndex[tx.to] = [];
                this.addrIndex[tx.to].push({ ...entry, _direction: 'in' });
            }
            count++;
        }
        this.lastIndexedHeight = blockJSON.height;
        this._save('addr-index.json', this.addrIndex);
        this._save('meta.json', { lastHeight: this.lastIndexedHeight });
        return count;
    }

    // ── 누락 블록 인덱싱 (체인 스토리지에서) ──

    catchUp(chainStorage) {
        const chainHeight = chainStorage.getHeight();
        let total = 0;
        for (let h = this.lastIndexedHeight + 1; h <= chainHeight; h++) {
            const block = chainStorage.getBlock(h);
            if (block) total += this.indexBlock(block);
        }
        return total;
    }

    // ── 주소별 TX 조회 ──

    getByAddress(address, limit, offset) {
        const txs = this.addrIndex[address] || [];
        // 최신순 정렬
        const sorted = txs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const start = offset || 0;
        const end = limit ? start + limit : sorted.length;
        return sorted.slice(start, end);
    }

    // ── 주소별 TX를 지갑 API 형식으로 변환 ──

    getWalletTransactions(address, limit) {
        const txs = this.getByAddress(address, limit || 30);
        return txs.map(tx => {
            const isIn = tx._direction === 'in' || tx.to === address;
            const isSend = tx.from === address && tx.to !== address;
            let txType;
            if (tx.typeName === 'swap') txType = 'swap_out';
            else if (isIn && !isSend) txType = 'receive';
            else txType = 'send';

            return {
                txType,
                currency: tx.currencyName || 'CRM',
                value: tx.amount || 0,
                memo: tx.memo || tx.typeName || '',
                created: (tx.timestamp || 0) * 1000, // 초→밀리초 (프론트엔드 호환)
                blockHeight: tx.blockHeight,
                hash: tx.hash,
            };
        });
    }

    // ── 통계 ──

    getStats() {
        let totalTxs = 0;
        for (const txs of Object.values(this.addrIndex)) totalTxs += txs.length;
        return {
            addresses: Object.keys(this.addrIndex).length,
            totalEntries: totalTxs,
            lastIndexedHeight: this.lastIndexedHeight,
        };
    }

    // ── 파일 I/O ──

    _load(file) {
        const fp = path.join(this.dir, file);
        if (!fs.existsSync(fp)) return null;
        try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
    }

    _save(file, data) {
        fs.writeFileSync(path.join(this.dir, file), JSON.stringify(data));
    }
}

module.exports = { TxIndexer };
