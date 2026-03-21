// ===== send.js - CrownyTVM 독립 모드 호환 =====
// 실제 전송은 wallet.js의 ctvmSendToken()에서 처리

let selectedToken = null;

function selectToken(tokenType) {
    selectedToken = tokenType;
    document.querySelectorAll('.token-card').forEach(card => card.classList.remove('selected'));
    const card = document.getElementById('token-card-' + tokenType);
    if (card) card.classList.add('selected');
}

async function showSendModal() {
    // CrownyTVM 독립 모드: 지갑 페이지의 송금 폼으로 안내
    const sendTo = document.getElementById('send-to');
    if (sendTo) sendTo.focus();
}

async function sendTokensByEmail() {
    if (typeof showToast === 'function') showToast(t('send.use_username', 'Crowny Network transfers are sent by username'), 'info');
}
