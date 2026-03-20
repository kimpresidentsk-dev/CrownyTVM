// ═══════════════════════════════════════════════════════════════
// chain/consensus.js — 3진 합의 프로토콜 (Phase 2.2)
// CrownyCell Chain
//
// T(+1)=동의, O(0)=보류, N(-1)=반대
// 투표 합계 > 0 → 확정, < 0 → 거부, = 0 → 재투표 1회
// 라운드 로빈 제안자 (height % validatorCount)
// 9초 블록 타임, 3초 투표 대기
// ═══════════════════════════════════════════════════════════════
'use strict';

const { Block } = require('./block');
const { Transaction } = require('./transaction');
const { T, O, N, tallyVotes } = require('./ternary');
const { sign, verify, publicKeyToAddress, sha256hex } = require('./crypto');
const { MSG } = require('./p2p');

const VOTE_TIMEOUT = 3000;     // 투표 대기 3초
const REVOTE_TIMEOUT = 3000;   // 재투표 대기 3초
const PROPOSE_TIMEOUT = 9000;  // 제안 타임아웃 9초

class TernaryConsensus {
    constructor(options = {}) {
        this.chain = options.chain;   // CrownyChain 인스턴스
        this.p2p = options.p2p;       // P2PNode 인스턴스
        this.keypair = options.keypair;
        this.myAddress = options.keypair ? publicKeyToAddress(options.keypair.publicKey) : null;

        // 검증자 목록 (pubKeyHex → { address, pubKey })
        this.validators = new Map();
        this.validatorOrder = []; // 라운드 로빈 순서용

        // 현재 라운드 상태
        this.currentRound = null;
        this.roundTimer = null;
        this.blockTimer = null;
        this.isRunning = false;
    }

    // ── 검증자 등록 ──

    addValidator(pubKeyHex) {
        const pubKey = Buffer.from(pubKeyHex, 'hex');
        const address = publicKeyToAddress(pubKey);
        this.validators.set(pubKeyHex, { address, pubKey });
        this.validatorOrder = Array.from(this.validators.keys()).sort();
    }

    removeValidator(pubKeyHex) {
        this.validators.delete(pubKeyHex);
        this.validatorOrder = Array.from(this.validators.keys()).sort();
    }

    isValidator() {
        return this.keypair && this.validators.has(this.keypair.publicKey.toString('hex'));
    }

    // ── 현재 라운드의 제안자 (라운드 로빈) ──

    getProposer(height) {
        if (this.validatorOrder.length === 0) return null;
        const idx = height % this.validatorOrder.length;
        return this.validatorOrder[idx];
    }

    isMyTurnToPropose() {
        const nextHeight = (this.chain ? this.chain.getHeight() : 0) + 1;
        const proposer = this.getProposer(nextHeight);
        return proposer === (this.keypair ? this.keypair.publicKey.toString('hex') : null);
    }

    // ── 합의 시작 ──

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // P2P 메시지 핸들러 등록
        this.p2p.onMessage(MSG.PROPOSE_BLOCK, (msg, peerId) => this._onPropose(msg, peerId));
        this.p2p.onMessage(MSG.VOTE, (msg, peerId) => this._onVote(msg, peerId));
        this.p2p.onMessage(MSG.COMMIT_BLOCK, (msg, peerId) => this._onCommit(msg, peerId));
        this.p2p.onMessage(MSG.NEW_TX, (msg, peerId) => this._onNewTx(msg, peerId));
        this.p2p.onMessage(MSG.REQUEST_BLOCKS, (msg, peerId) => this._onRequestBlocks(msg, peerId));

        // 블록 생성 주기 시작
        this.blockTimer = setInterval(() => this._tryPropose(), PROPOSE_TIMEOUT);
        console.log(`[CONSENSUS] Started. Validators: ${this.validatorOrder.length}, My turn: ${this.isMyTurnToPropose()}`);
    }

    stop() {
        this.isRunning = false;
        if (this.blockTimer) { clearInterval(this.blockTimer); this.blockTimer = null; }
        if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
        this.currentRound = null;
        console.log('[CONSENSUS] Stopped.');
    }

    // ── Phase 1: PROPOSE ──

    _tryPropose() {
        if (!this.isRunning || !this.chain || !this.keypair) return;
        if (this.currentRound) return; // 이미 라운드 진행 중

        if (!this.isMyTurnToPropose()) return;
        if (this.chain.getMempoolSize() === 0) return; // 빈 블록 안 만듦

        // B1 FIX: 후보만 생성, 상태 적용하지 않음
        const candidate = this.chain._buildCandidateBlock();
        if (!candidate) return;
        const block = candidate.block;

        // 라운드 시작
        this.currentRound = {
            block,
            candidate, // includedHashes 보존 (커밋 시 필요)
            blockHash: block.hash(),
            height: block.height,
            votes: new Map(),
            revoteCount: 0,
            phase: 'voting',
        };

        // 자신의 투표 (제안자는 항상 T)
        this.currentRound.votes.set(this.keypair.publicKey.toString('hex'), T);

        // 블록 브로드캐스트
        this.p2p.broadcast({
            type: MSG.PROPOSE_BLOCK,
            block: block.toJSON(),
            proposer: this.keypair.publicKey.toString('hex'),
        });

        console.log(`[CONSENSUS] Proposed block #${block.height} (${block.transactions.length} txs)`);

        // 투표 타임아웃
        this.roundTimer = setTimeout(() => this._checkVotes(), VOTE_TIMEOUT);
    }

    // ── Phase 2: VOTE (수신 측) ──

    _onPropose(msg, peerId) {
        if (!this.isRunning || !this.chain || !this.keypair) return;
        if (this.currentRound) return; // 이미 다른 라운드 진행 중

        const blockJSON = msg.block;
        if (!blockJSON) return;

        // 높이 체크
        const expectedHeight = this.chain.getHeight() + 1;
        if (blockJSON.height !== expectedHeight) {
            console.warn(`[CONSENSUS] Wrong height: expected ${expectedHeight}, got ${blockJSON.height}`);
            return;
        }

        // 제안자가 올바른 차례인지 확인
        const proposer = this.getProposer(blockJSON.height);
        if (proposer !== msg.proposer) {
            console.warn(`[CONSENSUS] Wrong proposer: expected ${proposer?.slice(0,16)}, got ${msg.proposer?.slice(0,16)}`);
            this._sendVote(blockJSON, N, 'wrong proposer');
            return;
        }

        // 블록 검증
        const vote = this._validateBlock(blockJSON);

        // 라운드 기록
        this.currentRound = {
            block: null, // 제안자가 아니므로 블록 객체 없음
            blockJSON,
            blockHash: blockJSON.hash,
            height: blockJSON.height,
            votes: new Map(),
            revoteCount: 0,
            phase: 'voting',
        };
        this.currentRound.votes.set(this.keypair.publicKey.toString('hex'), vote);

        // 투표 전송
        this._sendVote(blockJSON, vote);

        // 커밋 대기 타임아웃
        this.roundTimer = setTimeout(() => this._roundTimeout(), VOTE_TIMEOUT + REVOTE_TIMEOUT);
    }

    _validateBlock(blockJSON) {
        // previousHash 체크
        if (blockJSON.previousHash !== this.chain.storage.getLatestHash()) {
            return N;
        }
        // 타임스탬프 합리성 (±30초)
        if (Math.abs(blockJSON.timestamp - Date.now()) > 30000) {
            return N;
        }
        // 트랜잭션 수 제한
        if (!blockJSON.transactions || blockJSON.transactions.length > 729) {
            return N;
        }
        // C5 FIX: 트랜잭션별 서명 검증 + 상태 전이 검증
        const txs = blockJSON.transactions.map(txj => Transaction.fromJSON(txj));
        for (const tx of txs) {
            if (!tx || !tx.verify()) return N; // 서명 무효
        }
        // 상태 dry-run: 모든 TX가 유효한 상태 전이를 만드는지
        const snap = this.chain.state.snapshot();
        for (const tx of txs) {
            const result = this.chain.state.applyTransaction(tx);
            if (!result.success) {
                this.chain.state.restore(snap);
                return N; // 상태 전이 무효
            }
        }
        this.chain.state.restore(snap);
        return T; // 모든 검증 통과
    }

    _sendVote(blockJSON, vote, reason) {
        const voteMsg = {
            type: MSG.VOTE,
            blockHash: blockJSON.hash || sha256hex(JSON.stringify(blockJSON)),
            height: blockJSON.height,
            vote,
            voter: this.keypair.publicKey.toString('hex'),
            reason: reason || null,
        };
        // 투표에 서명
        const payload = Buffer.from(voteMsg.blockHash + ':' + vote);
        voteMsg.sig = sign(payload, this.keypair.privateKey).toString('hex');

        this.p2p.broadcast(voteMsg);
    }

    // ── Phase 2: VOTE 수신 (제안자 측) ──

    _onVote(msg, peerId) {
        if (!this.currentRound || this.currentRound.phase !== 'voting') return;
        if (msg.height !== this.currentRound.height) return;

        // 검증자인지 확인
        if (!this.validators.has(msg.voter)) return;

        // 서명 검증
        const voterPubKey = this.validators.get(msg.voter).pubKey;
        const payload = Buffer.from(msg.blockHash + ':' + msg.vote);
        if (!verify(payload, Buffer.from(msg.sig, 'hex'), voterPubKey)) return;

        this.currentRound.votes.set(msg.voter, msg.vote);
        console.log(`[CONSENSUS] Vote from ${msg.voter.slice(0,8)}: ${msg.vote > 0 ? 'T(agree)' : msg.vote < 0 ? 'N(reject)' : 'O(hold)'}`);

        // 모든 검증자가 투표했으면 즉시 집계
        if (this.currentRound.votes.size >= this.validatorOrder.length) {
            if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
            this._checkVotes();
        }
    }

    // ── Phase 3: 투표 집계 ──

    _checkVotes() {
        if (!this.currentRound) return;

        const votes = Array.from(this.currentRound.votes.values());
        const result = tallyVotes(votes);

        console.log(`[CONSENSUS] Tally: T=${result.detail.T} O=${result.detail.O} N=${result.detail.N} → sum=${result.sum}`);

        if (result.confirmed) {
            // ── 확정: COMMIT ──
            this._commitBlock();
        } else if (result.held && this.currentRound.revoteCount < 1) {
            // ── 보류: 재투표 1회 ──
            console.log('[CONSENSUS] Held → revote');
            this.currentRound.revoteCount++;
            this.currentRound.votes.clear();
            this.currentRound.votes.set(this.keypair.publicKey.toString('hex'), T); // 제안자는 항상 T
            this.roundTimer = setTimeout(() => this._checkVotes(), REVOTE_TIMEOUT);
        } else {
            // ── 거부 또는 재투표 실패 ──
            console.log('[CONSENSUS] Block rejected');
            // 블록을 state에서 롤백 (producer가 이미 적용했으므로)
            // TODO: 롤백 구현 (현재는 다음 블록에서 자연 복구)
            this._clearRound();
        }
    }

    // ── Phase 4: COMMIT ──

    _commitBlock() {
        if (!this.currentRound) return;

        // B1 FIX: 합의 성공 후에만 상태 적용
        if (this.currentRound.block && this.currentRound.candidate) {
            const ok = this.chain._commitBlock(
                this.currentRound.block,
                this.currentRound.candidate.includedHashes
            );
            if (!ok) {
                console.error('[CONSENSUS] Failed to commit own block');
                this._clearRound();
                return;
            }
        }

        const blockJSON = this.currentRound.block
            ? this.currentRound.block.toJSON()
            : this.currentRound.blockJSON;

        // 투표 정보 추가
        blockJSON.votes = Array.from(this.currentRound.votes.entries()).map(([voter, vote]) => ({
            voterPubKey: voter,
            vote,
        }));

        // COMMIT 브로드캐스트
        this.p2p.broadcast({
            type: MSG.COMMIT_BLOCK,
            block: blockJSON,
        });

        console.log(`[CONSENSUS] Block #${blockJSON.height} COMMITTED ✓`);
        this._clearRound();
    }

    _onCommit(msg, peerId) {
        if (!msg.block) return;

        // 이미 이 높이의 블록이 있으면 무시
        if (msg.block.height <= this.chain.getHeight()) return;

        // 블록 수신 + 적용
        const result = this.chain.receiveBlock(msg.block);
        if (result.success) {
            console.log(`[CONSENSUS] Received committed block #${msg.block.height}`);
        } else {
            console.warn(`[CONSENSUS] Failed to apply committed block: ${result.error}`);
        }
        this._clearRound();
    }

    // ── 트랜잭션 브로드캐스트 ──

    // B3 FIX: Transaction.fromJSON 구현 완료 → 트랜잭션 P2P 전파 활성화
    _onNewTx(msg, peerId) {
        if (!this.chain || !msg.tx) return;
        const tx = Transaction.fromJSON(msg.tx);
        if (!tx) return;
        this.chain.submitTransaction(tx);
    }

    broadcastTransaction(tx) {
        this.p2p.broadcast({
            type: MSG.NEW_TX,
            tx: tx.toJSON(),
        });
    }

    // ── 블록 싱크 (Phase 2.3) ──

    _onRequestBlocks(msg, peerId) {
        const from = msg.fromHeight || 0;
        const to = msg.toHeight || this.chain.getHeight();
        const blocks = this.chain.storage.getBlockRange(from, to);
        this.p2p.sendToPeer(peerId, {
            type: MSG.BLOCKS,
            blocks,
        });
    }

    requestSync(peerId) {
        const myHeight = this.chain ? this.chain.getHeight() : -1;
        this.p2p.sendToPeer(peerId, {
            type: MSG.REQUEST_BLOCKS,
            fromHeight: myHeight + 1,
            toHeight: myHeight + 27, // 27블록씩 (3³)
        });
    }

    // ── 유틸 ──

    _clearRound() {
        this.currentRound = null;
        if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
    }

    _roundTimeout() {
        console.warn('[CONSENSUS] Round timeout');
        this._clearRound();
    }

    getStatus() {
        return {
            running: this.isRunning,
            validators: this.validatorOrder.length,
            myTurn: this.isMyTurnToPropose(),
            currentRound: this.currentRound ? {
                height: this.currentRound.height,
                phase: this.currentRound.phase,
                votes: this.currentRound.votes.size,
            } : null,
        };
    }
}

module.exports = { TernaryConsensus, VOTE_TIMEOUT, REVOTE_TIMEOUT, PROPOSE_TIMEOUT };
