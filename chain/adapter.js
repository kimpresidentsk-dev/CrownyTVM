// ═══════════════════════════════════════════════════════════════
// chain/adapter.js — server.js ↔ CrownyCell Chain 어댑터
//
// 보안 수정: C1(키 캐시 TTL), C2(폴백 제거), C3(Treasury 환경변수),
//           H6(보너스 제거), H7(deposit 관리자 인증)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { CrownyCellNode, crypto } = require('./index');
const { Transaction } = require('./transaction');
const { CrownyCell } = require('./cell');
const { TxIndexer } = require('./indexer');

let chainNode = null;
let txIndexer = null;

// C1 FIX: 키 캐시에 TTL 적용 (5분), 사용 후 주기적 정리
const KEY_CACHE_TTL = 5 * 60 * 1000;
let userKeypairs = {}; // username → { kp, expires }
function _cleanKeyCache() {
    const now = Date.now();
    for (const [u, entry] of Object.entries(userKeypairs)) {
        if (entry.expires < now) delete userKeypairs[u];
    }
}
setInterval(_cleanKeyCache, 60000);

// C3 FIX: Treasury 시드를 환경변수 또는 파일에서 로드 (하드코딩 금지)
let _treasurySeed = null;
function _getTreasurySeed() {
    if (_treasurySeed) return _treasurySeed;
    // 우선순위: 환경변수 > 파일 > 에러
    if (process.env.CROWNY_TREASURY_SEED) {
        _treasurySeed = process.env.CROWNY_TREASURY_SEED;
    } else {
        const fs = require('fs');
        const path = require('path');
        const seedFile = path.join(__dirname, '..', 'data', 'chain', '.treasury-seed');
        if (fs.existsSync(seedFile)) {
            _treasurySeed = fs.readFileSync(seedFile, 'utf8').trim();
        } else {
            // 최초 실행 시 랜덤 생성 후 파일 저장
            _treasurySeed = require('crypto').randomBytes(32).toString('hex');
            const dir = path.dirname(seedFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(seedFile, _treasurySeed, { mode: 0o600 });
            console.log('[CHAIN] Treasury seed generated and saved to', seedFile);
        }
    }
    return _treasurySeed;
}

function _getTreasuryKeypair() {
    const seed = _getTreasurySeed();
    return crypto.deterministicKeypair('treasury', crypto.sha256hex(seed));
}

// ── 체인 초기화 ──

function initChain(options = {}) {
    if (chainNode) return chainNode;
    const kp = options.keypair || crypto.generateKeypair();
    chainNode = new CrownyCellNode({
        dataDir: options.dataDir,
        keypair: kp,
        solo: true,
    });
    if (!chainNode.chain.storage.hasChain()) {
        chainNode.chain.initialize({ dataDir: options.legacyDataDir });
    } else {
        chainNode.chain._loadState();
    }
    chainNode.chain.proposerKeypair = kp;
    chainNode.chain.start();

    // 인덱서 초기화 + 기존 블록 인덱싱
    txIndexer = new TxIndexer(options.dataDir);
    const indexed = txIndexer.catchUp(chainNode.chain.storage);
    if (indexed > 0) console.log('[CHAIN-ADAPTER] Indexed', indexed, 'transactions from existing blocks');

    // 새 블록 생성 시 자동 인덱싱
    chainNode.chain.on('block', (data) => {
        if (txIndexer && data.height != null) {
            const block = chainNode.chain.getBlock(data.height);
            if (block) txIndexer.indexBlock(block);
        }
    });

    console.log('[CHAIN-ADAPTER] CrownyCell Chain initialized. Height:', chainNode.chain.getHeight());
    return chainNode;
}

function getChain() { return chainNode; }

// ── 사용자 키페어 관리 ──

function getUserKeypair(username, passwordHash) {
    // C2 FIX: passwordHash 필수 — 없으면 에러 (username 폴백 제거)
    if (!passwordHash) {
        // 캐시에 있으면 사용
        if (userKeypairs[username] && userKeypairs[username].expires > Date.now()) {
            return userKeypairs[username].kp;
        }
        throw new Error('passwordHash required for key derivation');
    }
    // C1 FIX: TTL 적용
    const cached = userKeypairs[username];
    if (cached && cached.expires > Date.now()) return cached.kp;

    const kp = crypto.deterministicKeypair(username, passwordHash);
    userKeypairs[username] = { kp, expires: Date.now() + KEY_CACHE_TTL };
    return kp;
}

function getUserAddress(username) {
    // 주소만 필요할 때: 캐시된 키 사용, 없으면 키 없이 불가
    const cached = userKeypairs[username];
    if (cached && cached.expires > Date.now()) {
        return crypto.publicKeyToAddress(cached.kp.publicKey);
    }
    // 폴백: 주소 조회 불가 시 빈 문자열
    return '';
}

// ── 로그인 시 호출: 키페어 캐시 준비 ──

function onUserLogin(username, passwordHash) {
    if (!chainNode || !passwordHash) return;
    try {
        const kp = getUserKeypair(username, passwordHash);
        const addr = crypto.publicKeyToAddress(kp.publicKey);
        // H6 FIX: 웰컴 보너스 제거 (체인 외부 상태 변조 금지)
        // 보너스가 필요하면 관리자가 deposit API로 지급
    } catch {}
}

// ── getWallet 호환 함수 ──

function chainGetWallet(username) {
    if (!chainNode) return null;

    const cached = userKeypairs[username];
    const addr = cached ? crypto.publicKeyToAddress(cached.kp.publicKey) : '';
    if (!addr) return null;

    const acct = chainNode.chain.state.getAccount(addr);
    const balances = { ...acct.balances };
    if (balances.CRN < 0) balances.CRN = 0;
    if (balances.FNC < 0) balances.FNC = 0;
    if (balances.CRM < 0) balances.CRM = 0;

    const baseRates = { CRN: 25500, FNC: 2550, CRM: 25.5 };
    const variation = 1 + (Math.random() * 0.04 - 0.02);
    const prices = {
        CRN: Math.round(baseRates.CRN * variation * 100) / 100,
        FNC: Math.round(baseRates.FNC * variation * 100) / 100,
        CRM: Math.round(baseRates.CRM * variation * 100) / 100,
    };

    // 인덱서에서 거래 내역 조회
    const transactions = txIndexer ? txIndexer.getWalletTransactions(addr, 30) : [];

    return {
        wallet: null,
        walletAddress: addr,
        username,
        balances,
        prices,
        totalKRW: Math.round(balances.CRN * prices.CRN + balances.FNC * prices.FNC + balances.CRM * prices.CRM),
        transactions,
        chainHeight: chainNode.chain.getHeight(),
        nonce: acct.nonce,
    };
}

// ── walletTransact 호환 함수 ──

function chainWalletTransact(username, type, amount, toUser, memo, currency) {
    if (!chainNode) return null;
    currency = currency || 'CRN';
    if (!['CRN', 'FNC', 'CRM'].includes(currency)) return { error: 'invalid currency' };
    // Q7 FIX: 정수 변환 (float 정밀도 방지)
    amount = Math.round(amount * 1000) / 1000;
    if (amount <= 0) return { error: 'amount must be positive' };

    let fromKp;
    try { fromKp = getUserKeypair(username); } catch { return null; } // 캐시 없으면 레거시 폴백

    if (type === 'send' && toUser) {
        let toKp;
        try { toKp = getUserKeypair(toUser); } catch { return { error: 'recipient not logged in' }; }
        const toAddr = crypto.publicKeyToAddress(toKp.publicKey);
        const result = chainNode.transfer(fromKp, toAddr, amount, currency, memo || `send to ${toUser}`);
        if (!result.success) return { error: result.error };
        chainNode.chain._produceBlock();
        const wallet = chainGetWallet(username);
        return { success: true, txnId: result.hash, type, amount, currency, balances: wallet.balances };
    }

    if (type === 'deposit') {
        // H7 FIX: deposit은 내부 전용 (server.js에서 관리자 체크 후 호출해야 함)
        const treasuryKp = _getTreasuryKeypair();
        const treasuryAddr = crypto.publicKeyToAddress(treasuryKp.publicKey);
        const fromAddr = crypto.publicKeyToAddress(fromKp.publicKey);
        const treasuryAcct = chainNode.chain.state.getAccount(treasuryAddr);
        const nonce = treasuryAcct.nonce + 1;
        // mempool pending nonce 반영
        let maxNonce = treasuryAcct.nonce;
        for (const [, ptx] of chainNode.chain.mempool) {
            if (ptx.from === treasuryAddr && ptx.nonce > maxNonce) maxNonce = ptx.nonce;
        }
        const txCell = CrownyCell.createTransfer(treasuryAddr, fromAddr, amount, currency, maxNonce + 1, memo || 'deposit');
        const tx = new Transaction(txCell, treasuryKp.publicKey);
        tx.sign(treasuryKp.privateKey);
        const result = chainNode.chain.submitTransaction(tx);
        if (!result.success) return { error: result.error };
        chainNode.chain._produceBlock();
        const wallet = chainGetWallet(username);
        return { success: true, txnId: result.hash, type, amount, currency, balances: wallet.balances };
    }

    if (type === 'withdraw') {
        const treasuryKp = _getTreasuryKeypair();
        const treasuryAddr = crypto.publicKeyToAddress(treasuryKp.publicKey);
        const result = chainNode.transfer(fromKp, treasuryAddr, amount, currency, memo || 'withdraw');
        if (!result.success) return { error: result.error };
        chainNode.chain._produceBlock();
        const wallet = chainGetWallet(username);
        return { success: true, txnId: result.hash, type, amount, currency, balances: wallet.balances };
    }

    return { error: `unknown type: ${type}` };
}

// ── swapTokens 호환 함수 ──

function chainSwapTokens(username, fromCurrency, toCurrency, amount) {
    if (!chainNode) return null;
    // Q7 FIX: 정수 변환
    amount = Math.round(amount * 1000) / 1000;
    if (amount <= 0) return { error: 'amount must be positive' };

    const allowed = { 'CRM->FNC': true, 'FNC->CRN': true };
    if (!allowed[`${fromCurrency}->${toCurrency}`]) return { error: `swap ${fromCurrency} → ${toCurrency} not allowed` };

    let fromKp;
    try { fromKp = getUserKeypair(username); } catch { return null; }

    const result = chainNode.swap(fromKp, fromCurrency, toCurrency, amount);
    if (!result.success) return { error: result.error };
    chainNode.chain._produceBlock();

    const wallet = chainGetWallet(username);
    const rates = { 'CRM:FNC': 100, 'FNC:CRN': 10 };
    const received = Math.floor((amount / rates[`${fromCurrency}:${toCurrency}`]) * 1000) / 1000;

    return {
        success: true,
        sent: amount, sentCurrency: fromCurrency,
        received, receivedCurrency: toCurrency,
        slippage: 0,
        balances: wallet.balances,
    };
}

// ── 체인 상태 API ──

function getChainStatus() {
    if (!chainNode) return { running: false, error: 'chain not initialized' };
    return chainNode.getStatus();
}

function getChainBlock(height) {
    if (!chainNode) return null;
    return chainNode.chain.getBlock(height);
}

module.exports = {
    initChain, getChain,
    getUserKeypair, getUserAddress,
    chainGetWallet, chainWalletTransact, chainSwapTokens,
    getChainStatus, getChainBlock,
    onUserLogin,
};
