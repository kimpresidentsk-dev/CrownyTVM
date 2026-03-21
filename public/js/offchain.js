// ===== offchain.js - CrownyTVM 독립 모드 호환 =====
// Crowny Network에서는 온체인/오프체인 구분 없이 CRN/FNC/CRM 3토큰 체계

const DEFAULT_OFFCHAIN_TOKENS = {
    crtd: { name: 'CRTD', get fullName() { return t('token.crtd','Trading Dollar'); }, icon: '', color: '#C4841D', isDefault: true },
    crac: { name: 'CRAC', get fullName() { return t('token.crac','Art Credit'); }, icon: '', color: '#8B6914', isDefault: true },
    crgc: { name: 'CRGC', get fullName() { return t('token.crgc','Goods & Giving'); }, icon: '', color: '#5A9A6E', isDefault: true },
    creb: { name: 'CREB', get fullName() { return t('token.creb','Eco Bio'); }, icon: '', color: '#5B7B8C', isDefault: true }
};

function getTokenRate(tokenKey) {
    return (window.OFFCHAIN_RATES && window.OFFCHAIN_RATES[tokenKey]) || window.OFFCHAIN_RATE || 100;
}

let OFFCHAIN_TOKEN_REGISTRY = { ...DEFAULT_OFFCHAIN_TOKENS };
let OFFCHAIN_TOKENS_LIST = Object.keys(DEFAULT_OFFCHAIN_TOKENS);
const OFFCHAIN_TOKEN_NAMES = {};

async function loadTokenRegistry() {
    // CrownyTVM 독립 모드: 기본 토큰만 사용
    OFFCHAIN_TOKENS_LIST = Object.keys(OFFCHAIN_TOKEN_REGISTRY);
    for (const [key, info] of Object.entries(OFFCHAIN_TOKEN_REGISTRY)) {
        OFFCHAIN_TOKEN_NAMES[key] = `${info.name} (${info.fullName})`;
    }
}

function getTokenInfo(tokenKey) {
    return OFFCHAIN_TOKEN_REGISTRY[tokenKey] || { name: tokenKey.toUpperCase(), fullName: '', icon: '', color: '#6B5744' };
}

function isOffchainToken(tokenKey) {
    return OFFCHAIN_TOKENS_LIST.includes((tokenKey || '').toLowerCase());
}

function startOffchainListener() { /* no-op in independent mode */ }

// 호환 함수들 — 독립 모드에서는 서버 API로 처리됨
async function showOffchainSendModal() {
    if (typeof showToast === 'function') showToast(t('offchain.use_send','Please use the send feature on Crowny Network'), 'info');
}

async function sendOffchainPoints() { /* no-op */ }
function updateBridgePreview() { /* no-op */ }
async function executeBridge() { /* no-op */ }
async function earnOffchainPoints(tokenKey, amount, reason) {
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (!token) return false;
        const res = await fetch('/api/wallet/earn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ token: tokenKey, amount, reason })
        });
        return res.ok;
    } catch(e) { console.warn('earnOffchainPoints error:', e); return false; }
}
async function spendOffchainPoints(tokenKey, amount, reason) {
    try {
        const token = localStorage.getItem('crowny_token') || localStorage.getItem('ctvm_token');
        if (!token) return false;
        const res = await fetch('/api/wallet/spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ token: tokenKey, amount, reason })
        });
        return res.ok;
    } catch(e) { console.warn('spendOffchainPoints error:', e); return false; }
}
async function autoGivingPoolContribution() { /* no-op */ }
async function redeemCoupon() { /* no-op */ }

// 호환: swapTokens는 wallet.js의 ctvmSwapToken으로 대체됨
