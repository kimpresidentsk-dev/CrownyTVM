// ═══════════════════════════════════════════════════════════════
// chain/storage.js — 체인 저장소 (Phase 1.4)
// CrownyCell Chain
//
// 파일 기반 저장 (Phase 1 MVP)
// 향후 LevelDB로 전환 가능한 인터페이스
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

class ChainStorage {
    constructor(dataDir) {
        this.dataDir = dataDir || path.join(__dirname, '..', 'data', 'chain');
        this.blocksDir = path.join(this.dataDir, 'blocks');
        this.stateFile = path.join(this.dataDir, 'state.json');
        this.metaFile = path.join(this.dataDir, 'meta.json');

        // 디렉토리 생성
        [this.dataDir, this.blocksDir].forEach(d => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        });

        // 메타데이터 로드
        this.meta = this._loadJSON(this.metaFile) || {
            latestHeight: -1,
            latestHash: '0'.repeat(64),
            genesisHash: null,
            totalTransactions: 0,
            createdAt: Date.now(),
        };
    }

    // ── 블록 저장/로드 ──

    putBlock(block) {
        const json = typeof block.toJSON === 'function' ? block.toJSON() : block;
        const file = path.join(this.blocksDir, `${json.height}.json`);
        fs.writeFileSync(file, JSON.stringify(json, null, 2));

        // 메타 업데이트
        this.meta.latestHeight = json.height;
        this.meta.latestHash = json.hash;
        if (json.height === 0) this.meta.genesisHash = json.hash;
        this.meta.totalTransactions += (json.txCount || json.transactions?.length || 0);
        this._saveMeta();
    }

    getBlock(height) {
        const file = path.join(this.blocksDir, `${height}.json`);
        return this._loadJSON(file);
    }

    getLatestBlock() {
        if (this.meta.latestHeight < 0) return null;
        return this.getBlock(this.meta.latestHeight);
    }

    // ── 상태 저장/로드 ──

    putState(stateJSON) {
        fs.writeFileSync(this.stateFile, JSON.stringify(stateJSON, null, 2));
    }

    getState() {
        return this._loadJSON(this.stateFile);
    }

    // ── 메타데이터 ──

    getHeight() { return this.meta.latestHeight; }
    getLatestHash() { return this.meta.latestHash; }
    getGenesisHash() { return this.meta.genesisHash; }
    getMeta() { return { ...this.meta }; }

    // ── 블록 범위 로드 (싱크용) ──

    getBlockRange(fromHeight, toHeight) {
        const blocks = [];
        const end = Math.min(toHeight, this.meta.latestHeight);
        for (let h = fromHeight; h <= end; h++) {
            const block = this.getBlock(h);
            if (block) blocks.push(block);
        }
        return blocks;
    }

    // ── 유틸 ──

    _loadJSON(file) {
        if (!fs.existsSync(file)) return null;
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    }

    _saveMeta() {
        fs.writeFileSync(this.metaFile, JSON.stringify(this.meta, null, 2));
    }

    // 체인 존재 여부
    hasChain() { return this.meta.latestHeight >= 0; }

    // 초기화 (위험: 전체 삭제)
    reset() {
        if (fs.existsSync(this.blocksDir)) {
            fs.readdirSync(this.blocksDir).forEach(f =>
                fs.unlinkSync(path.join(this.blocksDir, f)));
        }
        if (fs.existsSync(this.stateFile)) fs.unlinkSync(this.stateFile);
        this.meta = { latestHeight: -1, latestHash: '0'.repeat(64), genesisHash: null, totalTransactions: 0, createdAt: Date.now() };
        this._saveMeta();
    }
}

module.exports = { ChainStorage };
