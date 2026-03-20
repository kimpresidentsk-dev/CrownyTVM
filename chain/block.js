// ═══════════════════════════════════════════════════════════════
// chain/block.js — 블록 구조 + 3진 머클 트리 (Phase 1.2)
// CrownyCell Chain
//
// 블록 = 최대 729(3⁶)개 트랜잭션 셀의 묶음
// 해시 체인: SHA-256(header) → previousHash 연결
// 3진 머클: 3개씩 묶어 해시 (크라우니어 네이티브)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { ternaryMerkleRoot, sha256 } = require('./ternary');
const { sha256hex, sign, verify } = require('./crypto');
const { Transaction } = require('./transaction');

const MAX_TXS_PER_BLOCK = 729; // 3⁶
const BLOCK_VERSION = 1;

class Block {
    constructor() {
        // ── 헤더 ──
        this.version = BLOCK_VERSION;
        this.height = 0;
        this.previousHash = '0'.repeat(64); // SHA-256 hex
        this.merkleRoot = '0'.repeat(64);
        this.stateRoot = '0'.repeat(64);
        this.timestamp = Date.now();
        this.proposerPubKey = null;  // Buffer (DER)
        this.proposerSig = null;     // Buffer (64B)

        // ── 본문 ──
        this.transactions = [];      // Transaction[]

        // ── 합의 투표 ──
        this.votes = [];             // { voterPubKey, vote: T/O/N, sig }
    }

    // ── 트랜잭션 추가 ──
    addTransaction(tx) {
        if (this.transactions.length >= MAX_TXS_PER_BLOCK) return false;
        this.transactions.push(tx);
        return true;
    }

    // ── 3진 머클 루트 계산 ──
    computeMerkleRoot() {
        if (this.transactions.length === 0) {
            this.merkleRoot = sha256hex(Buffer.alloc(0));
            return this.merkleRoot;
        }
        const hashes = this.transactions.map(tx => tx.hashBuffer());
        this.merkleRoot = ternaryMerkleRoot(hashes).toString('hex');
        return this.merkleRoot;
    }

    // ── 헤더 해시 (서명 제외, 합의 투표 제외) ──
    headerPayload() {
        return Buffer.from(JSON.stringify({
            v: this.version,
            h: this.height,
            p: this.previousHash,
            m: this.merkleRoot,
            s: this.stateRoot,
            t: this.timestamp,
            pk: this.proposerPubKey ? this.proposerPubKey.toString('hex') : '',
        }));
    }

    hash() {
        return sha256hex(this.headerPayload());
    }

    hashBuffer() {
        return sha256(this.headerPayload());
    }

    // ── 제안자 서명 ──
    signAsProposer(privateKeyDer) {
        this.computeMerkleRoot();
        this.proposerSig = sign(this.headerPayload(), privateKeyDer);
        return this;
    }

    verifyProposerSig() {
        if (!this.proposerPubKey || !this.proposerSig) return false;
        return verify(this.headerPayload(), this.proposerSig, this.proposerPubKey);
    }

    // ── 투표 추가 ──
    // vote: 1(T), 0(O), -1(N)
    addVote(voterPubKey, vote, voterPrivateKey) {
        const votePayload = Buffer.from(this.hash() + ':' + vote);
        const sig = sign(votePayload, voterPrivateKey);
        this.votes.push({
            voterPubKey,
            vote,
            sig,
        });
        return this;
    }

    verifyVote(voteEntry) {
        const votePayload = Buffer.from(this.hash() + ':' + voteEntry.vote);
        return verify(votePayload, voteEntry.sig, voteEntry.voterPubKey);
    }

    // 투표 집계
    tallyVotes() {
        let sum = 0;
        const detail = { T: 0, O: 0, N: 0 };
        for (const v of this.votes) {
            sum += v.vote;
            if (v.vote > 0) detail.T++;
            else if (v.vote < 0) detail.N++;
            else detail.O++;
        }
        return { sum, detail, confirmed: sum > 0, rejected: sum < 0, held: sum === 0 };
    }

    // ── 직렬화 (JSON, 저장/전송용) ──
    toJSON() {
        return {
            version: this.version,
            height: this.height,
            previousHash: this.previousHash,
            merkleRoot: this.merkleRoot,
            stateRoot: this.stateRoot,
            timestamp: this.timestamp,
            hash: this.hash(),
            proposerPubKey: this.proposerPubKey ? this.proposerPubKey.toString('hex') : null,
            proposerSig: this.proposerSig ? this.proposerSig.toString('hex') : null,
            transactions: this.transactions.map(tx => tx.toJSON()),
            votes: this.votes.map(v => ({
                voterPubKey: v.voterPubKey.toString('hex'),
                vote: v.vote,
                sig: v.sig.toString('hex'),
            })),
            txCount: this.transactions.length,
        };
    }

    static fromJSON(json) {
        const block = new Block();
        block.version = json.version || BLOCK_VERSION;
        block.height = json.height || 0;
        block.previousHash = json.previousHash || '0'.repeat(64);
        block.merkleRoot = json.merkleRoot || '0'.repeat(64);
        block.stateRoot = json.stateRoot || '0'.repeat(64);
        block.timestamp = json.timestamp || Date.now();
        block.proposerPubKey = json.proposerPubKey ? Buffer.from(json.proposerPubKey, 'hex') : null;
        block.proposerSig = json.proposerSig ? Buffer.from(json.proposerSig, 'hex') : null;
        // B2 FIX: 트랜잭션 완전 복원
        block.transactions = (json.transactions || []).map(txJson => Transaction.fromJSON(txJson));
        block.votes = (json.votes || []).map(v => ({
            voterPubKey: Buffer.from(v.voterPubKey, 'hex'),
            vote: v.vote,
            sig: v.sig ? Buffer.from(v.sig, 'hex') : Buffer.alloc(0),
        }));
        return block;
    }

    // ── 제네시스 블록 여부 ──
    isGenesis() {
        return this.height === 0 && this.previousHash === '0'.repeat(64);
    }
}

module.exports = { Block, MAX_TXS_PER_BLOCK, BLOCK_VERSION };
