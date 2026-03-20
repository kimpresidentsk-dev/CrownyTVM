// ═══════════════════════════════════════════════════════════════
// chain/genesis.js — 제네시스 블록 생성 + 마이그레이션 (Phase 1.5)
// CrownyCell Chain
//
// 기존 CrownyTVM users.json + cells.json 에서
// 초기 잔액과 계정을 제네시스 블록으로 인코딩
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { Block } = require('./block');
const { Transaction } = require('./transaction');
const { CrownyCell, SLOT, TX_TYPE } = require('./cell');
const { generateKeypair, deterministicKeypair, publicKeyToAddress, encryptPrivateKey, sha256hex } = require('./crypto');
const { StateManager } = require('./state');

// ── 토큰 총 공급량 ──
const TOTAL_SUPPLY = {
    CRN: 2_310_000_000,   // 23.1B × 10% 유통
    FNC: 7_770_000_000,   // 77.7B × 10% 유통
    CRM: 7_770_000_000,   // 77.7B × 10% 유통
};

// Treasury 주소 (체인 운영자)
const TREASURY_SEED = 'treasury:crowny-cell-chain:genesis';

function createGenesisBlock(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    const usersFile = path.join(dataDir, 'users.json');
    const cellsFile = path.join(dataDir, 'cells.json');

    // ── Treasury 키페어 생성 ──
    const treasuryKp = deterministicKeypair('treasury', sha256hex(TREASURY_SEED));
    const treasuryAddr = publicKeyToAddress(treasuryKp.publicKey);

    const block = new Block();
    block.height = 0;
    block.previousHash = '0'.repeat(64);
    block.timestamp = Date.now();
    block.proposerPubKey = treasuryKp.publicKey;

    const state = new StateManager();
    const migrations = []; // { username, address, keypair, balances }

    // ── 기존 사용자 마이그레이션 ──
    let users = {};
    if (fs.existsSync(usersFile)) {
        try { users = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch {}
    }

    // 기존 거래에서 잔액 계산
    let cells = [];
    if (fs.existsSync(cellsFile)) {
        try { cells = JSON.parse(fs.readFileSync(cellsFile, 'utf8')); } catch {}
    }

    // 사용자별 잔액 집계 (기존 server.js getWallet 로직)
    const userBalances = {};
    for (const cell of cells) {
        if (cell.type === 404 && cell.owner && !cell.deleted) { // TY.TRANSACTION = 404
            const username = cell.owner;
            if (!userBalances[username]) userBalances[username] = { CRN: 0, FNC: 0, CRM: 0 };
            const currency = cell.currency || 'CRM';
            const val = cell.value || 0;
            const txType = cell.txType;
            if (['receive', 'deposit', 'swap_in'].includes(txType)) {
                userBalances[username][currency] = (userBalances[username][currency] || 0) + val;
            } else if (['send', 'withdraw', 'swap_out'].includes(txType)) {
                userBalances[username][currency] = (userBalances[username][currency] || 0) - val;
            }
        }
    }

    // offchainBalances도 포함
    for (const [username, user] of Object.entries(users)) {
        if (!userBalances[username]) userBalances[username] = { CRN: 0, FNC: 0, CRM: 0 };
        // offchain balances (CRTD, CRAC 등)은 별도 처리 — 향후 토큰 확장
    }

    let allocatedCRN = 0, allocatedFNC = 0, allocatedCRM = 0;

    for (const [username, user] of Object.entries(users)) {
        if (username.startsWith('_') || !user.password) continue; // 시스템 계정 스킵

        // 결정론적 키페어 (username + password hash)
        const passHash = user.password || '';
        const kp = deterministicKeypair(username, passHash);
        const addr = publicKeyToAddress(kp.publicKey);

        const bal = userBalances[username] || { CRN: 0, FNC: 0, CRM: 0 };
        // 음수 잔액 보정
        if (bal.CRN < 0) bal.CRN = 0;
        if (bal.FNC < 0) bal.FNC = 0;
        if (bal.CRM < 0) bal.CRM = 0;

        // 계정 등록 트랜잭션
        const regCell = new CrownyCell();
        regCell.set(SLOT.SUBJECT, addr);
        regCell.set(SLOT.PREDICATE, TX_TYPE.REGISTER);
        regCell.set(SLOT.OBJECT, username); // 사용자명 기록
        regCell.set(SLOT.TIMESTAMP, block.timestamp);
        regCell.set(SLOT.LAYER, 0); // nonce 0
        const regTx = new Transaction(regCell, kp.publicKey);
        regTx.sign(kp.privateKey);
        block.addTransaction(regTx);

        // 초기 잔액 할당 (Treasury → User)
        for (const [currency, amount] of Object.entries(bal)) {
            if (amount > 0) {
                const txCell = CrownyCell.createTransfer(treasuryAddr, addr, amount, currency, 0, 'genesis');
                txCell.set(SLOT.TIMESTAMP, block.timestamp);
                const tx = new Transaction(txCell, treasuryKp.publicKey);
                tx.sign(treasuryKp.privateKey);
                block.addTransaction(tx);
            }
        }

        allocatedCRN += bal.CRN;
        allocatedFNC += bal.FNC;
        allocatedCRM += bal.CRM;

        migrations.push({
            username,
            address: addr,
            oldAddress: user.walletAddress || null,
            balances: { ...bal },
            publicKey: kp.publicKey.toString('hex'),
        });
    }

    // ── Treasury 초기 잔액 (총 공급량 - 배분량) ──
    const treasuryAccount = state.getAccount(treasuryAddr);
    treasuryAccount.balances.CRN = TOTAL_SUPPLY.CRN;
    treasuryAccount.balances.FNC = TOTAL_SUPPLY.FNC;
    treasuryAccount.balances.CRM = TOTAL_SUPPLY.CRM;

    // 사용자 잔액 적용 (Treasury에서 차감)
    for (const m of migrations) {
        const acct = state.getAccount(m.address);
        acct.balances = { ...m.balances };
        treasuryAccount.balances.CRN -= m.balances.CRN;
        treasuryAccount.balances.FNC -= m.balances.FNC;
        treasuryAccount.balances.CRM -= m.balances.CRM;
    }

    // 블록 완성
    block.computeMerkleRoot();
    block.stateRoot = state.stateRoot();
    block.signAsProposer(treasuryKp.privateKey);

    return {
        block,
        state,
        treasury: {
            address: treasuryAddr,
            publicKey: treasuryKp.publicKey.toString('hex'),
            // 비밀키는 암호화하여 별도 저장
        },
        migrations,
        stats: {
            users: migrations.length,
            transactions: block.transactions.length,
            allocated: { CRN: allocatedCRN, FNC: allocatedFNC, CRM: allocatedCRM },
        },
    };
}

module.exports = { createGenesisBlock, TOTAL_SUPPLY };
