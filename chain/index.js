// ═══════════════════════════════════════════════════════════════
// chain/index.js — CrownyCell Chain 통합 엔트리포인트
// 단일 노드 또는 합의 노드로 실행
// ═══════════════════════════════════════════════════════════════
'use strict';

const { CrownyChain, BLOCK_TIME } = require('./producer');
const { P2PNode, MSG } = require('./p2p');
const { TernaryConsensus } = require('./consensus');
const { Transaction } = require('./transaction');
const { CrownyCell, SLOT, TX_TYPE, TX_TYPE_NAME, CURRENCY, CURRENCY_NAME,
        currencyToTrit, tritToCurrency, EPISTEMIC,
        epistemicForward, epistemicBackward, epistemicReversal } = require('./cell');
const { TritWord, T, O, N } = require('./ternary');
const crypto = require('./crypto');
const compact = require('./compact');
const contract = require('./contract');

class CrownyCellNode {
    constructor(options = {}) {
        this.config = {
            dataDir: options.dataDir,
            p2pPort: options.p2pPort || 9730,
            p2pHost: options.p2pHost || '0.0.0.0',
            seedPeers: options.seedPeers || [],
            keypair: options.keypair || null,
            validators: options.validators || [],
            solo: options.solo || false, // 단독 노드 모드
        };

        // 체인 엔진
        this.chain = new CrownyChain({
            dataDir: this.config.dataDir,
            keypair: this.config.keypair,
        });

        // P2P (solo가 아닌 경우)
        this.p2p = null;
        this.consensus = null;

        if (!this.config.solo) {
            this.p2p = new P2PNode({
                port: this.config.p2pPort,
                host: this.config.p2pHost,
                keypair: this.config.keypair,
                seedPeers: this.config.seedPeers,
            });

            this.consensus = new TernaryConsensus({
                chain: this.chain,
                p2p: this.p2p,
                keypair: this.config.keypair,
            });

            // 검증자 등록
            for (const v of this.config.validators) {
                this.consensus.addValidator(v);
            }
        }
    }

    // ── 시작 ──

    async start() {
        // 체인 초기화
        if (!this.chain.storage.hasChain()) {
            this.chain.initialize();
        } else {
            this.chain._loadState();
        }

        if (this.config.solo) {
            // 단독 모드: 즉시 블록 생성
            this.chain.start();
            console.log('[NODE] Solo mode started');
        } else {
            // P2P + 합의 모드
            await this.p2p.listen();
            await this.p2p.connectToSeeds();
            this.p2p.setChainHeight(this.chain.getHeight());
            this.consensus.start();
            console.log('[NODE] Consensus mode started');
        }

        return this.getStatus();
    }

    stop() {
        this.chain.stop();
        if (this.consensus) this.consensus.stop();
        if (this.p2p) this.p2p.stop();
    }

    // ── 트랜잭션 API ──

    transfer(fromKeypair, toAddress, amount, currency, memo) {
        const fromAddr = crypto.publicKeyToAddress(fromKeypair.publicKey);
        const acct = this.chain.state.getAccount(fromAddr);
        // mempool의 pending TX 중 같은 sender의 최대 nonce 반영
        let maxNonce = acct.nonce;
        for (const [, ptx] of this.chain.mempool) {
            if (ptx.from === fromAddr && ptx.nonce > maxNonce) maxNonce = ptx.nonce;
        }
        const nonce = maxNonce + 1;

        const tx = Transaction.transfer(fromAddr, toAddress, amount, currency, nonce, memo, fromKeypair.publicKey);
        tx.sign(fromKeypair.privateKey);

        const result = this.chain.submitTransaction(tx);

        // P2P 브로드캐스트
        if (result.success && this.consensus) {
            this.consensus.broadcastTransaction(tx);
        }

        return result;
    }

    swap(fromKeypair, fromCurrency, toCurrency, fromAmount) {
        const fromAddr = crypto.publicKeyToAddress(fromKeypair.publicKey);
        const acct = this.chain.state.getAccount(fromAddr);
        let maxNonce = acct.nonce;
        for (const [, ptx] of this.chain.mempool) {
            if (ptx.from === fromAddr && ptx.nonce > maxNonce) maxNonce = ptx.nonce;
        }
        const nonce = maxNonce + 1;

        // 스왑 비율 계산
        const rates = { 'CRM:FNC': 100, 'FNC:CRN': 10 };
        const rateKey = `${fromCurrency}:${toCurrency}`;
        const divisor = rates[rateKey];
        if (!divisor) return { success: false, error: `invalid swap: ${rateKey}` };
        const toAmount = Math.floor((fromAmount / divisor) * 1000) / 1000;

        const tx = Transaction.swap(fromAddr, fromCurrency, toCurrency, fromAmount, toAmount, nonce, fromKeypair.publicKey);
        tx.sign(fromKeypair.privateKey);

        const result = this.chain.submitTransaction(tx);
        if (result.success && this.consensus) {
            this.consensus.broadcastTransaction(tx);
        }
        return result;
    }

    // ── 조회 API ──

    getBalance(address) {
        const acct = this.chain.state.getAccount(address);
        return acct.balances;
    }

    getAccount(address) {
        return this.chain.getAccount(address);
    }

    getStatus() {
        return {
            chain: this.chain.getStatus(),
            p2p: this.p2p ? { peers: this.p2p.getPeerCount(), info: this.p2p.getPeerInfo() } : null,
            consensus: this.consensus ? this.consensus.getStatus() : null,
            solo: this.config.solo,
        };
    }
}

module.exports = {
    CrownyCellNode,
    // Re-export all modules
    CrownyChain, P2PNode, TernaryConsensus, Transaction,
    CrownyCell, SLOT, TX_TYPE, TX_TYPE_NAME, CURRENCY, CURRENCY_NAME,
    currencyToTrit, tritToCurrency,
    EPISTEMIC, epistemicForward, epistemicBackward, epistemicReversal,
    TritWord, T, O, N,
    crypto, compact, contract,
    MSG,
};
