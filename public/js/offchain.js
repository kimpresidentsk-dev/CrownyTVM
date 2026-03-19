// ===== offchain.js - CrownyTVM 독립 모드 호환 =====
// Crowny Network에서는 온체인/오프체인 구분 없이 CRN/FNC/CRM 3토큰 체계

const DEFAULT_OFFCHAIN_TOKENS = {
    crtd: { name: 'CRTD', get fullName() { return '트레이딩 달러'; }, icon: '📈', color: '#C4841D', isDefault: true },
    crac: { name: 'CRAC', get fullName() { return '아트 크레딧'; }, icon: '🎭', color: '#8B6914', isDefault: true },
    crgc: { name: 'CRGC', get fullName() { return '굿즈 & 기빙'; }, icon: '🛒', color: '#6B8F3C', isDefault: true },
    creb: { name: 'CREB', get fullName() { return '에코 바이오'; }, icon: '🌱', color: '#5B7B8C', isDefault: true }
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
    return OFFCHAIN_TOKEN_REGISTRY[tokenKey] || { name: tokenKey.toUpperCase(), fullName: '', icon: '🪙', color: '#6B5744' };
}

function isOffchainToken(tokenKey) {
    return OFFCHAIN_TOKENS_LIST.includes((tokenKey || '').toLowerCase());
}

function startOffchainListener() { /* no-op in independent mode */ }

// 호환 함수들 — 독립 모드에서는 서버 API로 처리됨
async function showOffchainSendModal() {
    if (typeof showToast === 'function') showToast('Crowny Network에서는 송금 기능을 이용하세요', 'info');
}

async function sendOffchainPoints() { /* no-op */ }
function updateBridgePreview() { /* no-op */ }
async function executeBridge() { /* no-op */ }
async function earnOffchainPoints() { return false; }
async function spendOffchainPoints() { return false; }
async function autoGivingPoolContribution() { /* no-op */ }
async function redeemCoupon() { /* no-op */ }

// 호환: swapTokens는 wallet.js의 ctvmSwapToken으로 대체됨
