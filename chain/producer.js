// ═══════════════════════════════════════════════════════════════
// chain/producer.js — 블록 생성기 + 단일 노드 체인 엔진 (Phase 1.6)
// CrownyCell Chain
//
// 9초 간격 블록 생성 (3² = 삼진법 테마)
// mempool에서 트랜잭션 수집 → 검증 → 블록 생성 → 저장
// Phase 2에서 합의 프로토콜 추가 시 이 엔진 위에 구축
// ═══════════════════════════════════════════════════════════════
'use strict';

const { Block, MAX_TXS_PER_BLOCK } = require('./block');
const { Transaction, validateTransaction } = require('./transaction');
const { StateManager } = require('./state');
const { ChainStorage } = require('./storage');
const { createGenesisBlock } = require('./genesis');

const BLOCK_TIME = 9000; // 9초 (3²)

class CrownyChain {
    constructor(options = {}) {
        this.storage = new ChainStorage(options.dataDir);
        this.state = new StateManager();
        this.mempool = new Map();  // txHash → Transaction
        this.proposerKeypair = options.keypair || null;
        this.blockTimer = null;
        this.isRunning = false;
        this.listeners = [];  // 이벤트 리스너 { event, callback }

        // 기존 체인 로드
        if (this.storage.hasChain()) {
            this._loadState();
        }
    }

    // ── 체인 초기화 (제네시스) ──

    initialize(options = {}) {
        if (this.storage.hasChain()) {
            console.log('[CHAIN] Chain already exists at height', this.storage.getHeight());
            return this.storage.getMeta();
        }

        console.log('[CHAIN] Creating genesis block...');
        const genesis = createGenesisBlock(options);

        // 저장
        this.storage.putBlock(genesis.block);
        this.state = genesis.state;
        this.storage.putState(this.state.toJSON());

        console.log('[CHAIN] Genesis created:', genesis.stats);
        this._emit('genesis', { block: genesis.block.toJSON(), stats: genesis.stats });

        return {
            ...this.storage.getMeta(),
            treasury: genesis.treasury,
            migrations: genesis.migrations,
            stats: genesis.stats,
        };
    }

    // ── 트랜잭션 제출 ──

    submitTransaction(tx) {
        const hash = tx.hash();

        // 중복 체크
        if (this.mempool.has(hash)) {
            return { success: false, error: 'duplicate transaction' };
        }

        // 기본 유효성 검사
        const validation = validateTransaction(tx);
        if (!validation.valid) {
            return { success: false, error: validation.errors.join(', ') };
        }

        // 상태 기반 검증 (잔액, nonce 등) — dry-run
        // mempool에 이미 있는 같은 sender TX를 포함하여 순서대로 검증
        const snap = this.state.snapshot();
        // 먼저 mempool의 기존 TX를 nonce 순서로 적용 (pending 상태 시뮬레이션)
        const pendingFromSameSender = Array.from(this.mempool.values())
            .filter(t => t.from === tx.from)
            .sort((a, b) => (a.nonce || 0) - (b.nonce || 0));
        for (const pending of pendingFromSameSender) {
            this.state.applyTransaction(pending); // 실패해도 계속 (이미 mempool에 있으니)
        }
        const result = this.state.applyTransaction(tx);
        this.state.restore(snap); // 되돌림

        if (!result.success) {
            return { success: false, error: result.error };
        }

        this.mempool.set(hash, tx);
        this._emit('tx:pending', { hash, type: tx.type });
        return { success: true, hash };
    }

    // ── 블록 생성 (2단계: 후보 빌드 → 커밋) ──

    // B1 FIX: 합의 전에 상태를 적용하지 않음.
    // Step 1: 후보 블록 생성 (상태 dry-run, 스냅샷으로 되돌림)
    _buildCandidateBlock() {
        if (this.mempool.size === 0) return null;
        if (!this.proposerKeypair) return null;

        const block = new Block();
        block.height = this.storage.getHeight() + 1;
        block.previousHash = this.storage.getLatestHash();
        block.timestamp = Date.now();
        block.proposerPubKey = this.proposerKeypair.publicKey;

        // dry-run: nonce 순서대로 적용하기 위해 from 주소별 정렬
        const snap = this.state.snapshot();
        const included = [];

        // mempool TX를 nonce 순서로 정렬 (같은 sender의 TX가 순서대로 적용되게)
        const sorted = Array.from(this.mempool.entries())
            .sort((a, b) => (a[1].nonce || 0) - (b[1].nonce || 0));

        for (const [hash, tx] of sorted) {
            if (included.length >= MAX_TXS_PER_BLOCK) break;
            const result = this.state.applyTransaction(tx);
            if (result.success) {
                block.addTransaction(tx);
                included.push(hash);
            }
            // 실패한 TX는 삭제하지 않음 — 다음 블록에서 재시도
        }

        if (included.length === 0) {
            this.state.restore(snap);
            return null;
        }

        block.computeMerkleRoot();
        block.stateRoot = this.state.stateRoot();
        block.signAsProposer(this.proposerKeypair.privateKey);

        // 되돌림 — 아직 커밋하지 않음
        this.state.restore(snap);

        return { block, includedHashes: included };
    }

    // Step 2: 후보 블록을 실제로 적용 + 저장 (합의 성공 후 호출)
    _commitBlock(block, includedHashes) {
        // 상태 적용
        const result = this.state.applyBlock(block);
        if (!result.success) {
            console.error('[CHAIN] commitBlock failed:', result.error);
            return false;
        }
        // 저장
        this.storage.putBlock(block);
        this.storage.putState(this.state.toJSON());
        // mempool 정리
        if (includedHashes) {
            for (const h of includedHashes) this.mempool.delete(h);
        }
        console.log(`[CHAIN] Block #${block.height} committed: ${block.transactions.length} txs, hash: ${block.hash().slice(0, 16)}...`);
        this._emit('block', { height: block.height, hash: block.hash(), txCount: block.transactions.length });
        return true;
    }

    // Solo 모드 호환: 빌드 + 즉시 커밋
    _produceBlock() {
        const candidate = this._buildCandidateBlock();
        if (!candidate) return null;
        this._commitBlock(candidate.block, candidate.includedHashes);
        return candidate.block;
    }

    // ── 외부 블록 수신 (Phase 2 합의용) ──

    receiveBlock(blockJSON) {
        const block = Block.fromJSON(blockJSON);

        // 높이 체크
        if (block.height !== this.storage.getHeight() + 1) {
            return { success: false, error: `height mismatch: expected ${this.storage.getHeight() + 1}, got ${block.height}` };
        }

        // previousHash 체크
        if (block.previousHash !== this.storage.getLatestHash()) {
            return { success: false, error: 'previousHash mismatch' };
        }

        // 제안자 서명 검증
        if (!block.verifyProposerSig()) {
            return { success: false, error: 'invalid proposer signature' };
        }

        // 트랜잭션 적용
        const snap = this.state.snapshot();
        const result = this.state.applyBlock(block);
        if (!result.success) {
            this.state.restore(snap);
            return { success: false, error: result.error };
        }

        // 저장
        this.storage.putBlock(block);
        this.storage.putState(this.state.toJSON());

        // 포함된 트랜잭션을 mempool에서 제거
        for (const tx of block.transactions) {
            this.mempool.delete(tx.hash ? tx.hash() : tx.hash);
        }

        this._emit('block', { height: block.height, hash: block.hash(), txCount: block.transactions.length });
        return { success: true };
    }

    // ── 시작/정지 ──

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        if (!this.storage.hasChain()) {
            this.initialize();
        } else {
            this._loadState();
        }

        this.blockTimer = setInterval(() => {
            try { this._produceBlock(); } catch (e) { console.error('[CHAIN] Block production error:', e); }
        }, BLOCK_TIME);

        console.log(`[CHAIN] Started. Height: ${this.storage.getHeight()}, Block time: ${BLOCK_TIME/1000}s`);
        this._emit('start', { height: this.storage.getHeight() });
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.blockTimer) { clearInterval(this.blockTimer); this.blockTimer = null; }
        console.log('[CHAIN] Stopped.');
        this._emit('stop', {});
    }

    // ── 조회 API ──

    getBalance(address, currency) { return this.state.getBalance(address, currency); }
    getAccount(address) { return this.state.getAccount(address).toJSON(); }
    getBlock(height) { return this.storage.getBlock(height); }
    getLatestBlock() { return this.storage.getLatestBlock(); }
    getHeight() { return this.storage.getHeight(); }
    getMeta() { return this.storage.getMeta(); }
    getMempoolSize() { return this.mempool.size; }

    getStatus() {
        return {
            running: this.isRunning,
            height: this.storage.getHeight(),
            latestHash: this.storage.getLatestHash(),
            mempoolSize: this.mempool.size,
            accounts: this.state.accounts.size,
            stateRoot: this.state.stateRoot(),
        };
    }

    // ── 이벤트 시스템 ──

    on(event, callback) { this.listeners.push({ event, callback }); }
    _emit(event, data) {
        for (const l of this.listeners) {
            if (l.event === event || l.event === '*') {
                try { l.callback(data); } catch {}
            }
        }
    }

    // ── 내부 ──

    _loadState() {
        const stateJSON = this.storage.getState();
        if (stateJSON) {
            this.state = StateManager.fromJSON(stateJSON);
            console.log(`[CHAIN] State loaded: ${this.state.accounts.size} accounts`);
        }
    }
}

module.exports = { CrownyChain, BLOCK_TIME };
